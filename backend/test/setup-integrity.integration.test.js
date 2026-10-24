import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withSetupDatabase } from '../test-support/setup-postgres.js';
import { seedDevelopment } from '../src/db/seed.js';
import { readFile } from 'node:fs/promises';

test('TKT-05D direct event deletion cannot cascade published results', { timeout: 120000 }, async (t) => {
  await withSetupDatabase(t, async ({ db, pool }) => {
    await seedDevelopment((sql, values) => pool.query(sql, values));
    await pool.query("UPDATE event_results SET status='published',reviewed_at=now(),reviewed_by='fixture',published_at=now(),published_by='fixture'");
    await pool.query(`INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position)
      SELECT er.competition_id,er.id,er.event_id,er.category_id,c.id,1
      FROM event_results er JOIN candidates c ON c.competition_id=er.competition_id WHERE c.candidate_code='001'`);
    await assert.rejects(db.transaction((query) => query('DELETE FROM events')), (error) => error.code === '23503');
    assert.equal((await pool.query('SELECT count(*) FROM event_results')).rows[0].count, '1');
    assert.equal((await pool.query('SELECT count(*) FROM result_entries')).rows[0].count, '1');
    // Preserve intentional full-competition cleanup, but only in our isolated test schema.
    await pool.query('DELETE FROM competitions');
    for (const table of ['events', 'event_results', 'result_entries', 'categories', 'units', 'madrasas', 'candidates', 'competition_settings']) {
      assert.equal((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count, '0');
    }
  });
});

test('TKT-05D client roles cannot bypass Firebase authorization, tamper with audit/history or reset identities', { timeout: 180000 }, async (t) => {
  await withSetupDatabase(t, async ({ db, pool }) => {
    const tables = ['competitions', 'competition_settings', 'units', 'madrasas', 'categories', 'events',
      'candidates', 'event_results', 'result_entries', 'audit_logs', 'schema_migrations',
      'result_publications', 'result_corrections', 'correction_entries'];
    const protectedTables = (await pool.query(`SELECT relname,relrowsecurity FROM pg_class
      WHERE relnamespace=current_schema()::regnamespace AND relname=ANY($1::text[])`, [tables])).rows;
    assert.equal(protectedTables.length, tables.length);
    assert.ok(protectedTables.every((row) => row.relrowsecurity));
    await seedDevelopment((sql, values) => pool.query(sql, values));
    const securitySql = await readFile(new URL('../migrations/0006_restrict_client_database_access.sql', import.meta.url), 'utf8');
    const { rows: roles } = await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') ORDER BY rolname");
    const schema = (await pool.query('SELECT current_schema() AS name')).rows[0].name;
    assert.match(schema, /^tkt05d_[a-f0-9]{20}$/);
    for (const { rolname } of roles) {
      assert.ok(['anon', 'authenticated'].includes(rolname));
      // Only a temporary schema grant; no role, membership or normal-schema changes.
      await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${rolname}`);
      const { rows: grants } = await pool.query(`SELECT relname,
        has_table_privilege($1,oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed
        FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname=ANY($2::text[])`, [rolname, tables]);
      assert.ok(grants.every((row) => row.allowed === false));
      const { rows: sequences } = await pool.query(`SELECT relname,has_sequence_privilege($1,oid,'USAGE,SELECT,UPDATE') AS allowed
        FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relkind='S'`, [rolname]);
      assert.equal(sequences.length, 12);
      assert.ok(sequences.every((row) => row.allowed === false));
      for (const sql of [
        "INSERT INTO competitions(code,name) VALUES ('attack','Attack')", "UPDATE competitions SET name='Attack'",
        'DELETE FROM competitions', 'TRUNCATE competitions CASCADE', 'DELETE FROM audit_logs',
        'DELETE FROM schema_migrations', "SELECT setval(pg_get_serial_sequence('competitions','id'),1)",
      ]) {
        await assert.rejects(db.transaction(async (query) => {
          await query(`SET LOCAL ROLE ${rolname}`);
          return query(sql);
        }), (error) => error.code === '42501', `${rolname}: ${sql}`);
      }
      // Demonstrate RLS still protects rows if ordinary DML is accidentally re-granted.
      await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON competitions TO ${rolname}`);
      await db.transaction(async (query) => {
        await query(`SET LOCAL ROLE ${rolname}`);
        assert.equal((await query('SELECT * FROM competitions')).rowCount, 0);
        assert.equal((await query("UPDATE competitions SET name='Attack'")).rowCount, 0);
        assert.equal((await query('DELETE FROM competitions')).rowCount, 0);
      });
      await assert.rejects(db.transaction(async (query) => {
        await query(`SET LOCAL ROLE ${rolname}`);
        return query("INSERT INTO competitions(code,name) VALUES ('attack','Attack')");
      }), (error) => error.code === '42501');
      // Reapplying the hardening statements safely restores grants, too.
      await pool.query(securitySql);
    }
    assert.equal((await pool.query('SELECT code FROM competitions')).rows[0].code, 'local-demo');
    assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '7');
  });
});
