import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { databaseConfig } from '../src/db/config.js';
import { migrate } from '../src/db/migrate.js';
import { createDatabase } from '../src/db/index.js';

export async function withCatalogDatabase(t, work) {
  const schema = `tkt05c_${randomBytes(10).toString('hex')}`;
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
      if (env.TEST_DATABASE_URL || env.TKT05C_REQUIRE_POSTGRES === '1') throw error;
      t.skip(`PostgreSQL unavailable (${error.code || 'connection error'}); SQL behavior unverified`);
      return;
    }
    await connections.query(`CREATE SCHEMA ${schema}`);
    try {
      await migrate(pool);
      await work({ db: createDatabase(pool), pool });
    } finally {
      assert.match(schema, /^tkt05c_[a-f0-9]{20}$/);
      await connections.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  } finally { await connections.end(); }
}
