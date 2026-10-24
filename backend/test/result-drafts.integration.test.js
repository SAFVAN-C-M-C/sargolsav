import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createCandidateService } from '../src/services/candidates.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveResultDrafts } from '../test-support/result-drafts-http.js';

test('TKT-06B real PostgreSQL event result drafts', { timeout: 300000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competition = await insert("INSERT INTO competitions(code,name) VALUES ('draft-one','One') RETURNING id");
    const other = await insert("INSERT INTO competitions(code,name) VALUES ('draft-two','Two') RETURNING id");
    await pool.query('INSERT INTO competition_settings(competition_id,position_points) VALUES ($1,$2::jsonb)', [competition, JSON.stringify({ 1: 10, 2: 5, 3: 0 })]);
    const category = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'One') RETURNING id", [competition]);
    const secondCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Two') RETURNING id", [competition]);
    const foreignCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [other]);
    const unit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'One') RETURNING id", [competition]);
    const secondUnit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Two') RETURNING id", [competition]);
    const foreignUnit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [other]);
    const madrasa = await insert("INSERT INTO madrasas(competition_id,unit_id,name) VALUES ($1,$2,'One') RETURNING id", [competition, unit]);
    const event = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'One') RETURNING id", [competition, category]);
    const secondEvent = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Two') RETURNING id", [competition, category]);
    const otherEvent = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Other') RETURNING id", [competition, secondCategory]);
    const foreignEvent = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Foreign') RETURNING id", [other, foreignCategory]);
    const service = createResultDraftService(db);
    const params = { competitionId: competition, categoryId: category, eventId: event };
    const root = `/${competition}/categories/${category}/events/${event}/result-draft`;
    const secondRoot = `/${competition}/categories/${category}/events/${secondEvent}/result-draft`;
    const winner = { candidate_code: '001', name: 'Winner One', unit_id: unit, position: 1 };
    const existing = await createCandidateService(db).create({ competitionId: competition }, {
      candidate_code: '002', name: 'Winner Two', unit_id: unit, category_id: category, madrasa_id: madrasa,
    }, 'fixture-admin');
    const winner2 = { candidate_code: '002', name: existing.name, unit_id: unit, madrasa_id: madrasa, position: 2 };
    const counts = async () => (await pool.query(`SELECT (SELECT count(*) FROM candidates) AS candidates,
      (SELECT count(*) FROM event_results) AS results, (SELECT count(*) FROM result_entries) AS entries,
      (SELECT count(*) FROM audit_logs) AS audits`)).rows[0];
    let draft;
    await serveResultDrafts(service, async (request) => {
      await t.test('status lists include uninitialized events; initialize is atomic, private and idempotent', async () => {
        assert.equal((await request(root)).status, 404);
        assert.equal((await request(root, 'PUT', { version: '1:20261024000000.000000', entries: [] })).status, 404);
        const statuses = await request(`/${competition}/result-statuses`);
        assert.equal(statuses.status, 200); assert.equal(statuses.body.results.length, 3);
        assert.ok(statuses.body.results.every((r) => r.status === 'not_started' && r.event_result_id === null));
        const scoped = await request(`/${competition}/categories/${category}/result-statuses`);
        assert.deepEqual(scoped.body.results.map((r) => r.event_id), [event, secondEvent]);
        assert.deepEqual((await request(`/${competition}/result-statuses?category_id=${category}`)).body, scoped.body);
        const created = await request(root, 'POST', {});
        assert.equal(created.status, 201); assert.equal(created.headers.get('cache-control'), 'no-store');
        draft = created.body.draft; assert.equal(draft.status, 'draft'); assert.deepEqual(draft.entries, []);
        assert.match(draft.version, /^[0-9]+:[0-9]{14}\.[0-9]{6}$/);
        const before = await counts();
        const repeated = await request(root, 'POST'); assert.equal(repeated.status, 200);
        assert.deepEqual(repeated.body.draft, draft); assert.deepEqual(await counts(), before);
        assert.deepEqual((await request(root)).body.draft, draft);
        const concurrent = await Promise.all([request(secondRoot, 'POST', {}), request(secondRoot, 'POST', {})]);
        assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 201]);
        assert.equal(concurrent[0].body.draft.id, concurrent[1].body.draft.id);
      });
      await t.test('save resolves existing and new candidates, then replaces/removes winners and allows empty/incomplete drafts', async () => {
        const before = await counts();
        const saved = await request(root, 'PUT', { version: draft.version, entries: [winner2, winner] });
        assert.equal(saved.status, 200); draft = saved.body.draft;
        assert.equal(draft.status, 'draft'); assert.deepEqual(draft.entries.map((r) => r.position), [1, 2]);
        assert.equal(draft.entries[0].candidate_code, '001'); assert.equal(draft.entries[0].madrasa_id, null);
        assert.equal(draft.entries[1].candidate_id, existing.id); assert.equal(draft.entries[1].madrasa_id, madrasa);
        const after = await counts(); assert.equal(BigInt(after.candidates), BigInt(before.candidates) + 1n);
        assert.equal(BigInt(after.audits), BigInt(before.audits) + 2n);
        assert.deepEqual((await request(root, 'POST', {})).body.draft, draft);
        assert.deepEqual(await counts(), after);
        const version = draft.version;
        const replacement = await request(root, 'PUT', { version, entries: [{ ...winner2, position: 3 }] });
        assert.equal(replacement.status, 200); draft = replacement.body.draft;
        assert.notEqual(draft.version, version); assert.equal(draft.entries.length, 1);
        assert.equal(draft.entries[0].position, 3); assert.equal(draft.entries[0].candidate_id, existing.id);
        const empty = await request(root, 'PUT', { version: draft.version, entries: [] });
        assert.equal(empty.status, 200); draft = empty.body.draft; assert.deepEqual(draft.entries, []);
        assert.equal((await pool.query('SELECT count(*) FROM candidates WHERE competition_id=$1', [competition])).rows[0].count, '2');
        const state = (await pool.query('SELECT status,reviewed_at,reviewed_by,published_at,published_by FROM event_results WHERE id=$1', [draft.id])).rows[0];
        assert.deepEqual(state, { status: 'draft', reviewed_at: null, reviewed_by: null, published_at: null, published_by: null });
        assert.deepEqual((await request(root)).body.draft, draft);
      });
      await t.test('duplicates, unsupported positions and candidate conflicts never alter a draft or leave candidates', async () => {
        const before = await counts();
        for (const [entries, expected] of [
          [[winner, winner], 400], [[winner, { ...winner, candidate_code: 'different' }], 400],
          [[{ ...winner, candidate_code: 'unconfigured', position: 4 }], 400],
          [[{ ...winner, name: 'Wrong name' }], 409], [[{ ...winner, unit_id: secondUnit }], 409],
          [[{ ...winner2, madrasa_id: null }], 409], [[{ ...winner, unit_id: foreignUnit }], 400],
          [[{ ...winner, unit_id: secondUnit, madrasa_id: madrasa }], 400],
          [[{ ...winner, madrasa_id: '9223372036854775807' }], 400],
        ]) {
          const response = await request(root, 'PUT', { version: draft.version, entries });
          assert.equal(response.status, expected, JSON.stringify(entries));
          assert.deepEqual((await request(root)).body.draft, draft);
        }
        assert.deepEqual(await counts(), before);
        const otherCandidate = await createCandidateService(db).create({ competitionId: competition }, {
          candidate_code: 'wrong-category', name: 'Other', unit_id: unit, category_id: secondCategory,
        }, 'fixture-admin');
        const response = await request(root, 'PUT', { version: draft.version, entries: [{ candidate_code: otherCandidate.candidate_code, name: otherCandidate.name, unit_id: unit, position: 1 }] });
        assert.equal(response.status, 409);
      });
      await t.test('all event paths and category status filters enforce complete parent scope', async () => {
        const before = await counts();
        for (const bad of [
          `/${other}/categories/${category}/events/${event}/result-draft`,
          `/${competition}/categories/${secondCategory}/events/${event}/result-draft`,
          `/${competition}/categories/${category}/events/${foreignEvent}/result-draft`,
          `/${competition}/categories/${foreignCategory}/events/${otherEvent}/result-draft`,
          `/${competition}/categories/${category}/events/9223372036854775807/result-draft`,
          `/9223372036854775807/categories/${category}/events/${event}/result-draft`,
        ]) {
          for (const [method, body] of [['GET'], ['POST', {}], ['PUT', { version: draft.version, entries: [] }]]) {
            assert.equal((await request(bad, method, body)).status, 404, `${method} ${bad}`);
          }
        }
        assert.equal((await request(`/${competition}/result-statuses?category_id=${foreignCategory}`)).status, 404);
        assert.deepEqual(await counts(), before);
      });
      await t.test('a late candidate conflict rolls back earlier resolution and keeps old entries', async () => {
        const saved = await request(root, 'PUT', { version: draft.version, entries: [winner] });
        assert.equal(saved.status, 200); draft = saved.body.draft;
        const before = await counts();
        const response = await request(root, 'PUT', { version: draft.version, entries: [
          { ...winner, candidate_code: '000-new-rollback', name: 'New', position: 1 }, { ...winner2, name: 'Wrong', position: 2 },
        ] });
        assert.equal(response.status, 409); assert.deepEqual(await counts(), before);
        assert.deepEqual((await request(root)).body.draft, draft);
      });
      await t.test('two editors with the same version produce one save and one conflict without loser candidates', async () => {
        const before = await counts();
        const results = await Promise.all([
          request(root, 'PUT', { version: draft.version, entries: [{ ...winner, candidate_code: 'race-a' }] }),
          request(root, 'PUT', { version: draft.version, entries: [{ ...winner, candidate_code: 'race-b' }] }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        draft = results.find((r) => r.status === 200).body.draft;
        assert.deepEqual((await request(root)).body.draft, draft);
        const after = await counts(); assert.equal(BigInt(after.candidates), BigInt(before.candidates) + 1n);
        assert.equal(BigInt(after.audits), BigInt(before.audits) + 2n);
        assert.equal((await request(root, 'PUT', { version: '1:20261024000000.000000', entries: [] })).status, 409);
      });
      await t.test('reviewed/published records cannot be initialized, read as drafts or overwritten', async () => {
        for (const status of ['reviewed', 'published']) {
          await pool.query(`UPDATE event_results SET status=$2,reviewed_at=now(),reviewed_by='fixture',
            published_at=CASE WHEN $2='published' THEN now() END,published_by=CASE WHEN $2='published' THEN 'fixture' END WHERE id=$1`, [draft.id, status]);
          const before = await counts();
          for (const [method, body] of [['GET'], ['POST', {}], ['PUT', { version: draft.version, entries: [] }]]) {
            assert.equal((await request(root, method, body)).status, 409);
          }
          assert.equal((await request(`/${competition}/result-statuses`)).body.results.find((r) => r.event_id === event).status, status);
          assert.deepEqual(await counts(), before);
          assert.equal((await pool.query('SELECT candidate_id FROM result_entries WHERE event_result_id=$1', [draft.id])).rows[0].candidate_id, draft.entries[0].candidate_id);
        }
      });
      await t.test('draft mutation audits use verified UID with event scope and before/after entries', async () => {
        const rows = (await pool.query("SELECT * FROM audit_logs WHERE action LIKE 'result_draft_%' ORDER BY id")).rows;
        assert.ok(rows.length >= 5);
        assert.ok(rows.every((r) => r.actor_ref === 'trusted-draft-admin' && r.competition_id === competition && [event, secondEvent].includes(r.event_id)));
        assert.equal(rows.filter((r) => r.action === 'result_draft_created').length, 2);
        const updated = rows.find((r) => r.action === 'result_draft_updated');
        assert.deepEqual(updated.details.before.entries, []); assert.equal(updated.details.after.entries.length, 2);
        const candidateAudits = (await pool.query("SELECT actor_ref FROM audit_logs WHERE action='candidate_created' AND actor_ref <> 'fixture-admin'")).rows;
        assert.ok(candidateAudits.length > 0); assert.ok(candidateAudits.every((r) => r.actor_ref === 'trusted-draft-admin'));
        const before = await counts();
        assert.equal((await request(secondRoot, 'PUT', { version: '1:20261024000000.000000', entries: [], actor_ref: 'spoof' })).status, 400);
        assert.deepEqual(await counts(), before);
      });
    });
    await t.test('actual entry and audit SQL failures roll back replacements, new candidates, header and audits', async (t) => {
      t.mock.method(console, 'error', () => {});
      const secondParams = { ...params, eventId: secondEvent };
      const initial = await service.get(secondParams);
      const baseline = await service.save(secondParams, { version: initial.version, entries: [winner] }, 'fixture-admin');
      const before = await counts();
      for (const fail of [/INSERT INTO result_entries/, /INSERT INTO audit_logs/]) {
        const faulty = createResultDraftService({ transaction: (work) => db.transaction((query) => work((sql, values) =>
          fail.test(sql) && (!/audit_logs/.test(sql) || values[3] === 'result_draft_updated')
            ? query('SELECT * FROM missing_tkt06b_table') : query(sql, values))) });
        await serveResultDrafts(faulty, async (request) => {
          const response = await request(secondRoot, 'PUT', { version: baseline.version, entries: [{ ...winner, candidate_code: 'failure-new' }] });
          assert.equal(response.status, 500); assert.deepEqual(response.body, { error: 'Internal server error' });
        });
        assert.deepEqual(await counts(), before); assert.deepEqual(await service.get(secondParams), baseline);
      }
      const auditFailure = createResultDraftService({ transaction: (work) => db.transaction((query) => work((sql, values) =>
        /INSERT INTO audit_logs/.test(sql) ? query('SELECT * FROM missing_tkt06b_audit') : query(sql, values))) });
      await assert.rejects(auditFailure.initialize({ ...params, categoryId: secondCategory, eventId: otherEvent }, {}, 'fixture-admin'), { code: '42P01' });
      assert.deepEqual(await counts(), before);
    });
    await t.test('empty drafts work without configured positions; nonempty saves are rejected', async () => {
      const foreignParams = { competitionId: other, categoryId: foreignCategory, eventId: foreignEvent };
      const { draft } = await service.initialize(foreignParams, {}, 'fixture-admin');
      const empty = await service.save(foreignParams, { version: draft.version, entries: [] }, 'fixture-admin');
      assert.deepEqual(empty.entries, []);
      await assert.rejects(service.save(foreignParams, { version: empty.version, entries: [{ ...winner, unit_id: foreignUnit }] }, 'fixture-admin'), { status: 400 });
    });
  });
});
