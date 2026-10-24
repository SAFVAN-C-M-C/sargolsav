import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import app from '../src/config/app.js';
import { createPublicCatalogService } from '../src/services/publicCatalog.js';
import { servePublicCatalog } from '../test-support/public-catalog-http.js';

test('public catalog validates IDs before SQL and returns safe ordered projections', async () => {
  const queries = [];
  const service = createPublicCatalogService({ runQuery: async (sql, values) => {
    queries.push([sql, values]);
    return { rows: [{ competition_id: '1', competition_name: 'Festival', id: '3', name: 'Custom', sort_order: 7, private: 'hidden' }] };
  } });
  for (const id of [undefined, 1, '0', '01', '-1', '1 OR 1=1', '9223372036854775808']) {
    await assert.rejects(service.categories(id), { status: 400 });
  }
  assert.equal(queries.length, 0);
  assert.deepEqual(await service.categories('1'), { competition: { id: '1', name: 'Festival' }, categories: [{ id: '3', name: 'Custom', sort_order: 7 }] });
  assert.deepEqual(queries[0][1], ['1']);
  assert.match(queries[0][0], /status = 'active'/);
  assert.match(queries[0][0], /ORDER BY k.sort_order, k.id/);
});

test('public HTTP reads need no token, reject writes, handle empty scope and sanitize failures', async (t) => {
  t.mock.method(console, 'error', () => {});
  let fail = false;
  const service = createPublicCatalogService({ runQuery: async () => {
    if (fail) throw new Error('postgres://private credentials');
    return { rows: [] };
  } });
  await servePublicCatalog(service, async (request) => {
    const list = await request();
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.deepEqual(list.body, { competitions: [] });
    assert.equal((await request('/1/categories')).status, 404);
    assert.equal((await request('/bad/categories')).status, 400);
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await request('/1/categories', method)).status, 404);
    fail = true;
    for (const path of ['', '/1/categories']) {
      const result = await request(path);
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, { error: 'Internal server error' });
    }
  });
});

test('production app mounts public metadata separately from protected admin metadata', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const publicResponse = await fetch(`${base}/api/competitions/invalid/categories`);
    assert.equal(publicResponse.status, 400);
    await publicResponse.arrayBuffer();
    for (const path of ['/api/admin/competitions', '/api/admin/competitions/1/categories']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 401);
      await response.arrayBuffer();
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
