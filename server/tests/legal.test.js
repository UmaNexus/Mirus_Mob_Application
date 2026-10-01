import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';

test('GET /privacy-policy returns 200 OK HTML with mandatory Google Play disclosures', async () => {
  const res = await request(app).get('/privacy-policy');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);

  // Validate Google Play essential disclosures
  assert.ok(res.text.includes('MIRUS Field Force'), 'Must mention app name');
  assert.ok(res.text.includes('com.umanexus.fieldforce'), 'Must mention package name');
  assert.ok(res.text.includes('UmaNexus'), 'Must mention developer name');
  assert.ok(res.text.includes('Mirus Med Sciences'), 'Must mention entity/company name');
  assert.ok(res.text.includes('User Credentials'), 'Must disclose credentials collection');
  assert.ok(res.text.includes('Attendance & Punch Records'), 'Must disclose attendance collection');
  assert.ok(res.text.includes('push notification', 'Must disclose push tokens'));
  assert.ok(res.text.includes('Account & Data Deletion'), 'Must mention data deletion mechanism');
  assert.ok(res.text.includes('privacy@umanexus.com'), 'Must provide privacy contact email');
});

test('GET /account-deletion returns 200 OK HTML with deletion instructions', async () => {
  const res = await request(app).get('/account-deletion');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.ok(res.text.includes('Account & Data Deletion Instructions'));
  assert.ok(res.text.includes('privacy@umanexus.com'));
});

test('GET /terms returns 200 OK HTML with terms of service', async () => {
  const res = await request(app).get('/terms');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.ok(res.text.includes('Terms of Service'));
});

test('GET /api/privacy-policy returns 200 OK JSON with metadata', async () => {
  const res = await request(app).get('/api/privacy-policy');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /json/);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.packageName, 'com.umanexus.fieldforce');
  assert.ok(Array.isArray(res.body.data.collectedDataTypes));
});
