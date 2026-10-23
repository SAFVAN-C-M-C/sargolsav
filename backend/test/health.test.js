import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import app from '../src/config/app.js';

let server;
let baseUrl;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('GET /api/health returns healthy JSON', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { status: 'healthy' });
});

test('unknown API routes return 404 JSON', async () => {
  const response = await fetch(`${baseUrl}/api/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('responses include Helmet security headers', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('x-powered-by'), null);
  await response.arrayBuffer();
});

test('CORS allows configured origins and omits permission for others', async () => {
  const allowedOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
  const allowed = await fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
  const denied = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://untrusted.invalid' },
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  await denied.arrayBuffer();
});

test('malformed JSON returns a safe 400 JSON response', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid request body' });
});

test('JSON and form bodies exceeding the limit return 413', async () => {
  for (const contentType of ['application/json', 'application/x-www-form-urlencoded']) {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'POST', headers: { 'Content-Type': contentType },
      body: contentType === 'application/json'
        ? JSON.stringify({ value: 'x'.repeat(101 * 1024) })
        : `value=${'x'.repeat(101 * 1024)}`,
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Request body too large' });
  }
});
