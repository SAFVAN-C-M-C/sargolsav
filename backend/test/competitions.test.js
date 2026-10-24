import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import app from '../src/config/app.js';
import { CompetitionError, createCompetitionService, validatePoints } from '../src/services/competitions.js';
import { serveCompetitions } from './helpers/competitions-http.js';

const endpoints = [
  ['', 'POST', { code: 'demo', name: 'Demo' }], ['', 'GET'], ['/1', 'GET'],
  ['/1', 'PATCH', { name: 'Edited' }], ['/1/status', 'PATCH', { status: 'active' }],
  ['/1/settings', 'GET'], ['/1/settings', 'PUT', { position_points: { 1: 5 } }],
];

test('every competition endpoint requires a verified boolean admin claim before database work', async () => {
  let called = 0;
  const fail = async () => { called++; throw new Error('must not be reached'); };
  await serveCompetitions(createCompetitionService({ runQuery: fail, transaction: fail }), async (request) => {
    for (const [path, method, body] of endpoints) {
      for (const [token, status] of [[null, 401], ['invalid', 401], ['member', 403], ['string-admin', 403], ['unavailable', 503]]) {
        const result = await request(path, method, body, token);
        assert.equal(result.status, status);
        assert.equal(result.headers.get('cache-control'), 'no-store');
        assert.doesNotMatch(JSON.stringify(result.body), /secret|credential|stack/i);
      }
    }
  });
  assert.equal(called, 0);
});

test('production app mounts all competition endpoints behind authentication', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (const [path, method] of endpoints) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/competitions${path}`, { method });
      assert.equal(response.status, 401);
      await response.arrayBuffer();
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('strict validation rejects invalid bodies, unknown fields, bigint IDs and points before persistence', async () => {
  let calls = 0;
  const fail = async () => { calls++; throw new Error('must not persist'); };
  const service = createCompetitionService({ runQuery: fail, transaction: fail });
  const rejects = (operation) => assert.rejects(operation, (e) => e instanceof CompetitionError && e.status === 400);
  for (const body of [null, [], {}, { name: 'Only name' }, { code: '', name: 'Name' },
    { code: 'c', name: 7 }, { code: 'c', name: ' ' }, { code: 'c', name: 'a\0b' },
    { code: 'c', name: 'n', status: 'active' }, { code: 'c', name: 'n', actor_ref: 'spoof' }]) {
    await rejects(service.create(body, 'actor'));
  }
  for (const body of [{}, { status: 'active' }, { competition_id: '2' }, { name: null }, { code: 2 }]) {
    await rejects(service.update('1', body, 'actor'));
  }
  for (const id of ['0', '-1', '01', '1.5', '1 OR 1=1', '9223372036854775808', '99999999999999999999']) {
    await rejects(service.get(id));
    await rejects(service.updateSettings(id, { position_points: {} }, 'actor'));
  }
  for (const status of ['published', 'ACTIVE', null, {}, '__proto__']) {
    await rejects(service.updateStatus('1', { status }, 'actor'));
  }
  for (const points of [null, [], 3, '5', { 0: 5 }, { '01': 5 }, { '-1': 5 }, { '1.5': 5 },
    { 2147483648: 1 }, { '9999999999999999999999': 5 }, { 1: -1 }, { 1: 2.5 }, { 1: '5' },
    { 1: null }, { 1: true }, { 1: Infinity }, { 1: NaN }, { 1: Number.MAX_SAFE_INTEGER + 1 }]) {
    await rejects(service.updateSettings('1', { position_points: points }, 'actor'));
  }
  await rejects(service.updateSettings('1', { position_points: {}, event_id: '2' }, 'actor'));
  validatePoints({});
  validatePoints({ 1: 0, 2: 5, 2147483647: Number.MAX_SAFE_INTEGER });
  assert.equal(calls, 0);
});

test('HTTP validation and errors use sanitized JSON responses', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const failure = new Error('SELECT password FROM secret; postgres://credential; internal stack');
  const fail = async () => { throw failure; };
  await serveCompetitions(createCompetitionService({ runQuery: fail, transaction: fail }), async (request) => {
    for (const [path, method, body] of endpoints) {
      const result = await request(path, method, body);
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, { error: 'Internal server error' });
    }
    assert.equal((await request('/01')).status, 400);
    assert.equal((await request('', 'POST', { code: 'demo' })).status, 400);
    assert.equal((await request('/1', 'DELETE')).status, 404);
  });
  assert.equal(logged.mock.calls.length, endpoints.length);
  for (const call of logged.mock.calls) assert.deepEqual(call.arguments, ['API request failed']);
  await serveCompetitions(createCompetitionService({ transaction: async () => {
    throw Object.assign(new Error('private index name'), { code: '23505' });
  } }), async (request) => {
    const result = await request('', 'POST', { code: 'demo', name: 'Demo' });
    assert.equal(result.status, 409);
    assert.deepEqual(result.body, { error: 'Competition code already exists' });
  });
});
