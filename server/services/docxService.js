import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { resolveTemplateFilePath } from './pdfService.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve();
const CF_ISSUED_DIR = path.resolve('uploads', 'cf-issued');
const CF_TEMPLATE_DIR = path.resolve('uploads', 'cf-templates');

fs.mkdirSync(CF_ISSUED_DIR, { recursive: true });
fs.mkdirSync(CF_TEMPLATE_DIR, { recursive: true });

export const relPath = (abs) => {
  const norm = path.normalize(abs);
  const uploadsIdx = norm.indexOf('uploads');
  if (uploadsIdx !== -1) {
    return norm.slice(uploadsIdx).replace(/\\/g, '/');
  }
  return path.relative(ROOT, abs).replace(/\\/g, '/');
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Format fields and ensure clean fallbacks for all placeholders.
 */
export const formatCFAgreementData = (fields = {}, company = null) => {
  const v = (key, fallback = '') => {
    const val = fields[key];
    if (val === undefined || val === null) return fallback;
    const s = String(val).trim();
    return s.length > 0 ? s : fallback;
  };

  const partyName = v('partyName', 'Partner Agency');
  const partyPan = (v('partyPan') || v('pan') || 'N/A').toUpperCase();
  const partyAddress = v('partyAddress', 'As agreed');
  const partnerName = v('partnerName', partyName);
  const partnerPan = (v('partnerPan') || partyPan).toUpperCase();
  const territory = v('territory', 'Telangana');

  const now = new Date();
  const day = v('agreementDay', String(now.getDate()));
  const month = v('agreementMonth', MONTHS[now.getMonth()]);
  const year = v('agreementYear', String(now.getFullYear()));
  const fullYear = year.length === 2 ? `20${year}` : year;
  const nextYear = String(parseInt(fullYear, 10) + 1);

  const effectiveFrom = v('effectiveFrom', `${day} ${month} ${fullYear}`);
  const effectiveTo = v('effectiveTo', `${day} ${month} ${nextYear}`);
  const effectivePeriod = v('effectivePeriod', `${effectiveFrom} to ${effectiveTo}`);

  const companyName = company?.name || 'MIRUS MED SCIENCES (OPC) PVT LTD';
  const companyAddress = [
    company?.address?.street,
    company?.address?.city,
    company?.address?.state,
    company?.address?.pincode
  ].filter(Boolean).join(', ') || 'Hyderabad, Telangana';

  const companyRepresentative = v('companyRepresentative', company?.authorizedSignatory || 'MAHIPAL REDDY');
  const companyWitness = v('companyWitness', v('witness1', 'Authorized Staff'));
  const agentWitness = v('agentWitness', v('witness2', 'Authorized Witness'));

  const warehouseArea = v('warehouseArea', 'Minimum 1000 sq. ft.');
  const rawDeposit = v('securityDeposit', '50 LAKH (@ 5% p.a. quarterly)');
  const securityDeposit = rawDeposit.startsWith('₹') || rawDeposit.includes('LAKH') ? rawDeposit : `₹ ${rawDeposit}/-`;
  const rawCommission = v('commission', 'Rs. 1 Lakh/month or 1.40% on Net Sales');
  const commission = rawCommission;
  const recipientEmail = v('recipientEmail', '');

  return {
    companyName,
    companyAddress,
    companyRepresentative,
    partyName,
    partyPan,
    partyAddress,
    partnerName,
    partnerPan,
    territory,
    effectiveFrom,
    effectiveTo,
    effectivePeriod,
    companyWitness,
    agentWitness,
    warehouseArea,
    securityDeposit,
    commission,
    recipientEmail,
    agreementDay: day,
    agreementMonth: month,
    agreementYear: fullYear,
    agreementPlace: v('agreementPlace', company?.address?.city || 'Hyderabad')
  };
};

/**
 * Fill a DOCX template using docxtemplater + pizzip.
 * @param {string} templateAbsPath
 * @param {object} data
 * @returns {Promise<Buffer>}
 */
export const renderDocxTemplate = async (templateAbsPath, data, company = null) => {
  const content = await fsp.readFile(templateAbsPath, 'binary');
  const zip = new PizZip(content);

  // Dynamically inject uploaded company stamp/signature if available
  if (company?.branding) {
    const sealRel = company.branding.logoWithStampUrl || company.branding.stampUrl || company.branding.signatureUrl;
    if (sealRel) {
      const candidates = [
        path.resolve(ROOT, sealRel),
        path.resolve(ROOT, '..', sealRel),
        path.resolve('/app', sealRel),
        path.resolve(ROOT, 'uploads', sealRel.replace(/^uploads[/\\]/, '')),
        path.resolve(ROOT, 'server', 'uploads', sealRel.replace(/^uploads[/\\]/, '')),
        path.resolve(ROOT, 'data', 'uploads', sealRel.replace(/^uploads[/\\]/, ''))
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try {
            const sealBytes = await fsp.readFile(cand);
            if (zip.files['word/media/image2.png']) {
              zip.file('word/media/image2.png', sealBytes);
            } else if (zip.files['word/media/image2.jpg']) {
              zip.file('word/media/image2.jpg', sealBytes);
            }
          } catch (e) {
            console.warn('Could not inject company stamp into DOCX:', e);
          }
          break;
        }
      }
    }
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => ''
  });

  doc.render(data);

  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  });
};

