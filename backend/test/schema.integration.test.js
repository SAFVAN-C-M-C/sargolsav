import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { databaseConfig } from '../src/db/config.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seed.js';

async function rollbackAndRelease(query, client) {
  try { await query('ROLLBACK'); }
  catch (error) { client.release(error); throw error; }
  client.release();
}

test('TKT-03 real PostgreSQL integration', { timeout: 180000 }, async (t) => {
  const schema = `tkt03_${randomBytes(10).toString('hex')}`;
  const env = { ...process.env };
  if (env.TEST_DATABASE_URL) env.DATABASE_URL = env.TEST_DATABASE_URL;
  const connections = new pg.Pool({ ...databaseConfig(env), max: 2 });
  // Some hosted connections ignore startup options. Set and verify scope explicitly
  // on every checkout and refuse to execute test SQL if the session loses it.
  const pool = {
    async connect() {
      const client = await connections.connect();
      try {
        await client.query(`SET search_path TO ${schema}`);
        return {
          async query(sql, values) {
            // Recovery must run even in an aborted transaction, where SELECT fails.
            if (!/^ROLLBACK(?: TO SAVEPOINT expected_failure)?$/.test(sql)) {
              const { rows: [scope] } = await client.query('SELECT current_schema() AS name');
              assert.equal(scope.name, schema, 'Test connection lost its isolated schema; use a direct/session connection');
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
      if (env.TEST_DATABASE_URL || env.TKT03_REQUIRE_POSTGRES === '1') throw error;
      t.skip(`PostgreSQL unavailable (${error.code || 'connection error'}); SQL behavior unverified`);
      return;
    }
    await connections.query(`CREATE SCHEMA ${schema}`);
    try {
      await t.test('real runners serialize, apply all migrations once, and rerun cleanly', async () => {
        const results = await Promise.all([migrate(pool), migrate(pool)]);
        assert.deepEqual(results.map((r) => r.length).sort(), [0, 7]);
        assert.deepEqual(await migrate(pool), []);
        assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '7');
      });

      async function scenario(name, work) {
        await t.test(name, async () => {
          const client = await pool.connect();
          const query = (sql, values) => client.query(sql, values);
          await query('BEGIN');
          try {
            await seedDevelopment(query);
            const { rows: [f] } = await query(`SELECT c.id AS competition, u.id AS unit, cat.id AS category,
              m.id AS madrasa, e.id AS event, r.id AS result,
              (SELECT id FROM candidates WHERE candidate_code = '001') AS candidate,
              (SELECT id FROM candidates WHERE candidate_code = '002') AS candidate2
              FROM competitions c JOIN units u ON u.competition_id = c.id
              JOIN categories cat ON cat.competition_id = c.id
              JOIN madrasas m ON m.unit_id = u.id JOIN events e ON e.category_id = cat.id
              JOIN event_results r ON r.event_id = e.id WHERE c.code = 'local-demo'`);
            async function rejects(sql, values, code) {
              await query('SAVEPOINT expected_failure');
              await assert.rejects(query(sql, values), (error) => error.code === code);
              await query('ROLLBACK TO SAVEPOINT expected_failure');
            }
            const entry = (candidate = f.candidate, position = 1, audit = null) => query(`INSERT INTO result_entries
              (competition_id,event_result_id,event_id,category_id,candidate_id,position,override_audit_id)
              VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [f.competition, f.result, f.event, f.category, candidate, position, audit]);
            await work({ query, rejects, f, entry });
          } finally { await rollbackAndRelease(query, client); }
        });
      }

      await scenario('seed repeats safely and preserves leading-zero external codes', async ({ query, rejects, f }) => {
        await query("UPDATE candidates SET name='Edited fixture',updated_at='2000-01-01' WHERE id=$1", [f.candidate]);
        await seedDevelopment(query);
        const { rows: [edited] } = await query('SELECT name,updated_at > created_at AS touched FROM candidates WHERE id=$1', [f.candidate]);
        assert.equal(edited.name, 'Edited fixture');
        assert.equal(edited.touched, true);
        assert.equal((await query('SELECT count(*) FROM competitions')).rows[0].count, '1');
        assert.deepEqual((await query('SELECT candidate_code FROM candidates ORDER BY candidate_code')).rows.map((r) => r.candidate_code), ['001', '002']);
        await rejects(`INSERT INTO candidates(competition_id,unit_id,category_id,candidate_code,name)
          VALUES ($1,$2,$3,'001','Duplicate')`, [f.competition, f.unit, f.category], '23505');
        await rejects(`INSERT INTO candidates(competition_id,unit_id,category_id,name)
          VALUES ($1,$2,$3,'Missing code')`, [f.competition, f.unit, f.category], '23502');
        await rejects('INSERT INTO units(competition_id,name) VALUES ($1,\'Demo unit\')', [f.competition], '23505');
        await rejects('INSERT INTO units(competition_id,name) VALUES (-1,\'Missing competition\')', [], '23503');
      });

      await scenario('competition, category and madrasa/unit boundaries are enforced', async ({ query, rejects, f }) => {
        const { rows: [other] } = await query("INSERT INTO competitions(code,name) VALUES ('other','Other') RETURNING id");
        await query("INSERT INTO units(competition_id,name) VALUES ($1,'Demo unit')", [other.id]);
        await query("INSERT INTO categories(competition_id,name) VALUES ($1,'Demo category')", [other.id]);
        const { rows: [category] } = await query("INSERT INTO categories(competition_id,name) VALUES ($1,'Other category') RETURNING id", [f.competition]);
        const { rows: [unit] } = await query("INSERT INTO units(competition_id,name) VALUES ($1,'Second unit') RETURNING id", [f.competition]);
        await rejects('UPDATE candidates SET competition_id=$1 WHERE id=$2', [other.id, f.candidate], '23503');
        await rejects('UPDATE candidates SET unit_id=$1 WHERE id=$2', [unit.id, f.candidate], '23503');
        await rejects('UPDATE events SET competition_id=$1 WHERE id=$2', [other.id, f.event], '23503');
        await rejects('UPDATE event_results SET category_id=$1 WHERE id=$2', [category.id, f.result], '23503');
        await query('UPDATE candidates SET category_id=$1 WHERE id=$2', [category.id, f.candidate2]);
        await rejects(`INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position)
          VALUES ($1,$2,$3,$4,$5,1)`, [f.competition, f.result, f.event, f.category, f.candidate2], '23503');
        await query(`INSERT INTO candidates(competition_id,unit_id,category_id,candidate_code,name)
          SELECT $1,id,(SELECT id FROM categories WHERE competition_id=$1 LIMIT 1),'001','Other candidate'
          FROM units WHERE competition_id=$1`, [other.id]);
      });

      await scenario('duplicate candidates, ordinary ties and invalid positions fail; audited ties succeed', async ({ query, rejects, f, entry }) => {
        await entry();
        const sql = `INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position)
          VALUES ($1,$2,$3,$4,$5,$6)`;
        await rejects(sql, [f.competition, f.result, f.event, f.category, f.candidate, 2], '23505');
        await rejects(sql, [f.competition, f.result, f.event, f.category, f.candidate2, 1], '23505');
        await rejects(sql, [f.competition, f.result, f.event, f.category, f.candidate2, 0], '23514');
        await rejects(sql, [f.competition, f.result, f.event, f.category, f.candidate2, -1], '23514');
        const { rows: [audit] } = await query(`INSERT INTO audit_logs(competition_id,event_id,actor_ref,action,reason)
          VALUES ($1,$2,'test-admin','shared_position_override','Approved tie for fixture') RETURNING id`, [f.competition, f.event]);
        await entry(f.candidate2, 1, audit.id);
        assert.equal((await query('SELECT count(*) FROM result_entries')).rows[0].count, '2');
        await rejects('UPDATE audit_logs SET action=\'other\' WHERE id=$1', [audit.id], '23503');
        await rejects('DELETE FROM audit_logs WHERE id=$1', [audit.id], '23503');
        await rejects('UPDATE result_entries SET override_audit_id=-1 WHERE candidate_id=$1', [f.candidate2], '23503');
        const { rows: [unrelatedAudit] } = await query(`INSERT INTO audit_logs(competition_id,event_id,actor_ref,action,reason)
          VALUES ($1,$2,'test-admin','review','Not a tie approval') RETURNING id`, [f.competition, f.event]);
        await rejects('UPDATE result_entries SET override_audit_id=$1 WHERE candidate_id=$2', [unrelatedAudit.id, f.candidate2], '23503');
        const { rows: [event] } = await query("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Second event') RETURNING id", [f.competition, f.category]);
        const { rows: [wrongEventAudit] } = await query(`INSERT INTO audit_logs(competition_id,event_id,actor_ref,action,reason)
          VALUES ($1,$2,'test-admin','shared_position_override','Different event approval') RETURNING id`, [f.competition, event.id]);
        await rejects('UPDATE result_entries SET override_audit_id=$1 WHERE candidate_id=$2', [wrongEventAudit.id, f.candidate2], '23503');
        await rejects('DELETE FROM candidates WHERE id=$1', [f.candidate], '23503');
      });

      await scenario('one candidate may win multiple events in their category', async ({ query, rejects, f, entry }) => {
        await entry();
        const { rows: [event] } = await query("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Another event') RETURNING id", [f.competition, f.category]);
        const { rows: [result] } = await query('INSERT INTO event_results(competition_id,event_id,category_id) VALUES ($1,$2,$3) RETURNING id', [f.competition, event.id, f.category]);
        await query(`INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position)
          VALUES ($1,$2,$3,$4,$5,1)`, [f.competition, result.id, event.id, f.category, f.candidate]);
        assert.equal((await query('SELECT count(*) FROM result_entries WHERE candidate_id=$1', [f.candidate])).rows[0].count, '2');
        await rejects('INSERT INTO event_results(competition_id,event_id,category_id) VALUES ($1,$2,$3)', [f.competition, event.id, f.category], '23505');
      });

      await scenario('points JSON validation and publication metadata', async ({ query, rejects, f, entry }) => {
        for (const invalid of ['[]', 'null', '5', '{"0":5}', '{"01":5}', '{"1":"5"}', '{"1":null}', '{"2147483648":1}']) {
          await rejects('UPDATE competition_settings SET position_points=$1::jsonb', [invalid], '23514');
        }
        await query('UPDATE competition_settings SET position_points=$1::jsonb', ['{"1":7,"2":2.5}']);
        await rejects('UPDATE event_results SET status=\'published\'', [], '23514');
        await query("UPDATE event_results SET status='reviewed', reviewed_at=now(), reviewed_by='test-admin'");
        await query("UPDATE event_results SET status='published', published_at=now(), published_by='test-admin'");
        await entry();
        await entry(f.candidate2, 2);
        const { rows } = await query(`SELECT sum((s.position_points ->> re.position::text)::numeric) AS points
          FROM result_entries re JOIN event_results er ON er.id=re.event_result_id
          JOIN competition_settings s ON s.competition_id=er.competition_id WHERE er.status='published'`);
        assert.equal(Number(rows[0].points), 9.5);
        assert.equal((await query('SELECT status FROM event_results WHERE id=$1', [f.result])).rows[0].status, 'published');
        await query("UPDATE event_results SET status='draft',reviewed_at=NULL,reviewed_by=NULL,published_at=NULL,published_by=NULL");
        assert.equal((await query("SELECT count(*) FROM event_results WHERE status='published'")).rows[0].count, '0');
      });

      await scenario('competition deletion cascades only its owned data, including overrides', async ({ query, f, entry }) => {
        await query(`WITH retained AS (INSERT INTO competitions(code,name) VALUES ('retained','Retained') RETURNING id)
          INSERT INTO units(competition_id,name) SELECT id,'Retained unit' FROM retained`);
        await query('CREATE TABLE admin_account_fixture(id text PRIMARY KEY)');
        await query("INSERT INTO admin_account_fixture VALUES ('test-admin')");
        const { rows: [audit] } = await query(`INSERT INTO audit_logs(competition_id,event_id,actor_ref,action,reason)
          VALUES ($1,$2,'test-admin','shared_position_override','Deletion fixture') RETURNING id`, [f.competition, f.event]);
        await entry();
        await entry(f.candidate2, 1, audit.id);
        await query('DELETE FROM competitions WHERE id=$1', [f.competition]);
        for (const table of ['units', 'madrasas', 'categories', 'events', 'candidates', 'event_results', 'result_entries', 'competition_settings', 'audit_logs']) {
          assert.equal((await query(`SELECT count(*) FROM ${table} WHERE competition_id=$1`, [f.competition])).rows[0].count, '0');
        }
        assert.equal((await query('SELECT code FROM competitions')).rows[0].code, 'retained');
        assert.equal((await query('SELECT name FROM units')).rows[0].name, 'Retained unit');
        assert.equal((await query('SELECT count(*) FROM admin_account_fixture')).rows[0].count, '1');
      });

      await t.test('a failing real migration rolls back DDL and history', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'tkt03-rollback-'));
        try {
          await writeFile(join(directory, '9999_failure.sql'), 'CREATE TABLE rollback_probe(id integer); SELECT * FROM missing_tkt03_table;');
          await assert.rejects(migrate(pool, pathToFileURL(`${directory}/`)), (error) => error.code === '42P01');
          assert.equal((await pool.query("SELECT to_regclass('rollback_probe') AS relation")).rows[0].relation, null);
          assert.equal((await pool.query("SELECT count(*) FROM schema_migrations WHERE name='9999_failure.sql'")).rows[0].count, '0');
        } finally { await rm(directory, { recursive: true, force: true }); }
      });
    } finally {
      // schema consists solely of our fixed prefix plus random hex, never user input.
      assert.match(schema, /^tkt03_[a-f0-9]{20}$/);
      await connections.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  } finally { await connections.end(); }
});
