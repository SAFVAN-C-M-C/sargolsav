import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCandidateService } from '../src/services/candidates.js';
import { createCompetitionService } from '../src/services/competitions.js';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createResultLifecycleService } from '../src/services/resultLifecycle.js';
import { createScoringService } from '../src/services/scoring.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

test('TKT-07C PostgreSQL overall standings and consistency across all three leaderboards', { timeout: 600000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competitionId = await insert("INSERT INTO competitions(code,name) VALUES ('overall','Overall') RETURNING id");
    const foreignId = await insert("INSERT INTO competitions(code,name) VALUES ('foreign-overall','Foreign') RETURNING id");
    const emptyId = await insert("INSERT INTO competitions(code,name) VALUES ('empty-overall','Empty') RETURNING id");
    const category = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'One') RETURNING id", [competitionId]);
    const secondCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Two') RETURNING id", [competitionId]);
    const emptyCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Empty') RETURNING id", [competitionId]);
    const foreignCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [foreignId]);
    const units = {};
    for (const name of ['Beta','Alpha','Zero']) units[name] = await insert('INSERT INTO units(competition_id,name) VALUES ($1,$2) RETURNING id', [competitionId, name]);
    const foreignUnit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [foreignId]);
    const madrasa = await insert("INSERT INTO madrasas(competition_id,unit_id,name) VALUES ($1,$2,'Madrassa') RETURNING id", [competitionId, units.Beta]);
    const competitions = createCompetitionService(db);
    await competitions.updateSettings(competitionId, { position_points: { 1: 5, 2: 3 } }, 'admin');
    await competitions.updateSettings(foreignId, { position_points: { 1: 100, 2: 50 } }, 'admin');
    const candidates = createCandidateService(db);
    const drafts = createResultDraftService(db);
    const lifecycle = createResultLifecycleService(db);
    const scoring = createScoringService(db);
    const params = { competitionId };
    const url = `/api/competitions/${competitionId}/leaderboard/units`;
    async function register(code, name, unit, categoryId, madrasaId = null, comp = competitionId) {
      return candidates.create({ competitionId: comp }, { candidate_code: code, name, unit_id: unit, category_id: categoryId, madrasa_id: madrasaId }, 'admin');
    }
    const a = await register('001', 'Sam', units.Alpha, category);
    const b = await register('1', 'Sam', units.Alpha, category);
    const c = await register('002', 'Ada', units.Beta, category, madrasa);
    const z = await register('zero', 'Zoe', units.Zero, category);
    const d = await register('003', 'Dan', units.Beta, secondCategory);
    const e = await register('004', 'Eve', units.Alpha, secondCategory);
    const f = await register('005', 'Finn', units.Beta, secondCategory, madrasa);
    const win = (candidate, position) => ({ candidate_code: candidate.candidate_code, name: candidate.name,
      unit_id: candidate.unit_id, madrasa_id: candidate.madrasa_id, position });
    async function prepare(name, entries, categoryId = category, shared = false, comp = competitionId) {
      const eventId = await insert('INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,$3) RETURNING id', [comp, categoryId, name]);
      const p = { competitionId: comp, categoryId, eventId };
      const { draft } = await drafts.initialize(p, {}, 'admin');
      const saved = await drafts.save(p, { version: draft.version, entries,
        ...(shared ? { shared_positions: true, reason: 'Judges confirmed equal marks' } : {}) }, 'admin', shared);
      return { p, saved };
    }
    async function publish(fixture) {
      const reviewed = await lifecycle.review(fixture.p, { version: fixture.saved.version }, 'admin');
      return lifecycle.publish(fixture.p, { version: reviewed.version }, 'admin');
    }
    const row = (name, points, rank, count, positions) => ({ unit_id: units[name], unit_name: name,
      total_points: String(points), rank: String(rank), winning_entries: String(count), position_wins: positions });
    let expected = ['Alpha','Beta','Zero'].map((name) => row(name, 0, 1, 0, {}));
    await serveResultLifecycle({ drafts, lifecycle, scoring }, async (request) => {
      async function get(path) {
        const response = await request(path, 'GET', undefined, null);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        return response.body.leaderboard;
      }
      function sum(rows, field) { return rows.reduce((total, entry) => total + BigInt(entry[field]), 0n).toString(); }
      async function check() {
        const overall = await get(url);
        assert.deepEqual(overall, expected);
        assert.deepEqual(await get(url), overall); // Stable ranks and tie display order.
        assert.doesNotMatch(JSON.stringify(overall), /candidate|madrasa|override|audit|review|reason|created_at|updated_at/);
        const byCategory = [];
        for (const categoryId of [category, secondCategory, emptyCategory]) {
          const base = `/api/competitions/${competitionId}/categories/${categoryId}/leaderboard`;
          const categoryUnits = await get(`${base}/units`);
          const categoryCandidates = await get(`${base}/candidates`);
          assert.deepEqual(await get(`${base}/units`), categoryUnits);
          assert.deepEqual(await get(`${base}/candidates`), categoryCandidates);
          for (const unit of categoryUnits) {
            const contributing = categoryCandidates.filter((entry) => entry.unit_id === unit.unit_id);
            assert.equal(unit.total_points, sum(contributing, 'total_points'));
            assert.equal(unit.winning_entries, sum(contributing, 'winning_entries'));
            for (const position of ['1','2']) assert.equal(unit.position_wins[position] ?? '0', contributing.reduce((n, entry) => n + BigInt(entry.position_wins[position] ?? 0), 0n).toString());
          }
          byCategory.push(categoryUnits);
        }
        for (const unit of overall) {
          const contributing = byCategory.flatMap((entries) => entries.filter((entry) => entry.unit_id === unit.unit_id));
          assert.equal(unit.total_points, sum(contributing, 'total_points'));
          assert.equal(unit.winning_entries, sum(contributing, 'winning_entries'));
          for (const position of ['1','2']) assert.equal(unit.position_wins[position] ?? '0', contributing.reduce((n, entry) => n + BigInt(entry.position_wins[position] ?? 0), 0n).toString());
        }
      }
      assert.deepEqual(await get(url.replace(`/competitions/${competitionId}/`, `/competitions/${emptyId}/`)), []);
      await check(); // Registered units and candidates without any publications.
      const first = await prepare('First', [win(a, 1), win(b, 2), win(c, 1)], category, true);
      await check();
      const reviewed = await lifecycle.review(first.p, { version: first.saved.version }, 'admin');
      await check();
      const published = await lifecycle.publish(first.p, { version: reviewed.version }, 'admin');
      expected = [row('Alpha', 8, 1, 2, { 1: '1', 2: '1' }), row('Beta', 5, 2, 1, { 1: '1' }), row('Zero', 0, 3, 0, {})];
      await check(); // Full shared-position points and multiple candidates per unit.
      await publish(await prepare('Second', [win(d, 1), win(e, 2)], secondCategory));
      expected = [row('Alpha', 11, 1, 3, { 1: '1', 2: '2' }), row('Beta', 10, 2, 2, { 1: '2' }), row('Zero', 0, 3, 0, {})];
      await check(); // Madrassa and non-Madrassa winners across categories.
      await publish(await prepare('Third', [win(a, 1), win(c, 2)]));
      expected = [row('Alpha', 16, 1, 4, { 1: '2', 2: '2' }), row('Beta', 13, 2, 3, { 1: '2', 2: '1' }), row('Zero', 0, 3, 0, {})];
      await check();
      const unpublished = await prepare('Reviewed only', [win(z, 1), win(b, 2)]);
      await lifecycle.review(unpublished.p, { version: unpublished.saved.version }, 'admin');
      await check();
      const foreignA = await register('001', 'Foreign', foreignUnit, foreignCategory, null, foreignId);
      const foreignB = await register('002', 'Foreign second', foreignUnit, foreignCategory, null, foreignId);
      await publish(await prepare('Foreign', [win(foreignA, 1), win(foreignB, 2)], foreignCategory, false, foreignId));
      await check();
      assert.deepEqual(await get(url.replace(`/competitions/${competitionId}/`, `/competitions/${foreignId}/`)), [
        { unit_id: foreignUnit, unit_name: 'Foreign', total_points: '150', rank: '1', winning_entries: '2', position_wins: { 1: '1', 2: '1' } },
      ]);
      let correction = await lifecycle.startCorrection(first.p, { version: published.version, reason: 'Correct signed winner sheet' }, 'admin');
      const cp = { ...first.p, correctionId: correction.id };
      correction = await lifecycle.saveCorrection(cp, { version: correction.version, entries: [win(c, 1), win(b, 2)],
        shared_positions: true, reason: 'Signed correction removes the tied group' }, 'admin', true);
      await check();
      correction = await lifecycle.review(cp, { version: correction.version }, 'admin', true);
      await check();
      await lifecycle.publish(cp, { version: correction.version }, 'admin', true);
      expected = [row('Beta', 13, 1, 3, { 1: '2', 2: '1' }), row('Alpha', 11, 2, 3, { 1: '1', 2: '2' }), row('Zero', 0, 3, 0, {})];
      await check(); // Correction changes all affected leaderboards without history duplication.
      assert.equal((await pool.query('SELECT count(*) FROM result_publications WHERE event_id=$1', [first.p.eventId])).rows[0].count, '2');
      await competitions.updateSettings(competitionId, { position_points: { 1: 3, 2: 3 } }, 'admin');
      expected = [row('Alpha', 9, 1, 3, { 1: '1', 2: '2' }), row('Beta', 9, 1, 3, { 1: '2', 2: '1' }), row('Zero', 0, 3, 0, {})];
      await check(); // Shared rank with alphabetical display despite differing win distributions.
      const rollback = new Error('Rollback uncommitted settings');
      await assert.rejects(db.transaction(async (query) => {
        await query('UPDATE competition_settings SET position_points=$2::jsonb WHERE competition_id=$1', [competitionId, JSON.stringify({ 1: 999 })]);
        await check();
        throw rollback;
      }), (error) => error === rollback);
      await competitions.updateSettings(competitionId, { position_points: { 1: Number.MAX_SAFE_INTEGER, 2: 0 } }, 'admin');
      expected = [row('Beta', '18014398509481982', 1, 3, { 1: '2', 2: '1' }), row('Alpha', '9007199254740991', 2, 3, { 1: '1', 2: '2' }), row('Zero', 0, 3, 0, {})];
      await check();
      await competitions.updateSettings(competitionId, { position_points: {} }, 'admin');
      expected = [row('Alpha', 0, 1, 3, { 1: '1', 2: '2' }), row('Beta', 0, 1, 3, { 1: '2', 2: '1' }), row('Zero', 0, 1, 0, {})];
      await check();
      await pool.query('DELETE FROM competition_settings WHERE competition_id=$1', [competitionId]);
      await check();
      assert.equal((await request(url.replace(`/competitions/${competitionId}/`, '/competitions/9223372036854775807/'), 'GET', undefined, null)).status, 404);
      const before = (await pool.query('SELECT count(*) FROM audit_logs')).rows[0];
      for (const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await request(url, method, { total_points: 999 }, null)).status, 404);
      assert.deepEqual((await pool.query('SELECT count(*) FROM audit_logs')).rows[0], before);
      const failingScoring = createScoringService({ transaction: (work) => db.transaction((query) =>
        work((sql, values) => query(sql.startsWith('WITH scores') ? 'SELECT 1 / 0' : sql, sql.startsWith('WITH scores') ? [] : values))) });
      const original = scoring.overallUnits;
      scoring.overallUnits = failingScoring.overallUnits;
      try {
        const response = await request(url, 'GET', undefined, null);
        assert.equal(response.status, 500);
        assert.deepEqual(response.body, { error: 'Internal server error' });
      } finally { scoring.overallUnits = original; }
      await check();
    });

    // Explain the actual service statements on a larger, rollback-only publication history.
    const benchmarkRollback = new Error('Rollback query-plan fixtures');
    await assert.rejects(db.transaction(async (query) => {
      await query('INSERT INTO competition_settings(competition_id,position_points) VALUES ($1,$2::jsonb)', [competitionId, JSON.stringify({ 1: 5, 2: 3 })]);
      await query(`WITH added_events AS (
        INSERT INTO events(competition_id,category_id,name)
        SELECT $1,CASE WHEN n%2=0 THEN $2::bigint ELSE $3::bigint END,'Plan event '||n FROM generate_series(1,500) n RETURNING *
      ), added_results AS (
        INSERT INTO event_results(competition_id,category_id,event_id,status,reviewed_by,reviewed_at,published_by,published_at)
        SELECT competition_id,category_id,id,'published','fixture',now(),'fixture',now() FROM added_events RETURNING *
      )
      INSERT INTO result_publications(competition_id,event_result_id,event_id,category_id,reviewed_by,reviewed_at,published_by,published_at,snapshot)
      SELECT r.competition_id,r.id,r.event_id,r.category_id,'fixture',now(),'fixture',now(),
        jsonb_build_object('winners',CASE WHEN r.category_id=$2 THEN $4::jsonb ELSE $5::jsonb END)
      FROM added_results r CROSS JOIN generate_series(1,10) history`,
      [competitionId, category, secondCategory,
        JSON.stringify([a,b,c].map((candidate, i) => ({ candidate_code: candidate.candidate_code, position: i === 1 ? 2 : 1, unit: { id: candidate.unit_id } }))),
        JSON.stringify([d,e,f].map((candidate, i) => ({ candidate_code: candidate.candidate_code, position: i === 1 ? 2 : 1, unit: { id: candidate.unit_id } })))]);
      for (const table of ['events','event_results','result_publications','competition_settings','units','candidates','madrasas']) await query(`ANALYZE ${table}`);
      let statementCount;
      let label;
      const inspect = createScoringService({ transaction: async (work) => {
        statementCount = 0;
        return work(async (sql, values) => {
          statementCount++;
          if (sql.startsWith('WITH scores')) {
            const explained = (await query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, values)).rows[0]['QUERY PLAN'][0];
            const indexes = new Set();
            const scans = [];
            const walk = (plan) => {
              if (plan['Index Name']) indexes.add(plan['Index Name']);
              if (plan['Relation Name']) scans.push({ relation: plan['Relation Name'], node: plan['Node Type'], rows: plan['Actual Rows'], loops: plan['Actual Loops'] });
              for (const child of plan.Plans ?? []) walk(child);
            };
            walk(explained.Plan);
            t.diagnostic(JSON.stringify({ leaderboard: label, events: 500, historical_publications: 5000,
              planning_ms: explained['Planning Time'], execution_ms: explained['Execution Time'],
              shared_hit_blocks: explained.Plan['Shared Hit Blocks'], temp_written_blocks: explained.Plan['Temp Written Blocks'],
              indexes: [...indexes], scans }));
          }
          return query(sql, values);
        });
      } });
      for (const method of ['categoryUnits','categoryCandidates','overallUnits']) {
        label = method;
        await inspect[method](method === 'overallUnits' ? params : { ...params, categoryId: category });
        assert.equal(statementCount, method === 'overallUnits' ? 2 : 3, 'Database calls must remain constant, independent of events/units');
      }
      throw benchmarkRollback;
    }), (error) => error === benchmarkRollback);
  });
});
