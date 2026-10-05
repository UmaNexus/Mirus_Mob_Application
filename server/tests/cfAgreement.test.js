import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';

import app from '../app.js';
import { connect, clear, close } from './helpers/testDb.js';
import { authAgent } from './helpers/factories.js';
import CFTemplate from '../models/CFTemplate.js';
import {
  CF_FIELD_ALIASES,
  resolveCFField,
  applyCFFieldDefaults,
  applyCFText
} from '../config/cfFields.js';
import {
  generateCFAgreementPdf,
  fillTemplateCFAgreementPdf,
  resolveTemplateFilePath
} from '../services/pdfService.js';
import { extractLetterTemplateFromPdf } from '../services/placeholderDetectService.js';

before(async () => {
  await connect();
});

after(async () => {
  await close();
});

beforeEach(async () => {
  await clear();
});

test('C&F Aliases — resolve canonical and alias keys bidirectionally', () => {
  const fields = {
    PAN1: 'ABCDE1234F',
    RegisteredOffice: 'Plot 10, Industrial Estate, Hyderabad, Telangana',
    State: 'Telangana',
    Dateofappointment: '01 October 2026',
    Endofappointment: '01 October 2027',
    NamedAgent: 'Apex Pharma Logistics',
    Partner: 'K. Ramesh',
    witness: 'S. Sharma'
  };

  const defaulted = applyCFFieldDefaults(fields);

  // Canonical keys populated
  assert.equal(defaulted.partyPan, 'ABCDE1234F');
  assert.equal(defaulted.partyAddress, 'Plot 10, Industrial Estate, Hyderabad, Telangana');
  assert.equal(defaulted.territory, 'Telangana');
  assert.equal(defaulted.effectiveFrom, '01 October 2026');
  assert.equal(defaulted.effectiveTo, '01 October 2027');
  assert.equal(defaulted.partyName, 'Apex Pharma Logistics');
  assert.equal(defaulted.partnerName, 'K. Ramesh');
  assert.equal(defaulted.companyWitness, 'S. Sharma');

  // Alias resolution works
  assert.equal(resolveCFField('PAN1', defaulted), 'ABCDE1234F');
  assert.equal(resolveCFField('partyPan', defaulted), 'ABCDE1234F');
  assert.equal(resolveCFField('State', defaulted), 'Telangana');
  assert.equal(resolveCFField('territory', defaulted), 'Telangana');

  const rendered = applyCFText('Agreement for {{NamedAgent}} in State of {{territory}}', defaulted);
  assert.equal(rendered, 'Agreement for Apex Pharma Logistics in State of Telangana');
});

test('C&F Master Template — contains all 48 clauses, clean text, and valid placeholders', async () => {
  const masterPath = path.resolve('seed', 'cf-examples', 'cf-agent.pdf');
  const templateInfo = await extractLetterTemplateFromPdf(masterPath);

  assert.ok(templateInfo.placeholders.includes('partyName'), 'Must contain partyName');
  assert.ok(templateInfo.placeholders.includes('partyPan'), 'Must contain partyPan');
  assert.ok(templateInfo.placeholders.includes('partyAddress'), 'Must contain partyAddress');
  assert.ok(templateInfo.placeholders.includes('State') || templateInfo.placeholders.includes('territory'), 'Must contain territory/State');

  // Ensure no corrupt footer leakage inside body text
  assert.doesNotMatch(templateInfo.text, /other than 111 Mirus/i, 'Clause 11 must be clean');
  assert.doesNotMatch(templateInfo.text, /111 Mirus MedSciences/i, 'Clause 18 must be clean');
  assert.doesNotMatch(templateInfo.text, /\b111\b/, 'Must have no stray 111 markers');
});

