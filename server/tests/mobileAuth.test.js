import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { createCompany, createUser } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('a normal (web) login never receives a raw token in the response body', async () => {
  const company = await createCompany({ slug: 'mobile-auth-web' });
  await createUser({ companyId: company._id, email: 'web@xyz.com', password: 'Password1' });

  const res = await request(app).post('/api/auth/login').send({ companySlug: company.slug, email: 'web@xyz.com', password: 'Password1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.token, undefined);
  assert.ok(res.headers['set-cookie'], 'web login must still set the auth cookie');
});

test('a login carrying X-Client: mobile receives a usable Bearer token, cookie behavior unchanged', async () => {
  const company = await createCompany({ slug: 'mobile-auth-app' });
  await createUser({ companyId: company._id, email: 'app@xyz.com', password: 'Password1' });

  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Client', 'mobile')
    .send({ companySlug: company.slug, email: 'app@xyz.com', password: 'Password1' });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.ok(res.headers['set-cookie'], 'the cookie is still set even for a mobile login (harmless, ignored by the app)');

  // The returned token must itself authenticate a request with no cookie at all.
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'app@xyz.com');
});

test('a failed mobile login still returns the same generic error, no token leaked', async () => {
  const company = await createCompany({ slug: 'mobile-auth-fail' });
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Client', 'mobile')
    .send({ companySlug: company.slug, email: 'nobody@xyz.com', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.token, undefined);
});
