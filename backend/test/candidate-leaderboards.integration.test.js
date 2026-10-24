import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCandidateService } from '../src/services/candidates.js';
import { createCompetitionService } from '../src/services/competitions.js';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createResultLifecycleService } from '../src/services/resultLifecycle.js';
import { createScoringService } from '../src/services/scoring.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

test('TKT-07B PostgreSQL candidate standings reuse published scoring across events and corrections', { timeout: 600000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competitionId = await insert("INSERT INTO competitions(code,name) VALUES ('candidate-scores','Scores') RETURNING id");
    const foreignId = await insert("INSERT INTO competitions(code,name) VALUES ('foreign-scores','Foreign') RETURNING id");
    const categoryId = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Category') RETURNING id", [competitionId]);
    const otherCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Other') RETURNING id", [competitionId]);
    const emptyCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Empty') RETURNING id", [competitionId]);
    const foreignCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [foreignId]);
    const unitA = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'A') RETURNING id", [competitionId]);
    const unitB = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'B') RETURNING id", [competitionId]);
    const foreignUnit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [foreignId]);
    const madrasa = await insert("INSERT INTO madrasas(competition_id,unit_id,name) VALUES ($1,$2,'Madrassa') RETURNING id", [competitionId, unitB]);
    const competitions = createCompetitionService(db);
    await competitions.updateSettings(competitionId, { position_points: { 1: 5, 2: 3 } }, 'admin');
    await competitions.updateSettings(foreignId, { position_points: { 1: 100, 2: 50 } }, 'admin');
    const candidates = createCandidateService(db);
    const drafts = createResultDraftService(db);
    const lifecycle = createResultLifecycleService(db);
    const scoring = createScoringService(db);
    const params = { competitionId, categoryId };
    const url = `/api/competitions/${competitionId}/categories/${categoryId}/leaderboard/candidates`;
    const register = (code, name, unit, madrasaId = null, scope = params) => candidates.create({ competitionId: scope.competitionId }, {
      candidate_code: code, name, unit_id: unit, madrasa_id: madrasaId, category_id: scope.categoryId,
    }, 'admin');
    const a = await register('001', 'Sam', unitA);
    const b = await register('1', 'Sam', unitA);
    const c = await register('002', 'Ada', unitB, madrasa);
    const d = await register('pending', 'Dan', unitB);
    const z = await register('zero', 'Zoe', unitA);
    const win = (candidate, position) => ({ candidate_code: candidate.candidate_code, name: candidate.name,
      unit_id: candidate.unit_id, madrasa_id: candidate.madrasa_id, position });
    async function prepare(name, entries, scope = params, shared = false) {
      const eventId = await insert('INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,$3) RETURNING id', [scope.competitionId, scope.categoryId, name]);
      const p = { ...scope, eventId };
      const { draft } = await drafts.initialize(p, {}, 'admin');
      const saved = await drafts.save(p, { version: draft.version, entries,
        ...(shared ? { shared_positions: true, reason: 'Judges confirmed equal marks' } : {}) }, 'admin', shared);
      return { p, saved };
    }
    async function publish(fixture) {
      const reviewed = await lifecycle.review(fixture.p, { version: fixture.saved.version }, 'admin');
      return lifecycle.publish(fixture.p, { version: reviewed.version }, 'admin');
    }
    const row = (candidate, points, rank, count, positions) => ({ candidate_id: candidate.id,
      candidate_code: candidate.candidate_code, candidate_name: candidate.name, unit_id: candidate.unit_id,
      unit_name: candidate.unit_id === unitA ? 'A' : 'B', madrasa_id: candidate.madrasa_id,
      madrasa_name: candidate.madrasa_id ? 'Madrassa' : null, total_points: String(points), rank: String(rank),
      winning_entries: String(count), position_wins: positions });
    let expected = [c,d,a,b,z].map((candidate) => row(candidate, 0, 1, 0, {}));
    await serveResultLifecycle({ drafts, lifecycle, scoring }, async (request) => {
      async function check() {
        const response = await request(url, 'GET', undefined, null);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(response.body, { leaderboard: expected });
        assert.equal(new Set(response.body.leaderboard.map((entry) => entry.candidate_id)).size, expected.length);
        assert.doesNotMatch(JSON.stringify(response.body), /override|audit|review|reason|published_by|created_at|updated_at/);
      }
      await check();
      assert.deepEqual((await request(url.replace(`/categories/${categoryId}/`, `/categories/${emptyCategory}/`), 'GET', undefined, null)).body, { leaderboard: [] });
      const first = await prepare('First', [win(a, 1), win(b, 2), win(c, 1)], params, true);
      await check();
      const reviewed = await lifecycle.review(first.p, { version: first.saved.version }, 'admin');
      await check(); // Draft and reviewed winners contribute zero.
      const published = await lifecycle.publish(first.p, { version: reviewed.version }, 'admin');
      expected = [row(c, 5, 1, 1, { 1: '1' }), row(a, 5, 1, 1, { 1: '1' }), row(b, 3, 3, 1, { 2: '1' }), row(d, 0, 4, 0, {}), row(z, 0, 4, 0, {})];
      await check();
      await publish(await prepare('Second', [win(a, 1), win(c, 2)]));
      expected = [row(a, 10, 1, 2, { 1: '2' }), row(c, 8, 2, 2, { 1: '1', 2: '1' }), row(b, 3, 3, 1, { 2: '1' }), row(d, 0, 4, 0, {}), row(z, 0, 4, 0, {})];
      await check();
      const ordinary = expected;
      await competitions.updateSettings(competitionId, { position_points: { 1: Number.MAX_SAFE_INTEGER, 2: 0 } }, 'admin');
      expected = [row(a, '18014398509481982', 1, 2, { 1: '2' }), row(c, '9007199254740991', 2, 2, { 1: '1', 2: '1' }), row(d, 0, 3, 0, {}), row(b, 0, 3, 1, { 2: '1' }), row(z, 0, 3, 0, {})];
      await check();
      await competitions.updateSettings(competitionId, { position_points: { 1: 5, 2: 3 } }, 'admin');
      expected = ordinary;
      const rollback = new Error('Rollback uncommitted configuration');
      await assert.rejects(db.transaction(async (query) => {
        await query('UPDATE competition_settings SET position_points=$2::jsonb WHERE competition_id=$1', [competitionId, JSON.stringify({ 1: 999 })]);
        await check();
        throw rollback;
      }), (error) => error === rollback);
      const pending = await prepare('Unpublished', [win(d, 1), win(b, 2)]);
      await lifecycle.review(pending.p, { version: pending.saved.version }, 'admin');
      await check(); // Registered candidate with only reviewed wins remains zero.
      const outsider = await register('other', 'Other category', unitA, null, { competitionId, categoryId: otherCategory });
      const otherSecond = await register('other-second', 'Other second', unitA, null, { competitionId, categoryId: otherCategory });
      await publish(await prepare('Other category', [win(outsider, 1), win(otherSecond, 2)], { competitionId, categoryId: otherCategory }));
      const foreignScope = { competitionId: foreignId, categoryId: foreignCategory };
      const foreignA = await register('001', 'Foreign Sam', foreignUnit, null, foreignScope);
      const foreignB = await register('002', 'Foreign Ada', foreignUnit, null, foreignScope);
      await publish(await prepare('Foreign', [win(foreignA, 1), win(foreignB, 2)], foreignScope));
      await check(); // Reused external codes cannot mix competitions.
      let correction = await lifecycle.startCorrection(first.p, { version: published.version, reason: 'Correct signed winner sheet' }, 'admin');
      const cp = { ...first.p, correctionId: correction.id };
      correction = await lifecycle.saveCorrection(cp, { version: correction.version, entries: [win(d, 1), win(b, 2)],
        shared_positions: true, reason: 'Signed correction removes the tied group' }, 'admin', true);
      await check();
      correction = await lifecycle.review(cp, { version: correction.version }, 'admin', true);
      await check();
      await lifecycle.publish(cp, { version: correction.version }, 'admin', true);
      expected = [row(d, 5, 1, 1, { 1: '1' }), row(a, 5, 1, 1, { 1: '1' }), row(c, 3, 3, 1, { 2: '1' }), row(b, 3, 3, 1, { 2: '1' }), row(z, 0, 5, 0, {})];
      await check();
      assert.equal((await pool.query('SELECT count(*) FROM result_publications WHERE event_id=$1', [first.p.eventId])).rows[0].count, '2');
      await competitions.updateSettings(competitionId, { position_points: { 1: 3, 2: 3 } }, 'admin');
      expected = [row(c, 3, 1, 1, { 2: '1' }), row(d, 3, 1, 1, { 1: '1' }), row(a, 3, 1, 1, { 1: '1' }), row(b, 3, 1, 1, { 2: '1' }), row(z, 0, 5, 0, {})];
      await check(); await check();
      await candidates.update({ competitionId, candidateId: a.id }, { name: 'Aaron' }, 'admin');
      a.name = 'Aaron';
      expected = [row(a, 3, 1, 1, { 1: '1' }), row(c, 3, 1, 1, { 2: '1' }), row(d, 3, 1, 1, { 1: '1' }), row(b, 3, 1, 1, { 2: '1' }), row(z, 0, 5, 0, {})];
      await check(); // Name correction retains the candidate's published winnings.
      await competitions.updateSettings(competitionId, { position_points: {} }, 'admin');
      expected = [row(a, 0, 1, 1, { 1: '1' }), row(c, 0, 1, 1, { 2: '1' }), row(d, 0, 1, 1, { 1: '1' }), row(b, 0, 1, 1, { 2: '1' }), row(z, 0, 1, 0, {})];
      await check();
      await pool.query('DELETE FROM competition_settings WHERE competition_id=$1', [competitionId]);
      await check();
      for (const path of [url.replace(`/categories/${categoryId}/`, `/categories/${foreignCategory}/`), url.replace(`/categories/${categoryId}/`, '/categories/9223372036854775807/'), url.replace(`/competitions/${competitionId}/`, '/competitions/9223372036854775807/')]) {
        assert.equal((await request(path, 'GET', undefined, null)).status, 404);
      }
      const before = (await pool.query('SELECT count(*) FROM audit_logs')).rows[0];
      for (const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await request(url, method, { total_points: 999 }, null)).status, 404);
      assert.deepEqual((await pool.query('SELECT count(*) FROM audit_logs')).rows[0], before);
      await check();
      const failingScoring = createScoringService({ transaction: (work) => db.transaction((query) =>
        work((sql, values) => query(sql.startsWith('WITH scores') ? 'SELECT 1 / 0' : sql, sql.startsWith('WITH scores') ? [] : values))) });
      const original = scoring.categoryCandidates;
      scoring.categoryCandidates = failingScoring.categoryCandidates;
      try {
        const response = await request(url, 'GET', undefined, null);
        assert.equal(response.status, 500);
        assert.deepEqual(response.body, { error: 'Internal server error' });
      } finally { scoring.categoryCandidates = original; }
      await check();
    });
  });
});
