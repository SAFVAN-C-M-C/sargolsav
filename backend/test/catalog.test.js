import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import app from '../src/config/app.js';
import { createCatalogService, CatalogError } from '../src/services/catalog.js';
import { serveCatalogs } from '../test-support/catalog-http.js';

const endpoints = [
  ['/1/categories', 'POST', { name: 'Category' }], ['/1/categories', 'GET'], ['/1/categories/2', 'GET'],
  ['/1/categories/2', 'PATCH', { name: 'Edited category' }], ['/1/categories/2', 'DELETE'],
  ['/1/categories/2/events', 'POST', { name: 'Event' }], ['/1/categories/2/events', 'GET'],
  ['/1/categories/2/events/3', 'GET'], ['/1/categories/2/events/3', 'PATCH', { name: 'Edited Event' }],
  ['/1/categories/2/events/3', 'DELETE'],
];

test('TKT-05C validates required names, immutable parents and IDs before any database work', async () => {
  let calls = 0;
  const service = createCatalogService({ transaction: async () => { calls++; throw new Error('must not query'); } });
  const params = { competitionId: '1', categoryId: '2', eventId: '3' };
  const invalid = (promise) => assert.rejects(promise, (error) => error instanceof CatalogError && error.status === 400);
  for (const resource of Object.values(service)) {
    for (const body of [undefined, null, [], {}, { name: '' }, { name: '\t\n ' }, { name: 4 }, { name: null },
      { name: false }, { name: ['Category'] }, { name: 'a\0b' }, { name: 'Valid', competition_id: '2' },
      { name: 'Valid', category_id: '3' }, { name: 'Valid', actor_ref: 'spoof' }, { name: 'Valid', id: '4' }]) {
      await invalid(resource.create(params, body, 'actor'));
      await invalid(resource.update(params, body, 'actor'));
    }
    for (const id of [undefined, '', 1, '0', '-1', '01', '1.5', '1e2', '1 OR 1=1', '9223372036854775808', '99999999999999999999999']) {
      for (const [method, body] of [['create', { name: 'Valid' }], ['list'], ['get'], ['update', { name: 'Valid' }], ['remove']]) {
        const badCompetition = { ...params, competitionId: id };
        await invalid(method === 'remove' ? resource.remove(badCompetition, 'actor') : resource[method](badCompetition, body, 'actor'));
      }
      await invalid(resource.get({ ...params, categoryId: id }));
      await invalid(resource.remove({ ...params, categoryId: id }, 'actor'));
    }
  }
  for (const id of [undefined, '0', '01', '9223372036854775808']) {
    await invalid(service.events.get({ ...params, eventId: id }));
    await invalid(service.events.list({ ...params, categoryId: id }));
    await invalid(service.events.create({ ...params, categoryId: id }, { name: 'Valid' }, 'actor'));
  }
  assert.equal(calls, 0);
});

test('category and event sort order and partial-update validation happen before database work', async () => {
  let calls = 0;
  const reachedDatabase = new Error('Validated request reached database');
  const service = createCatalogService({ transaction: async () => { calls++; throw reachedDatabase; } });
  const params = { competitionId: '1', categoryId: '2', eventId: '3' };
  for (const resource of Object.values(service)) {
    for (const sort_order of [-1, 0.5, '1', null, true, [], {}, 2147483648, Infinity, NaN]) {
      for (const method of ['create', 'update']) {
        await assert.rejects(resource[method](params, { name: 'Custom name', sort_order }, 'actor'),
          (e) => e instanceof CatalogError && e.status === 400);
      }
    }
    assert.equal(calls, 0);
  }
  for (const resource of Object.values(service)) {
    for (const sort_order of [0, 2147483647]) {
      await assert.rejects(resource.create(params, { name: 'Custom name', sort_order }, 'actor'), (e) => e === reachedDatabase);
      await assert.rejects(resource.update(params, { sort_order }, 'actor'), (e) => e === reachedDatabase);
    }
  }
  assert.equal(calls, 8);
});

test('all ten catalog endpoints reject missing, invalid and non-admin tokens before persistence', async () => {
  let calls = 0;
  const service = createCatalogService({ transaction: async () => { calls++; throw new Error('must not query'); } });
  await serveCatalogs(service, async (request) => {
    for (const [path, method, body] of endpoints) {
      for (const [token, expected] of [[null, 401], ['invalid', 401], ['expired', 401], ['revoked', 401],
        ['member', 403], ['string-admin', 403], ['unavailable', 503]]) {
        const result = await request(path, method, body, token);
        assert.equal(result.status, expected, `${method} ${path}`);
        assert.equal(result.headers.get('cache-control'), 'no-store');
        assert.doesNotMatch(JSON.stringify(result.body), /private|credential|stack/i);
      }
    }
  });
  assert.equal(calls, 0);
});

test('production application mounts all catalog endpoints behind Firebase authorization', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (const [path, method] of endpoints) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/competitions${path}`, { method });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'Authentication required' });
    }
    const publicMutation = await fetch(`http://127.0.0.1:${server.address().port}/api/competitions/1/categories`, { method: 'POST' });
    assert.equal(publicMutation.status, 404);
    await publicMutation.arrayBuffer();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP validation, database failures and constraint failures have consistent sanitized responses', async (t) => {
  const logs = t.mock.method(console, 'error', () => {});
  const failure = new Error('SELECT password FROM secret; postgres://credential; internal stack');
  const service = createCatalogService({ transaction: async () => { throw failure; } });
  await serveCatalogs(service, async (request) => {
    for (const [path, method, body] of endpoints) {
      const result = await request(path, method, body);
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, { error: 'Internal server error' });
    }
    assert.equal((await request('/01/categories')).status, 400);
    assert.equal((await request('/1/categories/0')).status, 400);
    assert.equal((await request('/1/categories/2/events/01')).status, 400);
    assert.equal((await request('/1/categories', 'POST', {})).status, 400);
    assert.equal((await request('/1/categories/2', 'PATCH', { name: 'Changed', competition_id: '4' })).status, 400);
    assert.equal((await request('/1/categories/2/events/3', 'PATCH', { name: 'Changed', category_id: '4' })).status, 400);
  });
  assert.equal(logs.mock.calls.length, 10);
  for (const call of logs.mock.calls) assert.deepEqual(call.arguments, ['API request failed']);
  for (const code of ['23505', '23503']) {
    await serveCatalogs(createCatalogService({ transaction: async () => {
      throw Object.assign(new Error('private SQL constraint name'), { code });
    } }), async (request) => {
      for (const [path, method, body] of endpoints.filter(([, method]) => ['POST', 'PATCH', 'DELETE'].includes(method))) {
        const result = await request(path, method, body);
        assert.equal(result.status, 409);
        assert.doesNotMatch(JSON.stringify(result.body), /private|SQL|constraint/i);
        if (code === '23503' && method === 'DELETE') assert.match(result.body.error, /referenced by dependent records/);
      }
    });
  }
});
