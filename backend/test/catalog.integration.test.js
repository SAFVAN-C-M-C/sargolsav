import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCatalogService } from '../src/services/catalog.js';
import { withCatalogDatabase } from '../test-support/catalog-postgres.js';
import { serveCatalogs } from '../test-support/catalog-http.js';

test('TKT-05C real PostgreSQL category and event APIs', { timeout: 300000 }, async (t) => {
  await withCatalogDatabase(t, async ({ db, pool }) => {
    const service = createCatalogService(db);
    const insertId = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competition = await insertId("INSERT INTO competitions(code,name) VALUES ('one','One') RETURNING id");
    const otherCompetition = await insertId("INSERT INTO competitions(code,name) VALUES ('two','Two') RETURNING id");
    const root = `/${competition}/categories`;
    const otherRoot = `/${otherCompetition}/categories`;
    const countAudits = async () => Number((await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count);
    let category;
    let second;
    let other;
    let event;

    await t.test('incremental migration preserves existing names and defaults both display orders to zero', async () => {
      const sql = await readFile(new URL('../migrations/0004_category_event_order.sql', import.meta.url), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Reproduce the pre-0004 table shape within a transaction that is always rolled back.
        await client.query('ALTER TABLE categories DROP COLUMN sort_order CASCADE');
        await client.query('ALTER TABLE events DROP COLUMN sort_order CASCADE');
        const { rows: [legacy] } = await client.query("INSERT INTO categories(competition_id,name) VALUES ($1,'Legacy category') RETURNING id", [competition]);
        await client.query("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Legacy event')", [competition, legacy.id]);
        await client.query(sql);
        assert.deepEqual((await client.query('SELECT name,sort_order FROM categories')).rows, [{ name: 'Legacy category', sort_order: 0 }]);
        assert.deepEqual((await client.query('SELECT name,sort_order FROM events')).rows, [{ name: 'Legacy event', sort_order: 0 }]);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    await serveCatalogs(service, async (request) => {
      await t.test('category CRUD and deterministic ordering by sort_order then ascending ID', async () => {
        assert.deepEqual((await request(root)).body, { categories: [] });
        const created = await request(root, 'POST', { name: 'Custom category', sort_order: 10 });
        assert.equal(created.status, 201);
        category = created.body.category;
        assert.equal(typeof category.id, 'string');
        assert.equal(category.competition_id, competition);
        assert.equal(category.sort_order, 10);
        assert.deepEqual((await request(`${root}/${category.id}`)).body.category, category);
        assert.deepEqual((await request(`${root}/${category.id}/events`)).body, { events: [] });
        second = (await request(root, 'POST', { name: 'Second category', sort_order: 10 })).body.category;
        const first = (await request(root, 'POST', { name: 'Earlier category' })).body.category;
        assert.equal(first.sort_order, 0);
        assert.deepEqual((await request(root)).body.categories.map((r) => r.id), [first.id, category.id, second.id]);
        category = (await request(`${root}/${category.id}`, 'PATCH', { sort_order: 20 })).body.category;
        assert.equal(category.name, 'Custom category');
        const edited = await request(`${root}/${category.id}`, 'PATCH', { name: " Exact 'category'; SELECT secret -- " });
        assert.equal(edited.status, 200);
        assert.equal(edited.body.category.sort_order, 20);
        assert.notEqual(edited.body.category.updated_at, category.updated_at);
        category = edited.body.category;
        assert.deepEqual((await request(root)).body.categories.map((r) => r.id), [first.id, second.id, category.id]);
        assert.equal((await request(`${root}/${first.id}`, 'DELETE')).status, 204);
        assert.equal((await request(`${root}/${first.id}`)).status, 404);
        assert.equal((await request(`${root}/${first.id}`, 'DELETE')).status, 404);
        other = (await request(otherRoot, 'POST', { name: category.name })).body.category;
      });

      await t.test('event CRUD, partial edits and stable display ordering', async () => {
        const path = `${root}/${category.id}/events`;
        const created = await request(path, 'POST', { name: 'Custom event', sort_order: 10 });
        assert.equal(created.status, 201);
        event = created.body.event;
        assert.equal(event.category_id, category.id);
        assert.equal(event.competition_id, competition);
        assert.equal(event.sort_order, 10);
        assert.deepEqual((await request(`${path}/${event.id}`)).body.event, event);
        const tie = (await request(path, 'POST', { name: 'Tied event', sort_order: 10 })).body.event;
        const earlier = (await request(path, 'POST', { name: 'Earlier event' })).body.event;
        assert.deepEqual((await request(path)).body.events.map((r) => r.id), [earlier.id, event.id, tie.id]);
        event = (await request(`${path}/${event.id}`, 'PATCH', { name: " Exact 'event'; SELECT secret -- " })).body.event;
        assert.equal(event.sort_order, 10);
        event = (await request(`${path}/${event.id}`, 'PATCH', { sort_order: 0 })).body.event;
        assert.equal(event.name, " Exact 'event'; SELECT secret -- ");
        assert.deepEqual((await request(path)).body.events.map((r) => r.id), [event.id, earlier.id, tie.id]);
        assert.equal((await request(`${path}/${earlier.id}`, 'DELETE')).status, 204);
        assert.equal((await request(`${path}/${earlier.id}`)).status, 404);
        assert.equal((await request(`${path}/${earlier.id}`, 'DELETE')).status, 404);
        assert.equal((await request(`${root}/${category.id}`, 'DELETE')).status, 409, 'Events block category deletion');
      });

      await t.test('scoped duplicates and concurrent insert conflicts do not leave partial audits', async () => {
        const initial = await countAudits();
        for (const [path, method, name] of [
          [root, 'POST', category.name], [`${root}/${second.id}`, 'PATCH', category.name],
          [`${root}/${category.id}/events`, 'POST', event.name],
        ]) {
          const result = await request(path, method, { name });
          assert.equal(result.status, 409);
          assert.match(result.body.error, /name already exists/);
        }
        assert.equal(await countAudits(), initial);
        const extra = (await request(`${root}/${category.id}/events`, 'POST', { name: 'Other event' })).body.event;
        assert.equal((await request(`${root}/${category.id}/events/${extra.id}`, 'PATCH', { name: event.name })).status, 409);
        assert.equal((await request(`${root}/${second.id}/events`, 'POST', { name: event.name })).status, 201);
        assert.equal((await request(`${otherRoot}/${other.id}/events`, 'POST', { name: event.name })).status, 201);
        for (const path of [root, `${root}/${second.id}/events`]) {
          const before = await countAudits();
          const results = await Promise.all([request(path, 'POST', { name: 'Concurrent' }), request(path, 'POST', { name: 'Concurrent' })]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          assert.equal(await countAudits(), before + 1);
        }
      });

      await t.test('full parent scoping and immutable parents prevent cross-competition and cross-category access', async () => {
        const before = await countAudits();
        for (const [path, method, body] of [
          [`${otherRoot}/${category.id}`, 'GET'], [`${otherRoot}/${category.id}`, 'PATCH', { name: 'Wrong' }],
          [`${otherRoot}/${category.id}`, 'DELETE'], [`${otherRoot}/${category.id}/events`, 'GET'],
          [`${otherRoot}/${category.id}/events`, 'POST', { name: 'Wrong' }],
          [`${otherRoot}/${category.id}/events/${event.id}`, 'GET'],
          [`${otherRoot}/${category.id}/events/${event.id}`, 'PATCH', { sort_order: 1 }],
          [`${otherRoot}/${category.id}/events/${event.id}`, 'DELETE'],
          [`${otherRoot}/${other.id}/events/${event.id}`, 'GET'],
          [`${root}/${second.id}/events/${event.id}`, 'GET'],
          [`${root}/${second.id}/events/${event.id}`, 'PATCH', { name: 'Wrong' }],
          [`${root}/${second.id}/events/${event.id}`, 'DELETE'],
        ]) assert.equal((await request(path, method, body)).status, 404, `${method} ${path}`);
        assert.equal((await request(`${root}/${category.id}`, 'PATCH', { competition_id: otherCompetition })).status, 400);
        assert.equal((await request(`${root}/${category.id}/events/${event.id}`, 'PATCH', { category_id: second.id })).status, 400);
        assert.deepEqual((await request(`${root}/${category.id}`)).body.category, category);
        assert.deepEqual((await request(`${root}/${category.id}/events/${event.id}`)).body.event, event);
        assert.equal(await countAudits(), before);
      });

      await t.test('missing records and invalid sort orders return safe errors without modifying records', async () => {
        const missing = '9223372036854775807';
        for (const [method, body] of [['GET'], ['POST', { name: 'Valid' }]]) {
          assert.deepEqual((await request(`/${missing}/categories`, method, body)).body, { error: 'Competition not found' });
          assert.deepEqual((await request(`${root}/${missing}/events`, method, body)).body, { error: 'Category not found' });
        }
        for (const [method, body] of [['GET'], ['PATCH', { sort_order: 1 }], ['DELETE']]) {
          const absentCategory = await request(`${root}/${missing}`, method, body);
          assert.equal(absentCategory.status, 404);
          assert.deepEqual(absentCategory.body, { error: 'Category not found' });
          const absentEvent = await request(`${root}/${category.id}/events/${missing}`, method, body);
          assert.equal(absentEvent.status, 404);
          assert.deepEqual(absentEvent.body, { error: 'Event not found' });
        }
        const before = await countAudits();
        for (const path of [`${root}/${category.id}`, `${root}/${category.id}/events/${event.id}`]) {
          for (const sort_order of [-1, 1.5, '5', null, 2147483648]) assert.equal((await request(path, 'PATCH', { sort_order })).status, 400);
        }
        assert.equal(await countAudits(), before);
        await assert.rejects(db.transaction((q) => q('UPDATE categories SET sort_order=-1 WHERE id=$1', [category.id])), (e) => e.code === '23514');
        await assert.rejects(db.transaction((q) => q('UPDATE events SET sort_order=-1 WHERE id=$1', [event.id])), (e) => e.code === '23514');
      });

      await t.test('deletion protects candidate-only categories, all result states, entries and event audit dependencies', async () => {
        const candidateCategory = (await request(root, 'POST', { name: 'Candidate category' })).body.category;
        const unit = await insertId("INSERT INTO units(competition_id,name) VALUES ($1,'Fixture unit') RETURNING id", [competition]);
        await pool.query("INSERT INTO candidates(competition_id,unit_id,category_id,candidate_code,name) VALUES ($1,$2,$3,'001','Fixture')",
          [competition, unit, candidateCategory.id]);
        assert.equal((await request(`${root}/${candidateCategory.id}`, 'DELETE')).status, 409);
        const candidate = await insertId("INSERT INTO candidates(competition_id,unit_id,category_id,candidate_code,name) VALUES ($1,$2,$3,'002','Winner') RETURNING id",
          [competition, unit, category.id]);
        for (const state of ['draft', 'reviewed', 'published']) {
          const item = (await request(`${root}/${category.id}/events`, 'POST', { name: `${state} fixture` })).body.event;
          const result = await insertId(`INSERT INTO event_results(competition_id,event_id,category_id,status,reviewed_at,reviewed_by,published_at,published_by)
            VALUES ($1,$2,$3,$4,CASE WHEN $4 <> 'draft' THEN now() END, CASE WHEN $4 <> 'draft' THEN 'fixture' END,
              CASE WHEN $4 = 'published' THEN now() END, CASE WHEN $4 = 'published' THEN 'fixture' END) RETURNING id`,
          [competition, item.id, category.id, state]);
          if (state === 'published') await pool.query(`INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position)
            VALUES ($1,$2,$3,$4,$5,1)`, [competition, result, item.id, category.id, candidate]);
          const before = await countAudits();
          const blocked = await request(`${root}/${category.id}/events/${item.id}`, 'DELETE');
          assert.equal(blocked.status, 409);
          assert.deepEqual(blocked.body, { error: 'Event is referenced by dependent records' });
          assert.equal((await pool.query('SELECT status FROM event_results WHERE id=$1', [result])).rows[0].status, state);
          assert.equal(await countAudits(), before);
        }
        const audited = (await request(`${root}/${category.id}/events`, 'POST', { name: 'Audit dependency' })).body.event;
        await pool.query("INSERT INTO audit_logs(competition_id,event_id,actor_ref,action,reason) VALUES ($1,$2,'fixture','review','Existing evidence')", [competition, audited.id]);
        assert.equal((await request(`${root}/${category.id}/events/${audited.id}`, 'DELETE')).status, 409);
        assert.equal((await pool.query('SELECT count(*) FROM result_entries')).rows[0].count, '1');
      });

      await t.test('audits contain trusted attribution and before/after snapshots for all six mutations', async () => {
        const rows = (await pool.query("SELECT actor_ref,action,details FROM audit_logs WHERE actor_ref <> 'fixture' ORDER BY id")).rows;
        assert.deepEqual([...new Set(rows.map((r) => r.action))].sort(), [
          'category_created', 'category_deleted', 'category_updated', 'event_created', 'event_deleted', 'event_updated',
        ]);
        for (const row of rows) {
          assert.equal(row.actor_ref, 'trusted-catalog-admin');
          assert.equal(typeof (row.details.after ?? row.details.before).sort_order, 'number');
          if (row.action.endsWith('_deleted')) assert.equal(row.details.after, null);
        }
        for (const path of [root, `${root}/${category.id}/events`]) {
          assert.equal((await request(path, 'POST', { name: 'Spoof', actor_ref: 'spoof' })).status, 400);
        }
      });
    });

    await t.test('actual audit SQL failures roll back creates, partial updates and deletions for both resources', async (t) => {
      t.mock.method(console, 'error', () => {});
      const disposable = await service.categories.create({ competitionId: competition }, { name: 'Rollback category' }, 'fixture');
      const params = { competitionId: competition, categoryId: disposable.id };
      const child = await service.events.create(params, { name: 'Rollback event' }, 'fixture');
      const before = await countAudits();
      const faulty = createCatalogService({ transaction: (work) => db.transaction((query) => work((sql, values) =>
        /INSERT INTO audit_logs/.test(sql) ? query('SELECT * FROM missing_tkt05c_audit_table') : query(sql, values))) });
      await serveCatalogs(faulty, async (request) => {
        for (const [path, method, body] of [
          [root, 'POST', { name: 'Must roll back' }], [`${root}/${disposable.id}`, 'PATCH', { sort_order: 55 }],
          [`${root}/${disposable.id}/events`, 'POST', { name: 'Must roll back' }],
          [`${root}/${disposable.id}/events/${child.id}`, 'PATCH', { sort_order: 55 }],
          [`${root}/${disposable.id}/events/${child.id}`, 'DELETE'],
        ]) {
          const result = await request(path, method, body);
          assert.equal(result.status, 500);
          assert.deepEqual(result.body, { error: 'Internal server error' });
        }
        assert.deepEqual(await service.categories.get(params), disposable);
        assert.deepEqual(await service.events.get({ ...params, eventId: child.id }), child);
        assert.equal(await countAudits(), before);
        assert.equal((await pool.query("SELECT count(*) FROM categories WHERE name='Must roll back'")).rows[0].count, '0');
        assert.equal((await pool.query("SELECT count(*) FROM events WHERE name='Must roll back'")).rows[0].count, '0');
        await service.events.remove({ ...params, eventId: child.id }, 'fixture');
        const after = await countAudits();
        assert.equal((await request(`${root}/${disposable.id}`, 'DELETE')).status, 500);
        assert.deepEqual(await service.categories.get(params), disposable);
        assert.equal(await countAudits(), after);
      });
    });

    await t.test('concurrent direct result creation cannot be silently cascaded by API event deletion', async () => {
      const race = await service.events.create({ competitionId: competition, categoryId: category.id }, { name: 'Race event' }, 'fixture');
      const params = { competitionId: competition, categoryId: category.id, eventId: race.id };
      const [insertion, deletion] = await Promise.allSettled([
        db.transaction((q) => q('INSERT INTO event_results(competition_id,event_id,category_id) VALUES ($1,$2,$3) RETURNING id', [competition, race.id, category.id])),
        service.events.remove(params, 'fixture'),
      ]);
      if (insertion.status === 'fulfilled') {
        assert.equal(deletion.status, 'rejected');
        assert.equal(deletion.reason.status, 409);
        assert.equal((await pool.query('SELECT count(*) FROM event_results WHERE event_id=$1', [race.id])).rows[0].count, '1');
      } else {
        assert.equal(insertion.reason.code, '23503');
        assert.equal(deletion.status, 'fulfilled');
      }
    });
  });
});
