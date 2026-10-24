import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import app from '../src/config/app.js';
import { createCandidateService, resolveCandidate } from '../src/services/candidates.js';
import { serveCandidates } from '../test-support/candidates-http.js';

const body = { candidate_code: '001', name: 'Candidate', unit_id: '2', category_id: '3' };
const endpoints = [['/1/candidates', 'POST', body], ['/1/candidates', 'GET'],
  ['/1/candidates/lookup?candidate_code=001', 'GET'], ['/1/candidates/4', 'GET'], ['/1/candidates/4', 'PATCH', { name: 'Corrected' }]];

test('candidate endpoints enforce Firebase admin auth before database access', async () => {
  let calls = 0;
  const service = createCandidateService({ transaction: async () => { calls++; throw new Error('private'); } });
  await serveCandidates(service, async (request) => {
    for (const [path, method, value] of endpoints) {
      for (const [token, status] of [[null, 401], ['invalid', 401], ['expired', 401], ['revoked', 401], ['member', 403], ['string-admin', 403], ['unavailable', 503]]) {
        const response = await request(path, method, value, token);
        assert.equal(response.status, status);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.doesNotMatch(JSON.stringify(response.body), /private|stack/);
      }
    }
  });
  assert.equal(calls, 0);
});

test('candidate HTTP validation and immutable identity reject invalid input before SQL', async () => {
  let calls = 0;
  const service = createCandidateService({ transaction: async () => { calls++; } });
  await serveCandidates(service, async (request) => {
    for (const value of [null, [], {}, { ...body, candidate_code: 1 }, { ...body, candidate_code: ' ' },
      { ...body, candidate_code: 'a\0b' }, { ...body, name: '' }, { ...body, name: 'a\0b' },
      { ...body, unit_id: '01' }, { ...body, category_id: '9223372036854775808' },
      { ...body, madrasa_id: 4 }, { ...body, actor_ref: 'spoof' }, { ...body, competition_id: '2' }]) {
      assert.equal((await request('/1/candidates', 'POST', value)).status, 400);
    }
    for (const value of [{ candidate_code: '002' }, { unit_id: '3' }, { category_id: '4' }, { madrasa_id: null }, { name: 'Valid', uid: 'spoof' }]) {
      assert.equal((await request('/1/candidates/4', 'PATCH', value)).status, 400);
    }
    for (const path of ['/0/candidates', '/1/candidates/01', '/1/candidates?unit_id=0',
      '/1/candidates?unit_id=2&unit_id=3', '/1/candidates?category_id=NaN', '/1/candidates?status=published',
      '/1/candidates/lookup', '/1/candidates/lookup?candidate_code=', '/1/candidates/lookup?candidate_code=a&extra=b']) {
      assert.equal((await request(path)).status, 400, path);
    }
  });
  await assert.rejects(resolveCandidate(() => { calls++; }, { competition_id: '1', ...body }, ''), { status: 400 });
  assert.equal(calls, 0);
});

test('candidate failures are sanitized at HTTP boundary', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const [code, status] of [[undefined, 500], ['23503', 409], ['23505', 409]]) {
    const service = createCandidateService({ transaction: async () => { throw Object.assign(new Error('private SQL credentials'), { code }); } });
    await serveCandidates(service, async (request) => {
      for (const [path, method, value] of endpoints) {
        const response = await request(path, method, value);
        assert.equal(response.status, status);
        assert.doesNotMatch(JSON.stringify(response.body), /private|SQL|credentials/);
      }
    });
  }
});

test('production mounts candidate APIs with admin auth and has no public candidate API', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (const [path, method] of endpoints) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/competitions${path}`, { method });
      assert.equal(response.status, 401); await response.arrayBuffer();
    }
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/competitions/1/candidates`, { method: 'POST' });
    assert.equal(response.status, 404); await response.arrayBuffer();
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
