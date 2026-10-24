import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createResultLifecycleService } from '../src/services/resultLifecycle.js';
import { createScoringService } from '../src/services/scoring.js';
import { createCompetitionService } from '../src/services/competitions.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

test('TKT-07A PostgreSQL scoring, corrections, isolation and public HTTP contract', { timeout: 600000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competitionId = await insert("INSERT INTO competitions(code,name) VALUES ('scores','Scores') RETURNING id");
    const otherId = await insert("INSERT INTO competitions(code,name) VALUES ('foreign','Foreign') RETURNING id");
    const categoryId = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Category') RETURNING id", [competitionId]);
    const otherCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Other') RETURNING id", [competitionId]);
    const foreignCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [otherId]);
    const units = {};
    for (const name of ['Beta','Alpha','Zero']) units[name] = await insert('INSERT INTO units(competition_id,name) VALUES ($1,$2) RETURNING id', [competitionId, name]);
    const foreignUnit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [otherId]);
    await pool.query('INSERT INTO competition_settings(competition_id,position_points) VALUES ($1,$3::jsonb),($2,$3::jsonb)', [competitionId, otherId, JSON.stringify({ 1: 5, 2: 3 })]);
    const drafts = createResultDraftService(db);
    const lifecycle = createResultLifecycleService(db);
    const scoring = createScoringService(db);
    const competitions = createCompetitionService(db);
    const params = { competitionId, categoryId };
    const url = `/api/competitions/${competitionId}/categories/${categoryId}/leaderboard/units`;
    let code = 0;
    const winner = (unit, position) => ({ candidate_code: String(++code), name: `Winner ${code}`, unit_id: unit, position });
    async function prepare(name, entries, scope = params, shared = false) {
      const eventId = await insert('INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,$3) RETURNING id', [scope.competitionId, scope.categoryId, name]);
      const p = { ...scope, eventId };
      const { draft } = await drafts.initialize(p, {}, 'admin');
      const saved = await drafts.save(p, { version: draft.version, entries,
        ...(shared ? { shared_positions: true, reason: 'Judges confirmed tied marks' } : {}) }, 'admin', shared);
      return { p, saved };
    }
    async function publish(fixture) {
      const reviewed = await lifecycle.review(fixture.p, { version: fixture.saved.version }, 'admin');
      return lifecycle.publish(fixture.p, { version: reviewed.version }, 'admin');
    }
    const row = (name, points, rank, entries, positions) => ({ unit_id: units[name], unit_name: name, total_points: String(points), rank: String(rank), winning_entries: String(entries), position_wins: positions });
    let expected = ['Alpha','Beta','Zero'].map((name) => row(name, 0, 1, 0, {}));
    await serveResultLifecycle({ drafts, lifecycle, scoring }, async (request) => {
      async function check() {
        const response = await request(url, 'GET', undefined, null);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(response.body, { leaderboard: expected });
        assert.doesNotMatch(JSON.stringify(response.body), /candidate|audit|review|reason|published_by/);
      }
      await check();
      const first = await prepare('First', [winner(units.Beta, 1), winner(units.Beta, 2), winner(units.Alpha, 1)], params, true);
      await check(); // Draft has no effect.
      const reviewed = await lifecycle.review(first.p, { version: first.saved.version }, 'admin');
      await check(); // Reviewed has no effect.
      const published = await lifecycle.publish(first.p, { version: reviewed.version }, 'admin');
      expected = [row('Beta', 8, 1, 2, { 1: '1', 2: '1' }), row('Alpha', 5, 2, 1, { 1: '1' }), row('Zero', 0, 3, 0, {})];
      await check();
      const second = await prepare('Second', [winner(units.Alpha, 1), winner(units.Beta, 2)]);
      await publish(second);
      expected = [row('Beta', 11, 1, 3, { 1: '1', 2: '2' }), row('Alpha', 10, 2, 2, { 1: '2' }), row('Zero', 0, 3, 0, {})];
      await check();
      await publish(await prepare('Other category', [winner(units.Zero, 1), winner(units.Zero, 2)], { competitionId, categoryId: otherCategory }));
      await publish(await prepare('Foreign', [winner(foreignUnit, 1), winner(foreignUnit, 2)], { competitionId: otherId, categoryId: foreignCategory }));
      await check();
      let correction = await lifecycle.startCorrection(first.p, { version: published.version, reason: 'Correct signed winner sheet' }, 'admin');
      const cp = { ...first.p, correctionId: correction.id };
      correction = await lifecycle.saveCorrection(cp, { version: correction.version, entries: [winner(units.Alpha, 1), winner(units.Beta, 2)],
        shared_positions: true, reason: 'Signed correction removes the tied group' }, 'admin', true);
      await check();
      correction = await lifecycle.review(cp, { version: correction.version }, 'admin', true);
      await check(); // Pending reviewed correction preserves original publication.
      await lifecycle.publish(cp, { version: correction.version }, 'admin', true);
      expected = [row('Alpha', 10, 1, 2, { 1: '2' }), row('Beta', 6, 2, 2, { 2: '2' }), row('Zero', 0, 3, 0, {})];
      await check();
      assert.equal((await pool.query('SELECT count(*) FROM result_publications WHERE event_id=$1', [first.p.eventId])).rows[0].count, '2');
      const rollback = new Error('Rollback uncommitted points fixture');
      await assert.rejects(db.transaction(async (query) => {
        await query('UPDATE competition_settings SET position_points=$2::jsonb WHERE competition_id=$1', [competitionId, JSON.stringify({ 1: 999, 2: 999 })]);
        await check(); // An uncommitted configuration must not leak into public scoring.
        throw rollback;
      }), (error) => error === rollback);
      await competitions.updateSettings(competitionId, { position_points: { 1: 3, 2: 3 } }, 'admin');
      expected = [row('Alpha', 6, 1, 2, { 1: '2' }), row('Beta', 6, 1, 2, { 2: '2' }), row('Zero', 0, 3, 0, {})];
      await check(); await check();
      await competitions.updateSettings(competitionId, { position_points: { 1: 0 } }, 'admin');
      expected = [row('Alpha', 0, 1, 2, { 1: '2' }), row('Beta', 0, 1, 2, { 2: '2' }), row('Zero', 0, 1, 0, {})];
      await check(); // Removed positions award zero; wins still count.
      await competitions.updateSettings(competitionId, { position_points: { 1: Number.MAX_SAFE_INTEGER, 2: 0 } }, 'admin');
      expected = [row('Alpha', '18014398509481982', 1, 2, { 1: '2' }), row('Beta', 0, 2, 2, { 2: '2' }), row('Zero', 0, 2, 0, {})];
      await check(); // Exact aggregate above JavaScript's safe integer range.
      await competitions.updateSettings(competitionId, { position_points: {} }, 'admin');
      expected = [row('Alpha', 0, 1, 2, { 1: '2' }), row('Beta', 0, 1, 2, { 2: '2' }), row('Zero', 0, 1, 0, {})];
      await check();
      await pool.query('DELETE FROM competition_settings WHERE competition_id=$1', [competitionId]);
      await check(); // Legacy competition with no settings also awards zero.
      for (const path of [url.replace(`/categories/${categoryId}/`, `/categories/${foreignCategory}/`), url.replace(`/categories/${categoryId}/`, '/categories/9223372036854775807/'), url.replace(`/competitions/${competitionId}/`, '/competitions/9223372036854775807/')]) {
        assert.equal((await request(path, 'GET', undefined, null)).status, 404);
      }
      const before = (await pool.query('SELECT count(*) FROM audit_logs')).rows[0];
      for (const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await request(url, method, { total_points: 999 }, null)).status, 404);
      assert.deepEqual((await pool.query('SELECT count(*) FROM audit_logs')).rows[0], before);
      await check();
      const failingScoring = createScoringService({ transaction: (work) => db.transaction((query) =>
        work((sql, values) => query(sql.startsWith('WITH scores') ? 'SELECT 1 / 0' : sql, sql.startsWith('WITH scores') ? [] : values))) });
      const original = scoring.categoryUnits;
      scoring.categoryUnits = failingScoring.categoryUnits;
      try {
        const response = await request(url, 'GET', undefined, null);
        assert.equal(response.status, 500);
        assert.deepEqual(response.body, { error: 'Internal server error' });
      } finally { scoring.categoryUnits = original; }
      await check(); // A real PostgreSQL error rolls back and releases its connection.
    });
  });
});
