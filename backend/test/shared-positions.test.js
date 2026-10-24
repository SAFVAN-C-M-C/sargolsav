import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import app from '../src/config/app.js';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createResultLifecycleService, createPublicResultService } from '../src/services/resultLifecycle.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

const base = '/api/admin/competitions/1/categories/2/events/3';
const paths = [`${base}/result-draft/shared-positions`, `${base}/result/corrections/4/shared-positions`];
const version = '123:20261024000000.000000';
const a = { candidate_code: '001', name: 'Winner', unit_id: '5', position: 1 };
const b = { ...a, candidate_code: '002' };
const body = { version, shared_positions: true, reason: 'Judges confirmed the equal winning marks', entries: [a,b] };
const services = (db) => ({ drafts: createResultDraftService(db), lifecycle: createResultLifecycleService(db), publicResults: createPublicResultService(db) });

test('shared-position endpoints require the existing verified admin claim, with no additional role', async () => {
  let calls = 0;
  await serveResultLifecycle(services({ transaction: async () => { calls++; } }), async (request) => {
    for (const path of paths) {
      for (const [token, status] of [[null,401],['invalid',401],['expired',401],['revoked',401],['member',403],['string-admin',403],['unavailable',503]]) {
        const response = await request(path, 'PUT', body, token);
        assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.doesNotMatch(JSON.stringify(response.body), /private|credentials|stack/);
      }
    }
  });
  assert.equal(calls, 0);
  const callsReceived = [];
  await serveResultLifecycle({ drafts: { save: async (...args) => { callsReceived.push(args); return {}; } },
    lifecycle: { saveCorrection: async (...args) => { callsReceived.push(args); return {}; } } }, async (request) => {
    for (const path of paths) assert.equal((await request(path, 'PUT', body, 'reviewer')).status, 200);
  });
  assert.ok(callsReceived.every((args) => args[2] === 'verified-reviewer' && args[3] === true));
});

test('explicit flag, meaningful reason, duplicate candidates and malformed entries validate before database access', async () => {
  let calls = 0;
  await serveResultLifecycle(services({ transaction: async () => { calls++; } }), async (request) => {
    for (const path of paths) {
      const invalid = [null, [], {}, { ...body, shared_positions: false }, { ...body, shared_positions: 'true' },
        { ...body, shared_positions: 1 }, { ...body, version: '' }, { ...body, entries: [a,a] },
        { ...body, entries: [{ ...a, position: 0 },b] }, { ...body, entries: [{ ...a, override_audit_id: '6' },b] },
        { ...body, actor_ref: 'spoof' }, { ...body, admin: true }, { ...body, reviewed_by: 'spoof' },
        { version, entries: [a,b], reason: body.reason }, { version, shared_positions: true, entries: [a,b] }];
      for (const reason of ['', ' ', 'Tie', 'a b', '........ ........', 'OneUnbrokenWordOfExplanation', null, 7, {}, [], 'bad\0reason', `Two words ${'a'.repeat(1001)}`]) invalid.push({ ...body, reason });
      for (const value of invalid) assert.equal((await request(path, 'PUT', value)).status, 400, JSON.stringify(value));
      const ordinary = path.replace('/shared-positions', '');
      assert.equal((await request(ordinary, 'PUT', { version, entries: [a,b] })).status, 400);
      assert.equal((await request(ordinary, 'PUT', body)).status, 400);
      assert.equal((await request(path.replace('/1/', '/01/'), 'PUT', body)).status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('shared-position persistence and constraint errors use sanitized HTTP responses', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const [code, expected] of [[undefined,500],['23503',409],['23505',409],['40001',409],['40P01',409]]) {
    await serveResultLifecycle(services({ transaction: async () => { throw Object.assign(new Error('private SQL credentials'), { code }); } }), async (request) => {
      for (const path of paths) {
        const response = await request(path, 'PUT', body);
        assert.equal(response.status, expected); assert.doesNotMatch(JSON.stringify(response.body), /private|SQL|credentials/);
      }
    });
  }
});

test('production protects both override routes and exposes no public mutation equivalent', async () => {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    for (const path of paths) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'PUT' });
      assert.equal(response.status, 401); await response.arrayBuffer();
      const publicResponse = await fetch(`http://127.0.0.1:${server.address().port}${path.replace('/api/admin/', '/api/')}`, { method: 'PUT' });
      assert.equal(publicResponse.status, 404); await publicResponse.arrayBuffer();
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
