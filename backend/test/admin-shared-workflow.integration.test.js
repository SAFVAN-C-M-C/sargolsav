import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createResultLifecycleService, createPublicResultService } from '../src/services/resultLifecycle.js';
import { createScoringService } from '../src/services/scoring.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

// Existing tests verify each subsystem; this closes the gap between an ordinary
// publication and a new correction tie, checking all public projections together.
test('TKT-09G isolated PostgreSQL ordinary publication to shared correction and full public points', { timeout: 600000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competition = await insert("INSERT INTO competitions(code,name) VALUES ('09g-workflow','Workflow') RETURNING id");
    const other = await insert("INSERT INTO competitions(code,name) VALUES ('09g-other','Isolated') RETURNING id");
    const category = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Category') RETURNING id", [competition]);
    const event = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Event') RETURNING id", [competition, category]);
    const unit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Unit') RETURNING id", [competition]);
    await pool.query('INSERT INTO competition_settings(competition_id,position_points) VALUES ($1,$2::jsonb)', [competition, JSON.stringify({ 1: 5, 2: 3 })]);
    const services = { drafts: createResultDraftService(db), lifecycle: createResultLifecycleService(db), publicResults: createPublicResultService(db), scoring: createScoringService(db) };
    const root = `/api/admin/competitions/${competition}/categories/${category}/events/${event}`;
    const publicRoot = root.replace('/api/admin/', '/api/');
    const scoreRoot = `/api/competitions/${competition}`;
    const winner = (code, name, position) => ({ candidate_code: code, name, unit_id: unit, madrasa_id: null, position });
    const a = winner('001', 'First', 1); const b = winner('002', 'Second', 2); const c = winner('1', 'Shared first', 1);
    await serveResultLifecycle(services, async (request) => {
      const ok = async (path, method = 'GET', body, key, token = 'admin', expected = 200) => {
        const response = await request(path, method, body, token);
        assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(response.body)}`);
        return key ? response.body[key] : response.body;
      };
      const visible = async () => ({
        result: await ok(`${publicRoot}/result`, 'GET', undefined, 'result', null),
        units: await ok(`${scoreRoot}/categories/${category}/leaderboard/units`, 'GET', undefined, 'leaderboard', null),
        candidates: await ok(`${scoreRoot}/categories/${category}/leaderboard/candidates`, 'GET', undefined, 'leaderboard', null),
        overall: await ok(`${scoreRoot}/leaderboard/units`, 'GET', undefined, 'leaderboard', null),
      });
      let draft = await ok(`${root}/result-draft`, 'POST', {}, 'draft', 'admin', 201);
      draft = await ok(`${root}/result-draft`, 'PUT', { version: draft.version, entries: [a, b] }, 'draft');
      const firstCandidateId = draft.entries.find((entry) => entry.candidate_code === '001').candidate_id;
      assert.equal((await request(`${publicRoot}/result`, 'GET', undefined, null)).status, 404);
      let result = await ok(`${root}/result/review`, 'POST', { version: draft.version }, 'result', 'reviewer');
      result = await ok(`${root}/result/publish`, 'POST', { version: result.version }, 'result', 'publisher');
      const original = await visible();
      assert.equal(original.units[0].total_points, '8'); assert.equal(original.overall[0].total_points, '8');
      let correction = await ok(`${root}/result/corrections`, 'POST', { version: result.version, reason: 'Reconcile signed result sheet' }, 'correction', 'admin', 201);
      const correctionPath = `${root}/result/corrections/${correction.id}`;
      // Reuse a registered candidate (001), and create a distinct exact code (1).
      const staleVersion = correction.version;
      const payload = { version: correction.version, shared_positions: true, reason: 'Judges confirmed equal marks on signed sheet', entries: [a, b, c] };
      assert.equal((await request(`${correctionPath}/shared-positions`, 'PUT', payload, null)).status, 401);
      assert.equal((await request(`${correctionPath}/shared-positions`, 'PUT', payload, 'public')).status, 403);
      assert.equal((await request(`${correctionPath}/shared-positions`, 'PUT', { ...payload, entries: [a, a, b] })).status, 400);
      assert.equal((await request(correctionPath.replace(`/competitions/${competition}/`, `/competitions/${other}/`) + '/shared-positions', 'PUT', payload)).status, 404);
      correction = await ok(`${correctionPath}/shared-positions`, 'PUT', payload, 'correction');
      assert.equal(correction.entries.find((entry) => entry.candidate_code === '001').candidate_id, firstCandidateId);
      const audit = (await pool.query("SELECT * FROM audit_logs WHERE competition_id=$1 AND action='shared_position_override'", [competition])).rows;
      assert.equal(audit.length, 1); assert.equal(audit[0].actor_ref, 'verified-admin'); assert.equal(audit[0].reason, payload.reason);
      assert.equal(audit[0].details.correction_id, correction.id); assert.equal(audit[0].details.event_result_id, result.id);
      assert.deepEqual(correction.entries.filter((entry) => entry.position === 1).map((entry) => entry.override_audit_id), [audit[0].id, audit[0].id]);
      const afterSave = await visible();
      assert.deepEqual(afterSave.result, original.result); assert.deepEqual(afterSave.units, original.units); assert.deepEqual(afterSave.overall, original.overall);
      // Candidate registry membership can grow while private, but never receives points.
      assert.equal(afterSave.candidates.find((entry) => entry.candidate_code === '1').total_points, '0');
      assert.equal((await request(`${correctionPath}/shared-positions`, 'PUT', { ...payload, version: staleVersion })).status, 409);
      correction = await ok(`${correctionPath}/review`, 'POST', { version: correction.version }, 'correction', 'reviewer');
      const reviewed = await visible(); assert.deepEqual(reviewed.result, original.result); assert.deepEqual(reviewed.units, original.units); assert.deepEqual(reviewed.candidates, afterSave.candidates); assert.deepEqual(reviewed.overall, original.overall);
      await ok(`${correctionPath}/publish`, 'POST', { version: correction.version }, 'correction', 'publisher');
      const current = await visible();
      assert.notEqual(current.result.publication_id, original.result.publication_id);
      assert.deepEqual(current.result.winners.map((entry) => entry.candidate_code), ['001', '1', '002']);
      assert.equal(current.units[0].total_points, '13'); assert.equal(current.overall[0].total_points, '13');
      assert.equal(current.units[0].winning_entries, '3');
      for (const [code, points] of [['001', '5'], ['1', '5'], ['002', '3']]) assert.equal(current.candidates.find((entry) => entry.candidate_code === code).total_points, points);
      assert.doesNotMatch(JSON.stringify(current), /override|audit|reason|actor_ref|reviewed_by/);
      const publications = (await pool.query('SELECT id FROM result_publications WHERE event_id=$1 ORDER BY id', [event])).rows;
      assert.deepEqual(publications.map((row) => row.id), [original.result.publication_id, current.result.publication_id]);
      assert.equal((await pool.query('SELECT count(*) FROM candidates WHERE competition_id=$1', [competition])).rows[0].count, '3');
      assert.equal((await pool.query('SELECT count(*) FROM audit_logs WHERE competition_id=$1', [other])).rows[0].count, '0');
      assert.deepEqual(await ok(`/api/competitions/${other}/leaderboard/units`, 'GET', undefined, 'leaderboard', null), []);
    });
  });
});
