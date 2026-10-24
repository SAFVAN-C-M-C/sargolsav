import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../src/db/index.js';
import { databaseConfig } from '../src/db/config.js';
import { migrate } from '../src/db/migrate.js';
import { createDatabaseHealth } from '../src/controllers/databaseHealth.js';
import express from 'express';

function fixture(fail = () => false) {
  const calls = [];
  const failure = new Error('secret driver detail');
  const client = {
    async query(sql, values) {
      calls.push([sql, values]);
      if (fail(sql)) throw failure;
      return { rows: sql === 'SELECT name FROM schema_migrations' ? [{ name: '0001_old.sql' }] : [] };
    },
    release(error) { calls.push(['release', error]); },
  };
  return { calls, failure, pool: { query: client.query, async connect() { return client; } } };
}

test('configuration defaults, URL precedence, TLS and validation', () => {
  const config = databaseConfig({});
  assert.equal(config.max, 5);
  assert.equal(config.port, 5432);
  assert.equal(config.connectionTimeoutMillis, 5000);
  assert.equal(config.ssl, false);
  const hosted = databaseConfig({ DATABASE_URL: 'postgres://user:pass@host/db', PGSSLMODE: 'verify-full' });
  assert.deepEqual(hosted.ssl, { rejectUnauthorized: true });
  assert.equal(hosted.host, undefined);
  for (const env of [{ PGPORT: '0' }, { PGPOOL_MAX: '1.5' }, { PGQUERY_TIMEOUT_MS: '-1' },
    { DATABASE_URL: 'secret' }, { DATABASE_URL: 'postgres://user:%ZZ@host/db' }, { DATABASE_URL: 'https://host' },
    { DATABASE_URL: 'postgres://host/db?sslmode=require' }, { PGSSLMODE: 'require' }]) {
    assert.throws(() => databaseConfig(env), (error) => !error.message.includes('secret'));
  }
});

test('runQuery forwards SQL and values without interpolation and propagates failures', async () => {
  const f = fixture((sql) => sql === 'bad');
  const db = createDatabase(f.pool);
  const values = ["'; DROP TABLE x; --"];
  await db.runQuery('SELECT $1', values);
  assert.deepEqual(f.calls[0], ['SELECT $1', values]);
  await assert.rejects(db.runQuery('bad'), f.failure);
});

