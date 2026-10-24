import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { databaseConfig } from '../src/db/config.js';
import { createDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createCompetitionService } from '../src/services/competitions.js';
import { serveCompetitions } from './helpers/competitions-http.js';

test('TKT-05A real PostgreSQL competition APIs', { timeout: 180000 }, async (t) => {
  const schema = `tkt05a_${randomBytes(10).toString('hex')}`;
  const env = { ...process.env };
  if (env.TEST_DATABASE_URL) env.DATABASE_URL = env.TEST_DATABASE_URL;
  const connections = new pg.Pool({ ...databaseConfig(env), max: 4 });
  const pool = {
    async connect() {
      const client = await connections.connect();
      try {
        await client.query(`SET search_path TO ${schema}`);
        return {
          async query(sql, values) {
            if (sql !== 'ROLLBACK') {
              const { rows: [scope] } = await client.query('SELECT current_schema() AS name');
              assert.equal(scope.name, schema, 'Refusing SQL outside isolated test schema');
            }
            return client.query(sql, values);
          },
          release(error) { client.release(error); },
        };
      } catch (error) { client.release(error); throw error; }
    },
    async query(sql, values) {
      const client = await this.connect();
      try { return await client.query(sql, values); }
      finally { client.release(); }
    },
  };
  try {
    try { await connections.query('SELECT 1'); }
    catch (error) {
      if (env.TEST_DATABASE_URL || env.TKT05A_REQUIRE_POSTGRES === '1') throw error;
      t.skip(`PostgreSQL unavailable (${error.code || 'connection error'}); SQL behavior unverified`);
      return;
    }
    await connections.query(`CREATE SCHEMA ${schema}`);
    try {
      await migrate(pool);
      const db = createDatabase(pool);
      const service = createCompetitionService(db);
      await serveCompetitions(service, async (request) => {
        let first;
        let second;
        await t.test('create atomically initializes draft and empty shared settings; list and details round trip', async () => {
          const result = await request('', 'POST', { code: '001', name: 'Competition One' });
          assert.equal(result.status, 201);
          first = result.body.competition;
          assert.equal(typeof first.id, 'string');
          assert.equal(first.code, '001');
          assert.equal(first.status, 'draft');
          assert.ok(first.created_at);
          assert.ok(first.updated_at);
          assert.deepEqual((await request(`/${first.id}`)).body.competition, first);
          const settings = (await request(`/${first.id}/settings`)).body.settings;
          assert.equal(settings.competition_id, first.id);
          assert.deepEqual(settings.position_points, {});
          second = (await request('', 'POST', { code: '002', name: 'Competition Two' })).body.competition;
          assert.deepEqual((await request()).body.competitions.map((c) => c.id), [second.id, first.id]);
          const { rows: [audit] } = await pool.query('SELECT actor_ref, action FROM audit_logs WHERE competition_id=$1', [first.id]);
          assert.deepEqual(audit, { actor_ref: 'verified-admin', action: 'competition_created' });
        });

        await t.test('duplicate code creation and update return 409 with no partial changes', async () => {
          const duplicate = await request('', 'POST', { code: '001', name: 'Duplicate' });
          assert.equal(duplicate.status, 409);
          assert.deepEqual(duplicate.body, { error: 'Competition code already exists' });
          assert.equal((await request(`/${second.id}`, 'PATCH', { code: '001', name: 'Must roll back' })).status, 409);
          assert.deepEqual((await request(`/${second.id}`)).body.competition, second);
          assert.equal((await pool.query('SELECT count(*) FROM competitions')).rows[0].count, '2');
          assert.equal((await pool.query('SELECT count(*) FROM competition_settings')).rows[0].count, '2');
          assert.equal((await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count, '2');
        });

        await t.test('partial edits preserve exact text and concurrent updates do not lose fields', async () => {
          const name = "Literal 'name'; SELECT password --";
          const edited = await request(`/${first.id}`, 'PATCH', { name });
          assert.equal(edited.status, 200);
          assert.equal(edited.body.competition.name, name);
          assert.equal(edited.body.competition.code, '001');
          assert.notEqual(edited.body.competition.updated_at, first.updated_at);
          const results = await Promise.all([
            request(`/${first.id}`, 'PATCH', { code: ' exact code ' }),
            request(`/${first.id}`, 'PATCH', { name: 'Concurrent name' }),
          ]);
          assert.deepEqual(results.map((r) => r.status), [200, 200]);
          const current = (await request(`/${first.id}`)).body.competition;
          assert.equal(current.code, ' exact code ');
          assert.equal(current.name, 'Concurrent name');
          assert.deepEqual((await request(`/${second.id}`)).body.competition, second);
        });

        await t.test('global settings replace the whole map, validate before saving, and stay competition scoped', async () => {
          const path = `/${first.id}/settings`;
          const points = { 1: 10, 2: 0, 3: 3 };
          const saved = await request(path, 'PUT', { position_points: points });
          assert.equal(saved.status, 200);
          assert.deepEqual(saved.body.settings.position_points, points);
          assert.deepEqual((await request(path)).body.settings, saved.body.settings);
          assert.deepEqual((await request(`/${second.id}/settings`)).body.settings.position_points, {});
          const auditCount = (await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count;
          for (const invalid of [{ 1: -1 }, { 1: 2.5 }, { '01': 2 }, { 0: 2 }, { 1: '5' }]) {
            assert.equal((await request(path, 'PUT', { position_points: invalid })).status, 400);
          }
          assert.deepEqual((await request(path)).body.settings, saved.body.settings);
          assert.equal((await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count, auditCount);
          const replaced = await request(path, 'PUT', { position_points: { 1: 7 } });
          assert.deepEqual(replaced.body.settings.position_points, { 1: 7 });
          assert.deepEqual((await request(path, 'PUT', { position_points: {} })).body.settings.position_points, {});
          // Legacy competitions can lack settings: a read must not write, and PUT repairs that absence.
          await pool.query('DELETE FROM competition_settings WHERE competition_id=$1', [second.id]);
          assert.deepEqual((await request(`/${second.id}/settings`)).body, { settings: null });
          assert.equal((await pool.query('SELECT count(*) FROM competition_settings WHERE competition_id=$1', [second.id])).rows[0].count, '0');
          assert.equal((await request(`/${second.id}/settings`, 'PUT', { position_points: { 1: 1 } })).status, 200);
        });

        await t.test('all lifecycle pairs enforce forward progression and reversible archive, with idempotent retries', async () => {
          const allowed = { draft: ['draft', 'active', 'archived'], active: ['active', 'archived'], archived: ['archived', 'active'] };
          for (const from of Object.keys(allowed)) {
            for (const to of Object.keys(allowed)) {
              await pool.query('UPDATE competitions SET status=$2 WHERE id=$1', [first.id, from]);
              const count = (await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count;
              const result = await request(`/${first.id}/status`, 'PATCH', { status: to });
              assert.equal(result.status, allowed[from].includes(to) ? 200 : 409, `${from} -> ${to}`);
              assert.equal((await request(`/${first.id}`)).body.competition.status, allowed[from].includes(to) ? to : from);
              const expected = Number(count) + (from !== to && allowed[from].includes(to) ? 1 : 0);
              assert.equal(Number((await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count), expected);
            }
          }
          assert.equal((await request(`/${second.id}/status`, 'PATCH', { status: 'active' })).status, 200);
          assert.equal((await request(`/${first.id}/status`, 'PATCH', { status: 'active' })).status, 200);
          assert.equal((await pool.query("SELECT count(*) FROM competitions WHERE status='active'")).rows[0].count, '2');
        });

        await t.test('missing competitions consistently return 404 and invalid inputs return 400', async () => {
          for (const [path, method, body] of [
            ['/9223372036854775807', 'GET'], ['/9223372036854775807', 'PATCH', { name: 'Missing' }],
            ['/9223372036854775807/status', 'PATCH', { status: 'active' }],
            ['/9223372036854775807/settings', 'GET'],
            ['/9223372036854775807/settings', 'PUT', { position_points: { 1: 0 } }],
          ]) {
            const result = await request(path, method, body);
            assert.equal(result.status, 404);
            assert.deepEqual(result.body, { error: 'Competition not found' });
          }
          assert.equal((await request(`/${first.id}`, 'PATCH', { status: 'archived' })).status, 400);
          assert.equal((await request(`/${first.id}/settings`, 'PUT', { position_points: {}, competition_id: second.id })).status, 400);
          assert.equal((await request(`/${first.id}`, 'DELETE')).status, 404);
        });
      });

      await t.test('real SQL failures roll back competition, settings and audit changes together', async (t) => {
        t.mock.method(console, 'error', () => {});
        const faulty = createCompetitionService({
          ...db,
          transaction: (work) => db.transaction((query) => work((sql, values) =>
            /INSERT INTO audit_logs/.test(sql) ? query('SELECT * FROM missing_tkt05a_audit_table') : query(sql, values))),
        });
        const existing = (await service.list())[0];
        const beforeSettings = await service.getSettings(existing.id);
        const beforeAudit = (await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count;
        await serveCompetitions(faulty, async (request) => {
          for (const [path, method, body] of [
            ['', 'POST', { code: 'rollback', name: 'Never saved' }],
            [`/${existing.id}`, 'PATCH', { name: 'Never saved' }],
            [`/${existing.id}/status`, 'PATCH', { status: 'archived' }],
            [`/${existing.id}/settings`, 'PUT', { position_points: { 1: 500 } }],
          ]) {
            const result = await request(path, method, body);
            assert.equal(result.status, 500);
            assert.deepEqual(result.body, { error: 'Internal server error' });
          }
        });
        assert.deepEqual(await service.get(existing.id), existing);
        assert.deepEqual(await service.getSettings(existing.id), beforeSettings);
        assert.equal((await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count, beforeAudit);
        assert.equal((await pool.query("SELECT count(*) FROM competitions WHERE code='rollback'")).rows[0].count, '0');
        assert.equal((await pool.query('SELECT count(*) FROM competition_settings')).rows[0].count, '2');
      });
    } finally {
      assert.match(schema, /^tkt05a_[a-f0-9]{20}$/);
      await connections.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  } finally { await connections.end(); }
});