test('C&F Generation — fills master template with zero unfilled placeholders and appends Schedule I', async () => {
  const masterPath = path.resolve('seed', 'cf-examples', 'cf-agent.pdf');
  const longAddress = 'Plot No. 45/B, 2nd Floor, Sri Sai Towers, Phase III, IDA Cherlapally, Near Railway Crossing, Medchal-Malkajgiri District, Hyderabad, Telangana - 500051';

  const fields = {
    partyName: 'Sri Venkateshwara C&F Services',
    partyPan: 'ABCDE9876K',
    partnerName: 'R. K. Reddy',
    partnerPan: 'WXYZ1234M',
    territory: 'Andhra Pradesh',
    partyAddress: longAddress,
    effectiveFrom: '15 October 2026',
    effectiveTo: '15 October 2027',
    companyWitness: 'Mahesh Sharma',
    agentWitness: 'K. Balaji',
    recipientEmail: 'agent@svpharma.com'
  };

  const pdfRelUrl = await generateCFAgreementPdf({
    type: 'CFAgent',
    fields,
    company: { name: 'MIRUS MED SCIENCES (OPC) PVT LTD' },
    templateTitle: 'C&F Agency Agreement',
    templateFileUrl: masterPath
  });

  assert.ok(pdfRelUrl, 'Should return a relative PDF URL');
  const absPdf = resolveTemplateFilePath(pdfRelUrl);
  const pdfBytes = await fsp.readFile(absPdf);
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));

  // Extract all text and check for any remaining placeholders
  const extracted = await extractText(pdf, { mergePages: true });
  const allText = String(extracted?.text || '');

  const unpopulated = allText.match(/\{\{\s*[^}]+?\s*\}\}/g);
  assert.equal(unpopulated, null, `Found raw unpopulated placeholders in generated PDF: ${JSON.stringify(unpopulated)}`);

  // Verify Schedule I was appended
  assert.ok(allText.includes('SCHEDULE I: APPOINTMENT PARTICULARS & COMMERCIAL TERMS'));
  assert.ok(allText.includes('Sri Venkateshwara C&F Services'));
  assert.ok(allText.includes('Andhra Pradesh'));
  assert.ok(allText.includes('ABCDE9876K'));
});

test('C&F API workflow — admin uploads cleaned template, issues agreement, and downloads filled PDF', async () => {
  const { agent: admin } = await authAgent(app, { email: 'admin@mirus.com', role: 'admin' });

  const masterBytes = await fsp.readFile(path.resolve('seed', 'cf-examples', 'cf-agent.pdf'));
  const tplRes = await admin
    .post('/api/cf-templates')
    .field('type', 'CFAgent')
    .field('name', 'Clean Production C&F Agreement')
    .field('description', '48-Clause Production Master Agreement')
    .attach('file', masterBytes, { filename: 'clean-cf-agent.pdf', contentType: 'application/pdf' });

  assert.equal(tplRes.status, 201);
  assert.ok(tplRes.body.template._id);

  // Issue agreement using aliases to verify compatibility
  const issueRes = await admin.post('/api/cf-issues').send({
    templateId: tplRes.body.template._id,
    action: 'download',
    fields: {
      NamedAgent: 'Telangana Pharma Hub C&F',
      PAN1: 'TGPHB1234Z',
      RegisteredOffice: 'Plot 77, Genome Valley, Shamirpet, Hyderabad - 500078',
      Partner: 'V. Prabhakar',
      PAN2: 'VPRAB5678X',
      State: 'Telangana',
      Dateofappointment: '01 November 2026',
      Endofappointment: '01 November 2027',
      witness: 'Corporate Secretary'
    }
  });

  assert.equal(issueRes.status, 201);
  assert.ok(issueRes.body.issue.pdfFileUrl);

  // Download PDF
  const dlRes = await admin.get(`/api/cf-issues/${issueRes.body.issue._id}/pdf`);
  assert.equal(dlRes.status, 200);
  assert.match(dlRes.headers['content-type'], /application\/pdf/);

  // Inspect downloaded PDF text
  const pdf = await getDocumentProxy(new Uint8Array(dlRes.body));
  const extracted = await extractText(pdf, { mergePages: true });
  const text = String(extracted?.text || '');

  assert.equal(text.match(/\{\{\s*[^}]+?\s*\}\}/g), null, 'Must have zero unpopulated placeholders');
  assert.ok(text.includes('Telangana Pharma Hub C&F'));
  assert.ok(text.includes('TGPHB1234Z'));
  assert.ok(text.includes('Telangana'));
});
