import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import app from '../src/config/app.js';
import { createScoringService } from '../src/services/scoring.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

const root = '/api/competitions/1/categories/2/leaderboard/candidates';

test('candidate leaderboard rejects invalid scope and query overrides before SQL', async () => {
  let calls = 0;
  const scoring = createScoringService({ transaction: async () => { calls++; } });
  await serveResultLifecycle({ scoring }, async (request) => {
    for (const value of ['0','01','-1','abc','1.5','9223372036854775808']) {
      for (const path of [root.replace('/1/', `/${value}/`), root.replace('/2/', `/${value}/`)]) {
        assert.equal((await request(path, 'GET', undefined, null)).status, 400, path);
      }
    }
    for (const query of ['status=draft','candidate_code=001','category_id=3','unit_id=4','position_points=99','category_id=2&category_id=3']) {
      assert.equal((await request(`${root}?${query}`, 'GET', undefined, null)).status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('candidate leaderboard is public, no-store and sanitizes database failures', async (t) => {
  const rows = [{ candidate_id: '3', candidate_code: '001', candidate_name: 'Winner', unit_id: '4', unit_name: 'Unit',
    madrasa_id: null, madrasa_name: null, total_points: '10', rank: '1', winning_entries: '2', position_wins: { 1: '2' } }];
  await serveResultLifecycle({ scoring: { categoryCandidates: async (params, filters) => {
    assert.deepEqual({ ...params }, { competitionId: '1', categoryId: '2' });
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

test('production mounts candidate leaderboard and rejects unauthorized score modifications', async () => {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const invalid = await fetch(`${base}${root.replace('/1/', '/0/')}`);
    assert.equal(invalid.status, 400); await invalid.arrayBuffer();
    for (const method of ['POST','PUT','PATCH','DELETE']) {
      const response = await fetch(`${base}${root}`, { method,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidate_id: '3', total_points: 999 }) });
      assert.equal(response.status, 404); await response.arrayBuffer();
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
