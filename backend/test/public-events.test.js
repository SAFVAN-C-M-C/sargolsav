import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import app from '../src/config/app.js';
import { createPublicCatalogService } from '../src/services/publicCatalog.js';
import { servePublicCatalog } from '../test-support/public-catalog-http.js';

test('public events validate both IDs before SQL and project only safe availability fields', async () => {
  const calls = [];
  const service = createPublicCatalogService({ runQuery: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ category_id: '2', category_name: 'Junior', id: '3', name: 'Recitation', sort_order: 7,
      status: 'published', reviewed_by: 'private', winners: ['private'] }] };
  } });
  for (const bad of [undefined, 1, '', '0', '01', '-1', '1.2', '1 OR 1=1', '9223372036854775808']) {
    await assert.rejects(service.events(bad, '2'), { status: 400 });
    await assert.rejects(service.events('1', bad), { status: 400 });
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await service.events('1', '2'), {
    category: { id: '2', name: 'Junior' }, events: [{ id: '3', name: 'Recitation', sort_order: 7, status: 'published' }],
  });
  assert.deepEqual(calls[0].values, ['1', '2']);
  assert.match(calls[0].sql, /r.status='published'/);
  assert.match(calls[0].sql, /JOIN result_publications/);
  assert.match(calls[0].sql, /ORDER BY e.sort_order, e.id/);
  assert.doesNotMatch(calls[0].sql, /snapshot|result_entries|correction_entries/);
});

test('public events HTTP access, empty state, errors, invalid IDs and rejected writes', async (t) => {
  t.mock.method(console, 'error', () => {});
  let rows = [{ category_id: '2', category_name: 'Junior', id: null, name: null, sort_order: null, status: 'unpublished' }];
  let fail = false;
  const service = createPublicCatalogService({ runQuery: async () => {
    if (fail) throw new Error('private SQL credentials');
    return { rows };
  } });
  await servePublicCatalog(service, async (request) => {
    const root = '/1/categories/2/events';
    const empty = await request(root);
    assert.equal(empty.status, 200);
    assert.equal(empty.headers.get('cache-control'), 'no-store');
    assert.deepEqual(empty.body, { category: { id: '2', name: 'Junior' }, events: [] });
    for (const bad of ['0', '01', '-1', 'abc', '9223372036854775808']) {
      assert.equal((await request(`/${bad}/categories/2/events`)).status, 400);
      assert.equal((await request(`/1/categories/${bad}/events`)).status, 400);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await request(root, method)).status, 404);
    rows = [];
    assert.equal((await request(root)).status, 404);
    fail = true;
    const result = await request(root);
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'Internal server error' });
  });
});

test('production mounts event listing without authentication and keeps admin event reads protected', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const result = await fetch(`${base}/api/competitions/invalid/categories/2/events`);
    assert.equal(result.status, 400);
    await result.arrayBuffer();
    const admin = await fetch(`${base}/api/admin/competitions/1/categories/2/events`);
    assert.equal(admin.status, 401);
    await admin.arrayBuffer();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
