import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import app from '../src/config/app.js';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { serveResultDrafts } from '../test-support/result-drafts-http.js';

const path = '/1/categories/2/events/3/result-draft';
const version = '123:20261024123456.123456';
const entry = { candidate_code: '001', name: 'Winner', unit_id: '4', position: 1 };
const endpoints = [[path, 'POST', {}], [path, 'GET'], [path, 'PUT', { version, entries: [entry] }],
  ['/1/result-statuses', 'GET'], ['/1/categories/2/result-statuses', 'GET']];

test('all result draft/status endpoints enforce verified Firebase admin before SQL', async () => {
  let calls = 0;
  const service = createResultDraftService({ transaction: async () => { calls++; } });
  await serveResultDrafts(service, async (request) => {
    for (const [url, method, body] of endpoints) {
      for (const [token, status] of [[null, 401], ['invalid', 401], ['expired', 401], ['revoked', 401], ['member', 403], ['string-admin', 403], ['unavailable', 503]]) {
        const response = await request(url, method, body, token);
        assert.equal(response.status, status);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.doesNotMatch(JSON.stringify(response.body), /private|credential|stack/i);
      }
    }
  });
  assert.equal(calls, 0);
});

test('draft payloads, duplicate codes/positions, identity fields and IDs validate before SQL', async () => {
  let calls = 0;
  const service = createResultDraftService({ transaction: async () => { calls++; } });
  await serveResultDrafts(service, async (request) => {
    const invalidBodies = [null, [], {}, { entries: [] }, { version, entries: {} }, { version: '', entries: [] },
      { version, entries: [], actor_ref: 'spoof' }, { version, entries: [], status: 'published' },
      { version, entries: [entry, entry] }, { version, entries: [entry, { ...entry, candidate_code: '002' }] }];
    for (const change of [{ candidate_code: 1 }, { candidate_code: '' }, { candidate_code: 'a\0b' }, { name: ' ' },
      { name: 'a\0b' }, { unit_id: 4 }, { unit_id: '0' }, { madrasa_id: '01' }, { position: '1' },
      { position: 0 }, { position: -1 }, { position: 1.5 }, { position: 2147483648 }, { category_id: '5' },
      { competition_id: '6' }, { candidate_id: '7' }, { override_audit_id: '8' }]) {
      invalidBodies.push({ version, entries: [{ ...entry, ...change }] });
    }
    invalidBodies.push({ version, entries: [null] });
    for (const body of invalidBodies) assert.equal((await request(path, 'PUT', body)).status, 400, JSON.stringify(body));
    for (const body of [null, [], { entries: [] }, { actor_ref: 'spoof' }, { status: 'draft' }]) {
      assert.equal((await request(path, 'POST', body)).status, 400);
    }
    for (const url of ['/01/categories/2/events/3/result-draft', '/1/categories/0/events/3/result-draft',
      '/1/categories/2/events/9223372036854775808/result-draft', '/1/result-statuses?category_id=0',
      '/1/result-statuses?category_id=2&category_id=3', '/1/result-statuses?status=draft', '/1/categories/2/result-statuses?category_id=2']) {
      assert.equal((await request(url)).status, 400, url);
    }
  });
  assert.equal(calls, 0);
});

test('draft errors are sanitized and database concurrency conflicts return 409', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const [code, status] of [[undefined, 500], ['23503', 409], ['23505', 409], ['40001', 409], ['40P01', 409]]) {
    const service = createResultDraftService({ transaction: async () => { throw Object.assign(new Error('private SQL credentials'), { code }); } });
    await serveResultDrafts(service, async (request) => {
      for (const [url, method, body] of endpoints) {
        const response = await request(url, method, body);
        assert.equal(response.status, status);
        assert.doesNotMatch(JSON.stringify(response.body), /private|SQL|credentials/);
      }
    });
  }
});

test('production mounts draft/status APIs securely and exposes no public result draft endpoint', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (const [url, method] of endpoints) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/competitions${url}`, { method });
      assert.equal(response.status, 401); await response.arrayBuffer();
    }
    for (const method of ['GET', 'POST', 'PUT']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/competitions${path}`, { method });
      assert.equal(response.status, 404); await response.arrayBuffer();
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
