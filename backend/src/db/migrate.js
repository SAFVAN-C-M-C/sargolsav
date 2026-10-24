import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pool } from './pool.js';

const directory = new URL('../../migrations/', import.meta.url);
const lockKey = 73602102;

export async function migrate(connectionPool = pool, migrationDirectory = directory) {
  const names = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort();
  if (names.some((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) ||
      new Set(names.map((name) => name.slice(0, 4))).size !== names.length) {
    throw new Error('Migrations require unique NNNN_lowercase_name.sql prefixes');
  }
  const client = await connectionPool.connect();
  let locked = false;
  let discard;
  let failure;
  const applied = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
    locked = true;
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const executed = new Set(rows.map((row) => row.name));
    for (const name of names) {
      if (executed.has(name)) continue;
      const sql = await readFile(join(fileURLToPath(migrationDirectory), name), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { discard = new Error('Rollback failed'); }
        throw error;
      }
    }
  } catch (error) {
    failure = error;
    // A timed-out lock request may still be in flight: destroy this session.
    if (!locked) discard = new Error('Migration lock acquisition failed');
  } finally {
    if (locked && !discard) {
      try { await client.query('SELECT pg_advisory_unlock($1)', [lockKey]); }
      catch {
        discard = new Error('Unlock failed');
        failure ??= discard;
      }
    }
    client.release(discard);
  }
  if (failure) throw failure;
  return applied;
}
