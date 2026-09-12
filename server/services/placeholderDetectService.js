import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';

const ROOT = process.cwd();

const resolveAbs = (relOrAbs) => {
  if (!relOrAbs) return null;
  const candidates = [
    path.resolve(ROOT, relOrAbs),
    path.resolve(relOrAbs)
  ];
  for (const abs of candidates) {
    if (fs.existsSync(abs)) return abs;
  }
  return null;
};

/** Unique {{placeholder}} keys from a string, preserving first-seen order. */
export const detectPlaceholdersInText = (text = '') => {
  const seen = new Set();
  const keys = [];
  for (const m of String(text).matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    const key = String(m[1] || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  const labelPatterns = [
    { key: 'employeeName', regex: /\b(?:Employee\s*(?:Name|Full\s*Name)|Name)\s*:\s*[_\s]+/i },
    { key: 'amount', regex: /\bAmount\s*:\s*[_\s]+/i },
    { key: 'reason', regex: /\bReason\s*:\s*[_\s]+/i },
    { key: 'lastWorkingDay', regex: /\bLast\s*Working\s*Day\s*:\s*[_\s]+/i },
    { key: 'date', regex: /\bDate\s*:\s*[_\s]+/i }
  ];
  for (const item of labelPatterns) {
    if (item.regex.test(String(text))) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        keys.push(item.key);
      }
    }
  }
  return keys;
};

/**
 * Pull letter title + body paragraphs from flattened PDF text.
 * Strips leading letterhead chrome before the title and a trailing Director footer.
 */
export const bodyParagraphsFromExtractedText = (rawText = '', fallbackTitle = 'APPOINTMENT LETTER') => {
  let text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!text) return { title: fallbackTitle, bodyParagraphs: [] };

  const titleRe = /\b(APPOINTMENT\s+LETTER|OFFER\s+(?:OF\s+EMPLOYMENT|LETTER)|SERVICE\s+CERTIFICATE|FULL\s*&\s*FINAL[^\s]*)\b/i;
  const titleMatch = text.match(titleRe);
  let title = fallbackTitle;
  let body = text;
  if (titleMatch) {
    title = titleMatch[0].replace(/\s+/g, ' ').trim().toUpperCase();
    body = text.slice(titleMatch.index + titleMatch[0].length).trim();
  }

  // Drop signature / director trailer often present in designed templates.
  body = body.replace(/\bDirector\b[\s\S]*$/i, '').trim();

  // Prefer splitting at greeting / known section heads.
  const chunks = [];
  const sectionSplit = body.split(
    /(?=(?:Dear\s+\{\{)|(?:Date of Joining)|(?:Your assigned reporting)|(?:Please carry all))/i
  );
  for (const chunk of sectionSplit) {
    const c = chunk.trim();
    if (!c) continue;
    // Keep known section titles on their own line.
    const knownHeading = c.match(/^(Date of Joining\s*&\s*Initial Training:)\s*(.*)$/i);
    if (knownHeading) {
      chunks.push(knownHeading[1].replace(/\s+/g, ' ').trim());
      const rest = String(knownHeading[2] || '').trim();
      if (rest) chunks.push(rest);
      continue;
    }
    // Further split long runs on sentence boundaries when no placeholders mid-sentence issue.
    if (c.length > 280 && !/\{\{/.test(c.slice(120))) {
      for (const sentence of c.split(/(?<=\.)\s+(?=[A-Z])/)) {
        const s = sentence.trim();
        if (s) chunks.push(s);
      }
    } else {
      chunks.push(c);
    }
  }

  const bodyParagraphs = (chunks.length ? chunks : [body]).map((s) => s.trim()).filter(Boolean);
  return { title, bodyParagraphs };
};

/**
 * Extract text + {{placeholders}} (+ optional body) from a template PDF.
 * @param {string} relOrAbs - repo-relative or absolute PDF path
 */
export const extractLetterTemplateFromPdf = async (relOrAbs) => {
  const abs = resolveAbs(relOrAbs);
  if (!abs) {
    return {
      text: '',
      placeholders: [],
      title: null,
      bodyParagraphs: [],
      hasAcroForms: false,
      acroFormFields: []
    };
  }

  const bytes = await fsp.readFile(abs);
  let hasAcroForms = false;
  let acroFormFields = [];
  try {
    const doc = await PDFDocument.load(bytes);
    const fields = doc.getForm().getFields();
    hasAcroForms = fields.length > 0;
    acroFormFields = fields.map((f) => f.getName()).filter(Boolean);
  } catch {
    /* ignore form parse errors */
  }

  let text = '';
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const extracted = await extractText(pdf, { mergePages: true });
    text = String(extracted?.text || '').trim();
  } catch {
    text = '';
  }

  const placeholders = [
    ...new Set([
      ...detectPlaceholdersInText(text),
      ...acroFormFields
    ])
  ];
  const { title, bodyParagraphs } = bodyParagraphsFromExtractedText(text);

  return {
    text,
    placeholders,
    title,
    bodyParagraphs,
    hasAcroForms,
    acroFormFields
  };
};

/**
 * Locate text runs that contain {{placeholders}}, with page coordinates
 * (PDF user space, origin bottom-left — same as pdf-lib).
 */
export const locatePlaceholderTextRuns = async (relOrAbs) => {
  const abs = resolveAbs(relOrAbs);
  if (!abs) return { pageWidth: 595.2, pageHeight: 841.89, runs: [] };

  const bytes = await fsp.readFile(abs);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const runs = [];
  let pageWidth = 595.2;
  let pageHeight = 841.89;

  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    if (pageIndex === 0) {
      pageWidth = viewport.width;
      pageHeight = viewport.height;
    }
    const content = await page.getTextContent();
    const pageRuns = [];
    for (const item of content.items || []) {
      const str = String(item?.str || '');
      if (!str.includes('{{')) continue;
      const tr = item.transform || [1, 0, 0, 1, 0, 0];
      const fontSize = Math.hypot(tr[0], tr[1]) || Number(item.height) || 12;
      pageRuns.push({
        pageIndex,
        str,
        x: tr[4],
        y: tr[5],
        fontSize,
        width: Number(item.width) || fontSize * str.length * 0.5,
        height: Number(item.height) || fontSize,
        placeholders: detectPlaceholdersInText(str)
      });
    }

    pageRuns.sort((a, b) => a.y - b.y || a.x - b.x);
    const merged = [];
    for (const run of pageRuns) {
      const prev = merged[merged.length - 1];
      const sameLine = prev && prev.pageIndex === run.pageIndex && Math.abs(prev.y - run.y) <= 1.2;
      const adjacent = prev && run.x >= prev.x && (run.x - (prev.x + prev.width)) <= 6;
      if (sameLine && adjacent) {
        prev.str = `${prev.str}${run.str}`;
        prev.width = Math.max(prev.width, run.x + run.width - prev.x);
        prev.placeholders = [...new Set([...prev.placeholders, ...run.placeholders])];
      } else {
        merged.push(run);
      }
    }
    runs.push(...merged);
  }

  return { pageWidth, pageHeight, runs };
};

/** True when the PDF text layer contains at least one {{placeholder}}. */
export const pdfHasTextPlaceholders = async (relOrAbs) => {
  const { runs } = await locatePlaceholderTextRuns(relOrAbs);
  return runs.length > 0;
};
