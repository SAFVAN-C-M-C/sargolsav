import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCandidateService, resolveCandidate } from '../src/services/candidates.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveCandidates } from '../test-support/candidates-http.js';

test('TKT-06A PostgreSQL candidate management and transaction resolution', { timeout: 240000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competition = await insert("INSERT INTO competitions(code,name) VALUES ('candidate-one','One') RETURNING id");
    const other = await insert("INSERT INTO competitions(code,name) VALUES ('candidate-two','Two') RETURNING id");
    const unit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'One') RETURNING id", [competition]);
    const secondUnit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Two') RETURNING id", [competition]);
    const foreignUnit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [other]);
    const category = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'One') RETURNING id", [competition]);
    const secondCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Two') RETURNING id", [competition]);
    const foreignCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [other]);
    const madrasa = await insert("INSERT INTO madrasas(competition_id,unit_id,name) VALUES ($1,$2,'One') RETURNING id", [competition, unit]);
    const secondMadrasa = await insert("INSERT INTO madrasas(competition_id,unit_id,name) VALUES ($1,$2,'Two') RETURNING id", [competition, unit]);
    const service = createCandidateService(db);
    const params = { competitionId: competition };
    const body = { candidate_code: '001', name: 'Same name', unit_id: unit, category_id: category };
    const root = `/${competition}/candidates`;
    const resolve = (value) => db.transaction((query) => resolveCandidate(query, { competition_id: competition, ...value }, 'resolver-admin'));
    const counts = async () => (await pool.query('SELECT (SELECT count(*) FROM candidates) AS candidates, (SELECT count(*) FROM audit_logs) AS audits')).rows[0];
    let candidate;
    await serveCandidates(service, async (request) => {
      await t.test('HTTP create, exact code lookup, list filters, details, correction and audit attribution', async () => {
        const created = await request(root, 'POST', body);
        assert.equal(created.status, 201); candidate = created.body.candidate;
        assert.equal(candidate.candidate_code, '001'); assert.equal(candidate.madrasa_id, null);
        assert.equal(typeof candidate.id, 'string');
        assert.deepEqual((await request(`${root}/lookup?candidate_code=001`)).body.candidate, candidate);
        assert.equal((await request(`${root}/lookup?candidate_code=1`)).status, 404);
        assert.deepEqual((await request(`${root}/${candidate.id}`)).body.candidate, candidate);
        assert.deepEqual((await request(`${root}?unit_id=${unit}&category_id=${category}`)).body.candidates, [candidate]);
        assert.deepEqual((await request(`${root}?unit_id=${foreignUnit}`)).body.candidates, []);
        const another = await request(root, 'POST', { ...body, candidate_code: '002', madrasa_id: madrasa });
        assert.equal(another.status, 201); assert.notEqual(another.body.candidate.id, candidate.id);
        assert.equal((await request(root)).body.candidates.length, 2);
        assert.equal((await request(root, 'POST', body)).status, 409);
        const corrected = await request(`${root}/${candidate.id}`, 'PATCH', { name: "Corrected 'name'; SELECT secret --" });
        assert.equal(corrected.status, 200); assert.notEqual(corrected.body.candidate.updated_at, candidate.updated_at);
        assert.equal(corrected.body.candidate.candidate_code, '001');
        candidate = corrected.body.candidate;
        const audits = (await pool.query('SELECT * FROM audit_logs ORDER BY id')).rows;
        assert.equal(audits.length, 3);
        assert.ok(audits.every((row) => row.actor_ref === 'trusted-candidate-admin'));
        assert.equal(audits[2].details.before.name, body.name);
        assert.equal(audits[2].details.after.name, candidate.name);
        assert.equal((await request(root, 'POST', { ...body, candidate_code: 'spoof', actor_ref: 'spoof' })).status, 400);
      });
      await t.test('invalid relationships, isolation and missing records leave no writes', async () => {
        const before = await counts();
        for (const override of [{ unit_id: foreignUnit }, { category_id: foreignCategory },
          { unit_id: secondUnit, madrasa_id: madrasa }, { madrasa_id: '9223372036854775807' }]) {
          assert.equal((await request(root, 'POST', { ...body, candidate_code: 'bad', ...override })).status, 400);
        }
        for (const [path, method, value] of [[`/${other}/candidates/${candidate.id}`, 'GET'],
          [`/${other}/candidates/${candidate.id}`, 'PATCH', { name: 'Wrong' }],
          [`/${other}/candidates/lookup?candidate_code=001`, 'GET'], ['/9223372036854775807/candidates', 'GET'],
          [`${root}/9223372036854775807`, 'GET']]) assert.equal((await request(path, method, value)).status, 404);
        assert.equal((await request(`${root}/${candidate.id}`, 'DELETE')).status, 404);
        assert.deepEqual(await counts(), before);
        const cross = await request(`/${other}/candidates`, 'POST', { ...body, unit_id: foreignUnit, category_id: foreignCategory });
        assert.equal(cross.status, 201); assert.notEqual(cross.body.candidate.id, candidate.id);
      });
      await t.test('simultaneous HTTP creates produce one candidate and one audit', async () => {
        const before = await counts();
        const results = await Promise.all([request(root, 'POST', { ...body, candidate_code: 'race-http' }), request(root, 'POST', { ...body, candidate_code: 'race-http' })]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        const after = await counts();
        assert.equal(BigInt(after.candidates), BigInt(before.candidates) + 1n);
        assert.equal(BigInt(after.audits), BigInt(before.audits) + 1n);
      });
    });
    await t.test('resolver reuses exact identity, rejects every affiliation/name conflict and creates once concurrently', async () => {
      const value = { ...body, candidate_code: 'resolve', madrasa_id: madrasa };
      const before = await counts();
      const results = await Promise.all([resolve(value), resolve(value), resolve(value)]);
      assert.ok(results.every((row) => row.id === results[0].id));
      assert.equal((await resolve(value)).id, results[0].id);
      const after = await counts();
      assert.equal(BigInt(after.candidates), BigInt(before.candidates) + 1n);
      assert.equal(BigInt(after.audits), BigInt(before.audits) + 1n);
      for (const override of [{ name: 'Different' }, { unit_id: secondUnit, madrasa_id: null },
        { category_id: secondCategory }, { madrasa_id: null }, { madrasa_id: secondMadrasa }]) {
        await assert.rejects(resolve({ ...value, ...override }), { status: 409 });
      }
      await assert.rejects(resolve({ ...value, unit_id: foreignUnit }), { status: 400 });
      assert.deepEqual(await counts(), after);
      assert.equal((await pool.query("SELECT actor_ref FROM audit_logs WHERE details->'after'->>'candidate_code' = 'resolve'")).rows[0].actor_ref, 'resolver-admin');
    });
    await t.test('outer failure rolls back new candidates and audit together', async () => {
      const before = await counts();
      await assert.rejects(db.transaction(async (query) => {
        await resolveCandidate(query, { competition_id: competition, ...body, candidate_code: 'rollback' }, 'resolver-admin');
        await query('SELECT * FROM missing_tkt06a_result_table');
      }), { code: '42P01' });
      assert.deepEqual(await counts(), before);
      const faulty = createCandidateService({ transaction: (work) => db.transaction((query) => work((sql, values) =>
        /INSERT INTO audit_logs/.test(sql) ? query('SELECT * FROM missing_tkt06a_audit_table') : query(sql, values))) });
      await assert.rejects(faulty.create(params, { ...body, candidate_code: 'audit-failure' }, 'actor'), { code: '42P01' });
      await assert.rejects(faulty.update({ ...params, candidateId: candidate.id }, { name: 'Must roll back' }, 'actor'), { code: '42P01' });
      assert.equal((await service.get({ ...params, candidateId: candidate.id })).name, candidate.name);
      assert.deepEqual(await counts(), before);
    });
    await t.test('existing result references survive corrections and reject identity changes', async () => {
      const event = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Fixture') RETURNING id", [competition, category]);
      const result = await insert('INSERT INTO event_results(competition_id,event_id,category_id) VALUES ($1,$2,$3) RETURNING id', [competition, event, category]);
      await pool.query('INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position) VALUES ($1,$2,$3,$4,$5,1)', [competition, result, event, category, candidate.id]);
      await assert.rejects(service.update({ ...params, candidateId: candidate.id }, { name: 'Wrong', unit_id: secondUnit }, 'actor'), { status: 400 });
      await service.update({ ...params, candidateId: candidate.id }, { name: 'Audited correction' }, 'actor');
      const details = await service.get({ ...params, candidateId: candidate.id });
      assert.equal(details.unit_id, unit); assert.equal(details.category_id, category);
      assert.equal(Object.hasOwn(details, 'status'), false);
      assert.equal((await pool.query('SELECT candidate_id FROM result_entries WHERE event_id=$1', [event])).rows[0].candidate_id, candidate.id);
    });
  });
});
