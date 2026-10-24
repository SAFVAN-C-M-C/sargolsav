import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import app from '../src/config/app.js';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createResultLifecycleService, createPublicResultService } from '../src/services/resultLifecycle.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

const root = '/api/admin/competitions/1/categories/2/events/3/result';
const version = '123:20261024000000.000000';
const entry = { candidate_code: '001', name: 'Winner', unit_id: '5', position: 1 };
const endpoints = [[root, 'GET'], [`${root}/review`, 'POST', { version }], [`${root}/return-to-draft`, 'POST', { version }],
  [`${root}/publish`, 'POST', { version }], [`${root}/corrections`, 'POST', { version, reason: 'Fix winner' }],
  [`${root}/corrections/4`, 'GET'], [`${root}/corrections/4`, 'PUT', { version, entries: [entry] }],
  ...['review','return-to-draft','publish'].map((action) => [`${root}/corrections/4/${action}`, 'POST', { version }])];
function services(db) { return { drafts: createResultDraftService(db), lifecycle: createResultLifecycleService(db), publicResults: createPublicResultService(db) }; }

test('all lifecycle and correction endpoints require verified Firebase admin before database work', async () => {
  let calls = 0;
  await serveResultLifecycle(services({ transaction: async () => { calls++; } }), async (request) => {
    for (const [path, method, body] of endpoints) {
      for (const [token, status] of [[null,401],['invalid',401],['expired',401],['revoked',401],['member',403],['string-admin',403],['unavailable',503]]) {
        const result = await request(path, method, body, token);
        assert.equal(result.status, status); assert.equal(result.headers.get('cache-control'), 'no-store');
        assert.doesNotMatch(JSON.stringify(result.body), /private|stack|credentials/);
      }
    }
  });
  assert.equal(calls, 0);
});

test('lifecycle validation rejects malformed tokens, reasons, identity spoofing, IDs and correction payloads before SQL', async () => {
  let calls = 0;
  await serveResultLifecycle(services({ transaction: async () => { calls++; } }), async (request) => {
    for (const [path, method, body] of endpoints.filter(([, method]) => method === 'POST')) {
      for (const value of [null, [], {}, { ...body, version: '' }, { ...body, version: 1 }, { ...body, actor_ref: 'spoof' }, { ...body, status: 'published' }]) {
        assert.equal((await request(path, method, value)).status, 400);
      }
    }
    for (const reason of ['', ' ', null, 2, 'a\0b']) assert.equal((await request(`${root}/corrections`, 'POST', { version, reason })).status, 400);
    for (const value of [{ version, entries: [entry, entry] }, { version, entries: [{ ...entry, position: 0 }] }, { version, entries: [], reason: 'spoof' }]) {
      assert.equal((await request(`${root}/corrections/4`, 'PUT', value)).status, 400);
    }
    for (const path of [root.replace('/1/', '/01/'), `${root}/corrections/0`, `${root}/corrections/9223372036854775808`,
      '/api/competitions/1/results?category_id=0', '/api/competitions/1/results?category_id=2&category_id=3',
      '/api/competitions/1/results?status=draft', '/api/competitions/1/categories/2/results?category_id=3']) {
      assert.equal((await request(path)).status, 400, path);
    }
  });
  assert.equal(calls, 0);
});

test('public routes need no login; lifecycle errors stay sanitized and concurrency errors return 409', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const [code, expected] of [[undefined,500],['23503',409],['23505',409],['40001',409],['40P01',409]]) {
    await serveResultLifecycle(services({ transaction: async () => { throw Object.assign(new Error('private SQL credentials'), { code }); } }), async (request) => {
      for (const [path, method, body] of [...endpoints, ['/api/competitions/1/results','GET'], ['/api/competitions/1/categories/2/results','GET'],
        ['/api/competitions/1/categories/2/events/3/result','GET'], ['/api/competitions/1/categories/2/events/3/result/status','GET']]) {
        const response = await request(path, method, body, path.startsWith('/api/admin') ? 'admin' : null);
        assert.equal(response.status, expected); assert.doesNotMatch(JSON.stringify(response.body), /private|SQL|credentials/);
      }
    });
  }
});

test('production app mounts every lifecycle mutation behind admin authentication', async () => {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    for (const [path, method] of endpoints) {
      const result = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method });
      assert.equal(result.status, 401); await result.arrayBuffer();
    }
    for (const action of ['review','publish','return-to-draft','corrections']) {
      const result = await fetch(`http://127.0.0.1:${server.address().port}${root.replace('/api/admin/', '/api/')}/${action}`, { method: 'POST' });
      assert.equal(result.status, 404); await result.arrayBuffer();
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