/**
 * Convert a DOCX file to PDF using LibreOffice (Linux / Docker) or Word COM (Windows host).
 * @param {string} docxAbsPath
 * @param {string} pdfDestAbsPath
 * @returns {Promise<string>}
 */
export const convertDocxToPdf = async (docxAbsPath, pdfDestAbsPath) => {
  const destDir = path.dirname(pdfDestAbsPath);
  await fsp.mkdir(destDir, { recursive: true });

  // 1. Try LibreOffice CLI
  const sofficeCmd = process.platform === 'win32' ? 'soffice.exe' : 'soffice';
  try {
    const env = { ...process.env, HOME: '/tmp' };
    await execFileAsync(sofficeCmd, ['--headless', '--convert-to', 'pdf', '--outdir', destDir, docxAbsPath], {
      timeout: 60000,
      env
    });
    const baseName = path.basename(docxAbsPath, path.extname(docxAbsPath));
    const generatedPdf = path.join(destDir, `${baseName}.pdf`);
    if (fs.existsSync(generatedPdf)) {
      if (generatedPdf !== pdfDestAbsPath) {
        await fsp.rename(generatedPdf, pdfDestAbsPath);
      }
      return pdfDestAbsPath;
    }
  } catch (sofficeErr) {
    console.warn('LibreOffice conversion failed:', sofficeErr?.message || sofficeErr);
  }

  // 2. On Windows host, try Word COM automation
  if (process.platform === 'win32') {
    try {
      const psScript = `
        $ErrorActionPreference = 'Stop'
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $word.DisplayAlerts = 0
        try {
          $doc = $word.Documents.Open('${docxAbsPath.replace(/\\/g, '/')}')
          $doc.SaveAs('${pdfDestAbsPath.replace(/\\/g, '/')}', 17)
          $doc.Close(0)
        } finally {
          $word.Quit(0)
          [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
        }
      `;
      await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 45000 });
      if (fs.existsSync(pdfDestAbsPath)) {
        return pdfDestAbsPath;
      }
    } catch (winWordErr) {
      console.warn('Word COM conversion failed:', winWordErr.message);
    }
  }

  throw new Error('DOCX to PDF conversion failed: neither LibreOffice nor Word COM could process the document.');
};

/**
 * Locate the best DOCX template.
 * First checks uploaded template if it's a docx.
 * Otherwise uses C_and_F_Agency_Agreement_Template.docx.
 */
export const resolveCFAgreementDocxTemplate = (templateFileUrl) => {
  if (templateFileUrl && /\.docx$/i.test(templateFileUrl)) {
    const resolved = resolveTemplateFilePath(templateFileUrl);
    if (resolved && fs.existsSync(resolved)) return resolved;
  }

  const defaultCandidates = [
    path.resolve(ROOT, 'uploads', 'cf-templates', 'C_and_F_Agency_Agreement_Template.docx'),
    path.resolve(ROOT, 'data', 'uploads', 'cf-templates', 'C_and_F_Agency_Agreement_Template.docx'),
    path.resolve(ROOT, '..', 'data', 'uploads', 'cf-templates', 'C_and_F_Agency_Agreement_Template.docx'),
    path.resolve('/app', 'uploads', 'cf-templates', 'C_and_F_Agency_Agreement_Template.docx')
  ];

  for (const c of defaultCandidates) {
    if (fs.existsSync(c)) return c;
  }

  return null;
};

/**
 * Main entry point: generate both filled DOCX and publication-quality PDF.
 * @returns {Promise<{ docxFileUrl: string, pdfFileUrl: string }>}
 */
export const generateCFAgreementDocxAndPdf = async ({ fields = {}, company = null, templateFileUrl = null }) => {
  const templatePath = resolveCFAgreementDocxTemplate(templateFileUrl);
  if (!templatePath) {
    throw new Error('C&F Agency Agreement DOCX master template not found.');
  }

  const data = formatCFAgreementData(fields, company);
  const docxBuffer = await renderDocxTemplate(templatePath, data, company);

  const uuid = crypto.randomUUID();
  const docxDest = path.join(CF_ISSUED_DIR, `cf-${uuid}.docx`);
  const pdfDest = path.join(CF_ISSUED_DIR, `cf-${uuid}.pdf`);

  await fsp.writeFile(docxDest, docxBuffer);

  // Convert to PDF
  await convertDocxToPdf(docxDest, pdfDest);

  return {
    docxFileUrl: relPath(docxDest),
    pdfFileUrl: relPath(pdfDest),
    partyName: data.partyName
  };
};