test('transaction uses one client, commits, returns result, and releases', async () => {
  const f = fixture();
  const result = await createDatabase(f.pool).transaction(async (query) => {
    await query('SELECT $1', [42]);
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(f.calls.map(([sql]) => sql), ['BEGIN', 'SELECT $1', 'COMMIT', 'release']);
});

for (const stage of ['BEGIN', 'work', 'COMMIT', 'ROLLBACK']) {
  test(`transaction cleans up after ${stage} failure`, async () => {
    const f = fixture((sql) => sql === stage);
    const error = new Error('work failed');
    await assert.rejects(createDatabase(f.pool).transaction(async () => {
      if (stage === 'work' || stage === 'ROLLBACK') throw error;
    }), stage === 'work' || stage === 'ROLLBACK' ? error : f.failure);
    assert.equal(f.calls.at(-2)[0], 'ROLLBACK');
    assert.equal(f.calls.at(-1)[0], 'release');
    assert.equal(Boolean(f.calls.at(-1)[1]), stage === 'ROLLBACK');
  });
}

test('connection acquisition failures propagate without release', async () => {
  const error = new Error('offline');
  const pool = { async connect() { throw error; } };
  await assert.rejects(createDatabase(pool).transaction(() => {}), error);
  await assert.rejects(migrate(pool), error);
});

async function migrationFiles(work) {
  const path = await mkdtemp(join(tmpdir(), 'sargolsav-migrations-'));
  try {
    await writeFile(join(path, '0003_last.sql'), 'SELECT 3');
    await writeFile(join(path, '0001_old.sql'), 'SELECT 1');
    await writeFile(join(path, '0002_next.sql'), 'SELECT 2');
    await work(pathToFileURL(`${path}/`), path);
  } finally { await rm(path, { recursive: true, force: true }); }
}

test('migrations lock before reading history, skip applied files and execute deterministically', async () => {
  await migrationFiles(async (directory) => {
    const f = fixture();
    assert.deepEqual(await migrate(f.pool, directory), ['0002_next.sql', '0003_last.sql']);
    assert.equal(f.calls[0][0], 'SELECT pg_advisory_lock($1)');
    assert.deepEqual(f.calls.filter(([sql]) => sql.startsWith('INSERT')).map(([, values]) => values),
      [['0002_next.sql'], ['0003_last.sql']]);
    assert.deepEqual(f.calls.map(([sql]) => sql).slice(3, 7),
      ['BEGIN', 'SELECT 2', 'INSERT INTO schema_migrations (name) VALUES ($1)', 'COMMIT']);
    assert.equal(f.calls.at(-2)[0], 'SELECT pg_advisory_unlock($1)');
    assert.equal(f.calls.at(-1)[0], 'release');
  });
});

test('migration SQL failures roll back without history insertion and always unlock/release', async () => {
  await migrationFiles(async (directory) => {
    const f = fixture((sql) => sql === 'SELECT 2');
    await assert.rejects(migrate(f.pool, directory), f.failure);
    assert.equal(f.calls.some(([sql]) => sql.startsWith('INSERT')), false);
    assert.deepEqual(f.calls.slice(-3).map(([sql]) => sql),
      ['ROLLBACK', 'SELECT pg_advisory_unlock($1)', 'release']);
  });
});

test('failed migration rollback or unlock discards the connection', async () => {
  for (const stage of ['ROLLBACK', 'SELECT pg_advisory_unlock($1)']) {
    await migrationFiles(async (directory) => {
      const f = fixture((sql) => sql === stage || (stage === 'ROLLBACK' && sql === 'SELECT 2'));
      if (stage === 'ROLLBACK') await assert.rejects(migrate(f.pool, directory));
      else await assert.rejects(migrate(f.pool, directory), /Unlock failed/);
      assert.ok(f.calls.at(-1)[1] instanceof Error);
    });
  }
});

test('duplicate migration prefixes are rejected before acquiring connections', async () => {
  await migrationFiles(async (directory, path) => {
    await writeFile(join(path, '0002_duplicate.sql'), 'SELECT 4');
    const f = fixture();
    await assert.rejects(migrate(f.pool, directory), /unique/);
    assert.equal(f.calls.length, 0);
  });
});

test('database health HTTP responses are healthy or sanitized 503', async () => {
  for (const available of [true, false]) {
    const app = express();
    app.get('/api/health/db', createDatabaseHealth(async (sql) => {
      assert.equal(sql, 'SELECT 1');
      if (!available) throw new Error('password=secret');
    }));
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise((resolve) => server.once('listening', resolve));
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health/db`);
      assert.equal(response.status, available ? 200 : 503);
      assert.deepEqual(await response.json(), available ? { status: 'healthy' } :
        { status: 'unhealthy', error: 'Database unavailable' });
    } finally { await new Promise((resolve) => server.close(resolve)); }
  }
});


test('concurrent migration runners re-read history after the shared lock (mock database)', async () => {
  await migrationFiles(async (directory) => {
    let tail = Promise.resolve();
    const history = new Set(['0001_old.sql']);
    const insertions = [];
    let releases = 0;
    const connectionPool = {
      async connect() {
        let unlock;
        return {
          async query(sql, values) {
            if (sql === 'SELECT pg_advisory_lock($1)') {
              const previous = tail;
              tail = new Promise((resolve) => { unlock = resolve; });
              await previous;
            }
            if (sql === 'SELECT name FROM schema_migrations') {
              return { rows: [...history].map((name) => ({ name })) };
            }
            if (sql.startsWith('INSERT')) {
              assert.equal(history.has(values[0]), false);
              history.add(values[0]);
              insertions.push(values[0]);
            }
            if (sql === 'SELECT pg_advisory_unlock($1)') unlock();
            return { rows: [] };
          },
          release() { releases += 1; },
        };
      },
    };
    const results = await Promise.all([migrate(connectionPool, directory), migrate(connectionPool, directory)]);
    assert.deepEqual(results, [['0002_next.sql', '0003_last.sql'], []]);
    assert.deepEqual(insertions, ['0002_next.sql', '0003_last.sql']);
    assert.equal(releases, 2);
  });
});

test('failed advisory lock acquisition destroys the uncertain session', async () => {
  const f = fixture((sql) => sql === 'SELECT pg_advisory_lock($1)');
  await assert.rejects(migrate(f.pool), f.failure);
  assert.equal(f.calls.at(-1)[0], 'release');
  assert.ok(f.calls.at(-1)[1] instanceof Error);
});

test('an empty migration directory still creates migration history', async () => {
  const path = await mkdtemp(join(tmpdir(), 'sargolsav-empty-'));
  try {
    const f = fixture();
    assert.deepEqual(await migrate(f.pool, pathToFileURL(`${path}/`)), []);
    assert.ok(f.calls.some(([sql]) => sql.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')));
  } finally { await rm(path, { recursive: true, force: true }); }
});
