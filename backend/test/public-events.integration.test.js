import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPublicCatalogService } from '../src/services/publicCatalog.js';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createResultLifecycleService, createPublicResultService } from '../src/services/resultLifecycle.js';
import { withCatalogDatabase } from '../test-support/catalog-postgres.js';
import { servePublicCatalog } from '../test-support/public-catalog-http.js';

test('TKT-08B PostgreSQL event listings isolate scope, order all events and expose only committed publications', { timeout: 180000 }, async (t) => {
  await withCatalogDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(`${sql} RETURNING id`, values)).rows[0].id;
    const competition = await insert("INSERT INTO competitions(code,name,status) VALUES ('events','Festival','active')");
    const other = await insert("INSERT INTO competitions(code,name,status) VALUES ('other','Other','active')");
    const category = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Junior')", [competition]);
    const empty = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Empty')", [competition]);
    const foreignCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Foreign')", [other]);
    const event = async (parent, cat, name, order = 0) => insert('INSERT INTO events(competition_id,category_id,name,sort_order) VALUES ($1,$2,$3,$4)', [parent, cat, name, order]);
    const published = await event(competition, category, 'Published event', 10);
    const untouched = await event(competition, category, 'No result', 0);
    const drafted = await event(competition, category, 'Private draft', 10);
    const reviewedEvent = await event(competition, category, 'Private review', 10);
    await event(other, foreignCategory, 'Foreign event');
    const unit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Unit One')", [competition]);
    await pool.query('INSERT INTO competition_settings(competition_id,position_points) VALUES ($1,$2)', [competition, { 1: 5, 2: 3 }]);
    const drafts = createResultDraftService(db);
    const lifecycle = createResultLifecycleService(db);
    const params = { competitionId: competition, categoryId: category, eventId: published };
    const winner = { candidate_code: '001', name: 'Winner One', unit_id: unit, position: 1 };
    const second = { ...winner, candidate_code: '002', name: 'Winner Two', position: 2 };
    const save = async (eventId) => {
      const scope = { ...params, eventId };
      const { draft } = await drafts.initialize(scope, {}, 'fixture');
      return drafts.save(scope, { version: draft.version, entries: [winner, second] }, 'fixture');
    };
    await save(drafted);
    const reviewedDraft = await save(reviewedEvent);
    await lifecycle.review({ ...params, eventId: reviewedEvent }, { version: reviewedDraft.version }, 'reviewer');
    let draft = await save(published);
    draft = await lifecycle.review(params, { version: draft.version }, 'reviewer');
    const live = await lifecycle.publish(params, { version: draft.version }, 'publisher');
    await servePublicCatalog(createPublicCatalogService(db), async (request) => {
      const root = `/${competition}/categories/${category}/events`;
      const list = await request(root);
      assert.equal(list.status, 200);
      assert.deepEqual(list.body, { category: { id: category, name: 'Junior' }, events: [
        { id: untouched, name: 'No result', sort_order: 0, status: 'unpublished' },
        { id: published, name: 'Published event', sort_order: 10, status: 'published' },
        { id: drafted, name: 'Private draft', sort_order: 10, status: 'unpublished' },
        { id: reviewedEvent, name: 'Private review', sort_order: 10, status: 'unpublished' },
      ] });
      for (const eventId of [untouched, drafted, reviewedEvent]) {
        assert.equal((await request(`${root}/${eventId}/result`)).status, 404);
        assert.equal((await request(`${root}/${eventId}/result/status`)).body.availability.status, 'unpublished');
      }
      assert.deepEqual((await request(`/${competition}/categories/${empty}/events`)).body.events, []);
      for (const bad of ['0', '01', '-1', 'invalid', '9223372036854775808']) {
        assert.equal((await request(`/${bad}/categories/${category}/events`)).status, 400);
        assert.equal((await request(`/${competition}/categories/${bad}/events`)).status, 400);
      }
      for (const path of [`/${competition}/categories/${foreignCategory}/events`, `/${other}/categories/${category}/events`,
        `/${competition}/categories/9223372036854775807/events`]) assert.equal((await request(path)).status, 404);
      let correction = await lifecycle.startCorrection(params, { version: live.version, reason: 'Judges confirmed revised winners' }, 'fixture');
      const scoped = { ...params, correctionId: correction.id };
      correction = await lifecycle.saveCorrection(scoped, { version: correction.version, shared_positions: true,
        reason: 'Judges confirmed equal marks for both candidates', entries: [winner, { ...second, position: 1 },
          { ...winner, candidate_code: '003', name: 'Corrected second', position: 2 }] }, 'fixture', true);
      let visible = (await request(`${root}/${published}/result`)).body.result;
      assert.deepEqual(visible.winners.map((w) => w.position), [1, 2], 'Correction workspace stays private');
      const originalPublication = visible.publication_id;
      correction = await lifecycle.review(scoped, { version: correction.version }, 'reviewer', true);
      await lifecycle.publish(scoped, { version: correction.version }, 'publisher', true);
      visible = (await request(`${root}/${published}/result`)).body.result;
      assert.notEqual(visible.publication_id, originalPublication);
      assert.deepEqual(visible.winners.map((w) => [w.position, w.candidate_code]), [[1, '001'], [1, '002'], [2, '003']]);
      assert.doesNotMatch(JSON.stringify(visible), /reviewed_by|override_audit|reason|correction_id/);
      assert.deepEqual((await request(root)).body, list.body, 'Publishing corrections changes winners, not listing fields');
      for (const status of ['archived', 'draft']) {
        await pool.query('UPDATE competitions SET status=$2 WHERE id=$1', [competition, status]);
        assert.equal((await request(root)).status, 404);
      }
    }, createPublicResultService(db));
  });
});
