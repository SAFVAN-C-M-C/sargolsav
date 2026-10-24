import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPublicCatalogService } from '../src/services/publicCatalog.js';
import { withCatalogDatabase } from '../test-support/catalog-postgres.js';
import { servePublicCatalog } from '../test-support/public-catalog-http.js';

test('TKT-08A PostgreSQL public catalog: visibility, ordering, isolation and safe HTTP fields', async (t) => {
  await withCatalogDatabase(t, async ({ db, pool }) => {
    const insert = async (code, status) => (await pool.query(
      'INSERT INTO competitions(code,name,status) VALUES ($1,$1,$2) RETURNING id', [code, status])).rows[0].id;
    const draft = await insert('Private draft', 'draft');
    const active = await insert('Festival', 'active');
    const archived = await insert('Archived', 'archived');
    const empty = await insert('New festival', 'active');
    await pool.query('INSERT INTO competition_settings(competition_id,position_points) VALUES ($1, $2)', [active, { 1: 5 }]);
    const addCategory = async (parent, name, order) => (await pool.query(
      'INSERT INTO categories(competition_id,name,sort_order) VALUES ($1,$2,$3) RETURNING id', [parent, name, order])).rows[0].id;
    const later = await addCategory(active, 'Later custom category', 12);
    const first = await addCategory(active, 'First custom category', 0);
    const tie = await addCategory(active, 'Same display order', 12);
    await addCategory(draft, 'Private category', 0);
    await addCategory(archived, 'Archived category', 0);
    await servePublicCatalog(createPublicCatalogService(db), async (request) => {
      assert.deepEqual((await request()).body, { competitions: [{ id: empty, name: 'New festival' }, { id: active, name: 'Festival' }] });
      const catalog = await request(`/${active}/categories`);
      assert.equal(catalog.status, 200);
      assert.deepEqual(catalog.body, {
        competition: { id: active, name: 'Festival' },
        categories: [
          { id: first, name: 'First custom category', sort_order: 0 },
          { id: later, name: 'Later custom category', sort_order: 12 },
          { id: tie, name: 'Same display order', sort_order: 12 },
        ],
      });
      assert.deepEqual((await request(`/${empty}/categories`)).body, { competition: { id: empty, name: 'New festival' }, categories: [] });
      for (const id of [draft, archived, '9223372036854775807']) assert.equal((await request(`/${id}/categories`)).status, 404);
      await pool.query("UPDATE competitions SET status='archived' WHERE id=$1", [active]);
      assert.equal((await request(`/${active}/categories`)).status, 404);
      assert.deepEqual((await request()).body.competitions.map((row) => row.id), [empty]);
    });
  });
});
