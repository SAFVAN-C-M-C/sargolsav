import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import app from '../src/config/app.js';
import { createAdminRouter } from '../src/routes/admin.js';
import { updateAdminClaim } from '../src/auth/adminClaims.js';

let server;
let baseUrl;
let verify;
let verifiedTokens;

before(async () => {
  const testApp = express();
  verifiedTokens = [];
  verify = async (token) => {
    verifiedTokens.push(token);
    if (token === 'invalid') throw Object.assign(new Error('token secret'), { code: 'auth/invalid-id-token' });
    if (token === 'expired') throw Object.assign(new Error('token secret'), { code: 'auth/id-token-expired' });
    if (token === 'revoked') throw Object.assign(new Error('token secret'), { code: 'auth/id-token-revoked' });
    if (token === 'unavailable') throw new Error('credential secret');
    if (token === 'empty-uid') return { uid: '', admin: true };
    if (token === 'non-admin') return { uid: 'member-1', admin: false };
    if (token === 'string-claim') return { uid: 'member-1', admin: 'true' };
    return {
      uid: 'trusted-firebase-uid', admin: true, email: 'admin@example.test',
      email_verified: true, firebase: { sign_in_provider: 'password' },
    };
  };
  testApp.use('/api/admin', createAdminRouter(verify));
  server = testApp.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function request(authorization) {
  const response = await fetch(`${baseUrl}/api/admin/me`, {
    headers: authorization ? { Authorization: authorization } : {},
  });
  return { response, body: await response.json() };
}

test('production route requires a token while both health endpoints remain public', async () => {
  const live = app.listen(0, '127.0.0.1');
  try {
    await once(live, 'listening');
    const root = `http://127.0.0.1:${live.address().port}`;
    const admin = await fetch(`${root}/api/admin/me`);
    assert.equal(admin.status, 401);
    assert.deepEqual(await admin.json(), { error: 'Authentication required' });
    const health = await fetch(`${root}/api/health`);
    assert.equal(health.status, 200);
    const databaseHealth = await fetch(`${root}/api/health/db`);
    assert.notEqual(databaseHealth.status, 401);
    assert.notEqual(databaseHealth.status, 403);
    await databaseHealth.arrayBuffer();
  } finally {
    live.closeAllConnections();
    await new Promise((resolve) => live.close(resolve));
  }
});

test('missing and malformed bearer headers return 401 without verification', async () => {
  for (const header of [undefined, 'Basic abc', 'Bearer', 'Bearer a b', 'Bearer a,b']) {
    const { response, body } = await request(header);
    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: 'Authentication required' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(verifiedTokens, []);
});

test('invalid, expired and revoked ID tokens return sanitized 401', async () => {
  for (const token of ['invalid', 'expired', 'revoked', 'empty-uid']) {
    const { response, body } = await request(`Bearer ${token}`);
    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: 'Invalid or expired token' });
    assert.doesNotMatch(JSON.stringify(body), /secret|credential|Bearer/i);
  }
});

test('verified users without the boolean admin claim receive 403', async () => {
  for (const token of ['non-admin', 'string-claim']) {
    const { response, body } = await request(`Bearer ${token}`);
    assert.equal(response.status, 403);
    assert.deepEqual(body, { error: 'Admin access required' });
  }
});

test('verified admin sees only safe identity fields from the verified token', async () => {
  const { response, body } = await request('Bearer valid-admin');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(body, {
    uid: 'trusted-firebase-uid', admin: true, email: 'admin@example.test', emailVerified: true,
  });
  assert.equal(verifiedTokens.at(-1), 'valid-admin');
});

test('verification infrastructure failure returns sanitized 503', async () => {
  const { response, body } = await request('Bearer unavailable');
  assert.equal(response.status, 503);
  assert.deepEqual(body, { error: 'Authentication unavailable' });
});

test('incomplete service-account configuration returns a sanitized API error', async () => {
  const previousEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const previousKey = process.env.FIREBASE_PRIVATE_KEY;
  process.env.FIREBASE_CLIENT_EMAIL = '';
  process.env.FIREBASE_PRIVATE_KEY = 'sensitive-test-value';
  const live = app.listen(0, '127.0.0.1');
  try {
    await once(live, 'listening');
    const response = await fetch(`http://127.0.0.1:${live.address().port}/api/admin/me`, {
      headers: { Authorization: 'Bearer opaque-token' },
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body, { error: 'Authentication unavailable' });
    assert.doesNotMatch(JSON.stringify(body), /sensitive-test-value|FIREBASE_PRIVATE_KEY/);
  } finally {
    live.closeAllConnections();
    await new Promise((resolve) => live.close(resolve));
    if (previousEmail === undefined) delete process.env.FIREBASE_CLIENT_EMAIL;
    else process.env.FIREBASE_CLIENT_EMAIL = previousEmail;
    if (previousKey === undefined) delete process.env.FIREBASE_PRIVATE_KEY;
    else process.env.FIREBASE_PRIVATE_KEY = previousKey;
  }
});

test('manual claim update preserves unrelated claims and revokes sessions on removal', async () => {
  const calls = [];
  const auth = {
    async getUser(uid) { calls.push(['get', uid]); return { customClaims: { staff: true, admin: false } }; },
    async setCustomUserClaims(uid, claims) { calls.push(['set', uid, claims]); },
    async revokeRefreshTokens(uid) { calls.push(['revoke', uid]); },
  };
  await updateAdminClaim(auth, 'existing-uid', 'grant');
  assert.deepEqual(calls, [
    ['get', 'existing-uid'], ['set', 'existing-uid', { staff: true, admin: true }],
  ]);
  calls.length = 0;
  await updateAdminClaim(auth, 'existing-uid', 'revoke');
  assert.deepEqual(calls, [
    ['get', 'existing-uid'], ['set', 'existing-uid', { staff: true }], ['revoke', 'existing-uid'],
  ]);
  await assert.rejects(updateAdminClaim(auth, '', 'grant'), /Invalid UID/);
  await assert.rejects(updateAdminClaim(auth, 'existing-uid', 'other'), /Invalid action/);
});
