import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createParticipantService } from '../src/services/participants.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveParticipants } from '../test-support/participants-http.js';

test('TKT-05B real PostgreSQL unit and Madrassa APIs', { timeout: 240000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const service = createParticipantService(db);
    const insertId = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competition = await insertId("INSERT INTO competitions(code,name) VALUES ('one','One') RETURNING id");
    const otherCompetition = await insertId("INSERT INTO competitions(code,name) VALUES ('two','Two') RETURNING id");
    const root = `/${competition}/units`;
    const otherRoot = `/${otherCompetition}/units`;
    const countAudits = async () => Number((await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count);
    let unit;
    let otherUnit;
    let secondUnit;
    let madrasa;
    await serveParticipants(service, async (request) => {
      await t.test('unit CRUD allows zero Madrassas and preserves exact names and string bigint IDs', async () => {
        assert.deepEqual((await request(root)).body, { units: [] });
        const created = await request(root, 'POST', { name: 'Unit One' });
        assert.equal(created.status, 201);
        unit = created.body.unit;
        assert.equal(typeof unit.id, 'string');
        assert.equal(unit.competition_id, competition);
        assert.equal(unit.name, 'Unit One');
        assert.ok(unit.created_at);
        assert.ok(unit.updated_at);
        assert.deepEqual((await request(`${root}/${unit.id}`)).body.unit, unit);
        assert.deepEqual((await request(`${root}/${unit.id}/madrasas`)).body, { madrasas: [] });
        assert.deepEqual((await request(root)).body.units, [unit]);
        const literal = "  Unit 'name'; SELECT password --  ";
        const edited = await request(`${root}/${unit.id}`, 'PATCH', { name: literal });
        assert.equal(edited.status, 200);
        assert.equal(edited.body.unit.name, literal);
        assert.equal(edited.body.unit.competition_id, competition);
        assert.equal(edited.body.unit.created_at, unit.created_at);
        assert.notEqual(edited.body.unit.updated_at, unit.updated_at);
        unit = edited.body.unit;
        otherUnit = (await request(otherRoot, 'POST', { name: literal })).body.unit;
        secondUnit = (await request(root, 'POST', { name: 'Unit Two' })).body.unit;
        const disposable = (await request(root, 'POST', { name: 'Empty unit' })).body.unit;
        const removed = await request(`${root}/${disposable.id}`, 'DELETE');
        assert.equal(removed.status, 204);
        assert.equal(removed.body, null);
        assert.equal((await request(`${root}/${disposable.id}`)).status, 404);
        assert.equal((await request(`${root}/${disposable.id}`, 'DELETE')).status, 404);
        assert.deepEqual((await request(root)).body.units.map((row) => row.id), [secondUnit.id, unit.id]);
      });

      await t.test('Madrassa CRUD validates nested parents and leaves its unit intact', async () => {
        const path = `${root}/${unit.id}/madrasas`;
        const created = await request(path, 'POST', { name: 'Madrassa One' });
        assert.equal(created.status, 201);
        madrasa = created.body.madrasa;
        assert.equal(typeof madrasa.id, 'string');
        assert.equal(madrasa.unit_id, unit.id);
        assert.equal(madrasa.competition_id, competition);
        assert.deepEqual((await request(`${path}/${madrasa.id}`)).body.madrasa, madrasa);
        assert.deepEqual((await request(path)).body.madrasas, [madrasa]);
        const name = " Exact 'Madrassa'; SELECT secret -- ";
        const edited = await request(`${path}/${madrasa.id}`, 'PATCH', { name });
        assert.equal(edited.status, 200);
        assert.equal(edited.body.madrasa.name, name);
        assert.equal(edited.body.madrasa.unit_id, unit.id);
        assert.equal(edited.body.madrasa.created_at, madrasa.created_at);
        assert.notEqual(edited.body.madrasa.updated_at, madrasa.updated_at);
        madrasa = edited.body.madrasa;
        const disposable = (await request(path, 'POST', { name: 'Disposable' })).body.madrasa;
        assert.equal((await request(`${path}/${disposable.id}`, 'DELETE')).status, 204);
        assert.equal((await request(`${path}/${disposable.id}`)).status, 404);
        assert.equal((await request(`${path}/${disposable.id}`, 'DELETE')).status, 404);
        assert.deepEqual((await request(`${root}/${unit.id}`)).body.unit, unit);
        assert.deepEqual((await request(path)).body.madrasas, [madrasa]);
        const blocked = await request(`${root}/${unit.id}`, 'DELETE');
        assert.equal(blocked.status, 409, 'A Madrassa alone must block unit deletion, even without candidates');
        assert.deepEqual(blocked.body, { error: 'Unit is referenced by dependent records' });
      });

      await t.test('duplicate names are scoped to parents; failed and concurrent duplicates create no extra audits', async () => {
        const initial = await countAudits();
        for (const [path, method, name] of [
          [root, 'POST', unit.name], [`${root}/${secondUnit.id}`, 'PATCH', unit.name],
          [`${root}/${unit.id}/madrasas`, 'POST', madrasa.name],
        ]) {
          const duplicate = await request(path, method, { name });
          assert.equal(duplicate.status, 409);
          assert.match(duplicate.body.error, /name already exists/);
        }
        assert.equal(await countAudits(), initial);
        const extra = (await request(`${root}/${unit.id}/madrasas`, 'POST', { name: 'Other Madrassa' })).body.madrasa;
        assert.equal((await request(`${root}/${unit.id}/madrasas/${extra.id}`, 'PATCH', { name: madrasa.name })).status, 409);
        assert.equal((await request(`${root}/${unit.id}/madrasas/${extra.id}`)).body.madrasa.name, extra.name);
        assert.equal((await request(`${root}/${secondUnit.id}/madrasas`, 'POST', { name: madrasa.name })).status, 201);
        assert.equal((await request(`${otherRoot}/${otherUnit.id}/madrasas`, 'POST', { name: madrasa.name })).status, 201);
        for (const path of [root, `${root}/${secondUnit.id}/madrasas`]) {
          const before = await countAudits();
          const results = await Promise.all([
            request(path, 'POST', { name: 'Concurrent duplicate' }),
            request(path, 'POST', { name: 'Concurrent duplicate' }),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          assert.equal(await countAudits(), before + 1);
        }
        assert.deepEqual((await request(`${otherRoot}/${otherUnit.id}`)).body.unit, otherUnit);
      });

      await t.test('cross-competition and wrong-unit requests cannot read, edit, delete or attach records', async () => {
        const before = await countAudits();
        for (const [path, method, body] of [
          [`${otherRoot}/${unit.id}`, 'GET'], [`${otherRoot}/${unit.id}`, 'PATCH', { name: 'Wrong' }],
          [`${otherRoot}/${unit.id}`, 'DELETE'],
          [`${otherRoot}/${unit.id}/madrasas`, 'GET'],
          [`${otherRoot}/${unit.id}/madrasas`, 'POST', { name: 'Wrong' }],
          [`${otherRoot}/${unit.id}/madrasas/${madrasa.id}`, 'GET'],
          [`${otherRoot}/${unit.id}/madrasas/${madrasa.id}`, 'PATCH', { name: 'Wrong' }],
          [`${otherRoot}/${unit.id}/madrasas/${madrasa.id}`, 'DELETE'],
          [`${otherRoot}/${otherUnit.id}/madrasas/${madrasa.id}`, 'GET'],
          [`${root}/${secondUnit.id}/madrasas/${madrasa.id}`, 'GET'],
          [`${root}/${secondUnit.id}/madrasas/${madrasa.id}`, 'PATCH', { name: 'Wrong' }],
          [`${root}/${secondUnit.id}/madrasas/${madrasa.id}`, 'DELETE'],
        ]) {
          const result = await request(path, method, body);
          assert.equal(result.status, 404, `${method} ${path}`);
        }
        assert.equal((await request(`${root}/${unit.id}`, 'PATCH', { name: 'Wrong', competition_id: otherCompetition })).status, 400);
        assert.equal((await request(`${root}/${unit.id}/madrasas/${madrasa.id}`, 'PATCH', { name: 'Wrong', unit_id: secondUnit.id })).status, 400);
        assert.deepEqual((await request(`${root}/${unit.id}`)).body.unit, unit);
        assert.deepEqual((await request(`${root}/${unit.id}/madrasas/${madrasa.id}`)).body.madrasa, madrasa);
        assert.equal(await countAudits(), before);
      });

      await t.test('missing parents and entities return distinct safe 404s', async () => {
        const missing = '9223372036854775807';
        for (const [suffix, method, body] of [
          ['', 'GET'], ['', 'POST', { name: 'Valid' }], [`/${unit.id}`, 'GET'],
          [`/${unit.id}`, 'PATCH', { name: 'Valid' }], [`/${unit.id}`, 'DELETE'],
          [`/${unit.id}/madrasas`, 'GET'], [`/${unit.id}/madrasas`, 'POST', { name: 'Valid' }],
          [`/${unit.id}/madrasas/${madrasa.id}`, 'GET'],
          [`/${unit.id}/madrasas/${madrasa.id}`, 'PATCH', { name: 'Valid' }],
          [`/${unit.id}/madrasas/${madrasa.id}`, 'DELETE'],
        ]) {
          const result = await request(`/${missing}/units${suffix}`, method, body);
          assert.equal(result.status, 404);
          assert.deepEqual(result.body, { error: 'Competition not found' });
        }
        for (const [suffix, method, body] of [
          ['', 'GET'], ['', 'PATCH', { name: 'Valid' }], ['', 'DELETE'],
          ['/madrasas', 'GET'], ['/madrasas', 'POST', { name: 'Valid' }],
          [`/madrasas/${madrasa.id}`, 'GET'], [`/madrasas/${madrasa.id}`, 'PATCH', { name: 'Valid' }],
          [`/madrasas/${madrasa.id}`, 'DELETE'],
        ]) {
          const result = await request(`${root}/${missing}${suffix}`, method, body);
          assert.equal(result.status, 404);
          assert.deepEqual(result.body, { error: 'Unit not found' });
        }
        for (const [method, body] of [['GET'], ['PATCH', { name: 'Valid' }], ['DELETE']]) {
          const result = await request(`${root}/${unit.id}/madrasas/${missing}`, method, body);
          assert.equal(result.status, 404);
          assert.deepEqual(result.body, { error: 'Madrassa not found' });
        }
      });

      await t.test('referenced deletion preserves Madrassas, candidates and published result entries', async () => {
        const candidateUnit = (await request(root, 'POST', { name: 'Candidates without Madrassas' })).body.unit;
        const category = await insertId("INSERT INTO categories(competition_id,name) VALUES ($1,'Fixture category') RETURNING id", [competition]);
        const candidate = await insertId(`INSERT INTO candidates(competition_id,unit_id,madrasa_id,category_id,candidate_code,name)
          VALUES ($1,$2,$3,$4,'001','Fixture candidate') RETURNING id`, [competition, unit.id, madrasa.id, category]);
        const candidate2 = await insertId(`INSERT INTO candidates(competition_id,unit_id,category_id,candidate_code,name)
          VALUES ($1,$2,$3,'002','Fixture candidate without Madrassa') RETURNING id`, [competition, candidateUnit.id, category]);
        const event = await insertId("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Fixture event') RETURNING id", [competition, category]);
        const result = await insertId(`INSERT INTO event_results(competition_id,event_id,category_id,status,reviewed_at,reviewed_by,published_at,published_by)
          VALUES ($1,$2,$3,'published',now(),'fixture-admin',now(),'fixture-admin') RETURNING id`, [competition, event, category]);
        await pool.query(`INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position)
          VALUES ($1,$2,$3,$4,$5,1),($1,$2,$3,$4,$6,2)`, [competition, result, event, category, candidate, candidate2]);
        const before = await countAudits();
        for (const path of [`${root}/${unit.id}`, `${root}/${candidateUnit.id}`, `${root}/${unit.id}/madrasas/${madrasa.id}`]) {
          const deletion = await request(path, 'DELETE');
          assert.equal(deletion.status, 409);
          assert.match(deletion.body.error, /referenced by dependent records/);
          assert.equal((await request(path)).status, 200);
        }
        assert.equal((await pool.query('SELECT count(*) FROM candidates')).rows[0].count, '2');
        assert.equal((await pool.query('SELECT count(*) FROM result_entries')).rows[0].count, '2');
        assert.equal((await pool.query('SELECT status FROM event_results WHERE id=$1', [result])).rows[0].status, 'published');
        assert.equal(await countAudits(), before);
      });

      await t.test('successful create, update and delete audit attribution uses the verified Firebase UID', async () => {
        const rows = (await pool.query('SELECT competition_id,actor_ref,action,details FROM audit_logs ORDER BY id')).rows;
        assert.ok(rows.length > 0);
        for (const row of rows) {
          assert.equal(row.actor_ref, 'trusted-participant-admin');
          assert.ok([competition, otherCompetition].includes(row.competition_id));
          assert.ok(row.details.unit_id || row.details.madrasa_id);
          const entity = row.details.after ?? row.details.before;
          assert.equal(entity.competition_id, row.competition_id);
          if (row.action.startsWith('madrasa_')) assert.equal(entity.unit_id, row.details.unit_id);
        }
        assert.deepEqual([...new Set(rows.map((r) => r.action))].sort(), [
          'madrasa_created', 'madrasa_deleted', 'madrasa_updated', 'unit_created', 'unit_deleted', 'unit_updated',
        ]);
        const updated = rows.find((r) => r.action === 'unit_updated');
        assert.equal(updated.details.before.name, 'Unit One');
        assert.equal(updated.details.after.name, unit.name);
        const deleted = rows.find((r) => r.action === 'madrasa_deleted');
        assert.equal(deleted.details.after, null);
        assert.equal(deleted.details.before.name, 'Disposable');
        const before = await countAudits();
        for (const path of [root, `${root}/${unit.id}/madrasas`]) {
          assert.equal((await request(path, 'POST', { name: 'Spoof', actor_ref: 'spoof-admin' })).status, 400);
        }
        assert.equal(await countAudits(), before);
      });
    });

    await t.test('audit SQL failures roll back all unit and Madrassa mutations, including deletion', async (t) => {
      t.mock.method(console, 'error', () => {});
      const disposable = await service.units.create({ competitionId: competition }, { name: 'Rollback unit' }, 'fixture-admin');
      const params = { competitionId: competition, unitId: disposable.id };
      const child = await service.madrasas.create(params, { name: 'Rollback Madrassa' }, 'fixture-admin');
      const before = await countAudits();
      const faulty = createParticipantService({ transaction: (work) => db.transaction((query) => work((sql, values) =>
        /INSERT INTO audit_logs/.test(sql) ? query('SELECT * FROM missing_tkt05b_audit_table') : query(sql, values))) });
      await serveParticipants(faulty, async (request) => {
        for (const [path, method, body] of [
          [root, 'POST', { name: 'Must roll back' }],
          [`${root}/${disposable.id}`, 'PATCH', { name: 'Must roll back' }],
          [`${root}/${disposable.id}/madrasas`, 'POST', { name: 'Must roll back' }],
          [`${root}/${disposable.id}/madrasas/${child.id}`, 'PATCH', { name: 'Must roll back' }],
          [`${root}/${disposable.id}/madrasas/${child.id}`, 'DELETE'],
        ]) {
          const result = await request(path, method, body);
          assert.equal(result.status, 500);
          assert.deepEqual(result.body, { error: 'Internal server error' });
        }
        assert.deepEqual(await service.units.get(params), disposable);
        assert.deepEqual(await service.madrasas.get({ ...params, madrasaId: child.id }), child);
        assert.equal(await countAudits(), before);
        assert.equal((await pool.query("SELECT count(*) FROM units WHERE name='Must roll back'")).rows[0].count, '0');
        assert.equal((await pool.query("SELECT count(*) FROM madrasas WHERE name='Must roll back'")).rows[0].count, '0');
        await service.madrasas.remove({ ...params, madrasaId: child.id }, 'fixture-admin');
        const beforeUnitDelete = await countAudits();
        assert.equal((await request(`${root}/${disposable.id}`, 'DELETE')).status, 500);
        assert.deepEqual(await service.units.get(params), disposable);
        assert.equal(await countAudits(), beforeUnitDelete);
      });
    });
  });
});
