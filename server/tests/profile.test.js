import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent } from './helpers/factories.js';

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('GET /api/profile returns the caller profile', async () => {
  const { agent, user } = await authAgent(app);
  const res = await agent.get('/api/profile');
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, user.email);
  assert.equal(res.body.user.password, undefined);
});

test('PUT /api/profile updates whitelisted fields', async () => {
  const { agent } = await authAgent(app);
  const res = await agent.put('/api/profile').send({ firstName: 'Renamed', phone: '9000000001' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.personalDetails.firstName, 'Renamed');
  assert.equal(res.body.user.contactInfo.personalMobile, '9000000001');
});

test('PUT /api/profile rejects an invalid email', async () => {
  const { agent } = await authAgent(app);
  const res = await agent.put('/api/profile').send({ workEmail: 'not-an-email' });
  assert.equal(res.status, 400);
});

test('change password: wrong current password -> 401', async () => {
  const { agent } = await authAgent(app);
  const res = await agent.patch('/api/profile/password').send({ currentPassword: 'nope', newPassword: 'NewPass123' });
  assert.equal(res.status, 401);
});

test('change password: weak new password -> 400', async () => {
  const { agent } = await authAgent(app);
  const res = await agent.patch('/api/profile/password').send({ currentPassword: 'Password1', newPassword: 'short' });
  assert.equal(res.status, 400);
});

test('change password succeeds and new password works for login', async () => {
  const { agent, user, company } = await authAgent(app);
  const change = await agent.patch('/api/profile/password').send({ currentPassword: 'Password1', newPassword: 'NewPass123' });
  assert.equal(change.status, 200);

  const relog = await request(app).post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password: 'NewPass123' });
  assert.equal(relog.status, 200);
});

test('avatar upload rejects non-image and accepts PNG, then deletes', async () => {
  const { agent } = await authAgent(app);

  const bad = await agent.post('/api/profile/avatar')
    .attach('avatar', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
  assert.equal(bad.status, 400);

  const ok = await agent.post('/api/profile/avatar')
    .attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' });
  assert.equal(ok.status, 200);
  assert.match(ok.body.profilePictureUrl, /\/uploads\/avatars\/.+\.png$/);

  const del = await agent.delete('/api/profile/avatar');
  assert.equal(del.status, 200);
});
