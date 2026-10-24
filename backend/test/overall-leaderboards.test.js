import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import app from '../src/config/app.js';
import { createScoringService } from '../src/services/scoring.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

const root = '/api/competitions/1/leaderboard/units';

test('overall leaderboard validates competition IDs and rejects scope/points overrides before SQL', async () => {
  let calls = 0;
  const scoring = createScoringService({ transaction: async () => { calls++; } });
  await serveResultLifecycle({ scoring }, async (request) => {
    for (const value of ['0','01','-1','abc','1.5','9223372036854775808']) {
      assert.equal((await request(root.replace('/1/', `/${value}/`), 'GET', undefined, null)).status, 400);
    }
    for (const query of ['status=draft','category_id=2','competition_id=3','unit_id=4','position_points=999','category_id=2&category_id=3']) {
      assert.equal((await request(`${root}?${query}`, 'GET', undefined, null)).status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('overall leaderboard is public and no-store, and database failures stay sanitized', async (t) => {
  const rows = [{ unit_id: '5', unit_name: 'Unit', total_points: '16', rank: '1', winning_entries: '4', position_wins: { 1: '2', 2: '2' } }];
  await serveResultLifecycle({ scoring: { overallUnits: async (params, filters) => {
    assert.deepEqual({ ...params }, { competitionId: '1' });
    assert.deepEqual({ ...filters }, {});
    return rows;
  } } }, async (request) => {
    const response = await request(root, 'GET', undefined, null);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(response.body, { leaderboard: rows });
  });
  t.mock.method(console, 'error', () => {});
  await serveResultLifecycle({ scoring: createScoringService({ transaction: async () => { throw new Error('private SQL credentials'); } }) }, async (request) => {
    const response = await request(root, 'GET', undefined, null);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: 'Internal server error' });
  });
});

test('production mounts the overall route and has no public score modification methods', async () => {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const invalid = await fetch(`${base}${root.replace('/1/', '/0/')}`);
    assert.equal(invalid.status, 400); await invalid.arrayBuffer();
    for (const method of ['POST','PUT','PATCH','DELETE']) {
      const response = await fetch(`${base}${root}`, { method,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ total_points: 999, rank: 1 }) });
      assert.equal(response.status, 404); await response.arrayBuffer();
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
