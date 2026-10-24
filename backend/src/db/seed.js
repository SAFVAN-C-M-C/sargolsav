import { readFile } from 'node:fs/promises';

export function assertDevelopmentSeed(env) {
  const host = env.DATABASE_URL ? new URL(env.DATABASE_URL).hostname : (env.PGHOST || 'localhost');
  if (!['development', 'test'].includes(env.NODE_ENV) || env.ALLOW_DEV_SEED !== '1' ||
      !['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
    throw new Error('Seed requires NODE_ENV=development/test, ALLOW_DEV_SEED=1, and a loopback database host');
  }
}

export async function seedDevelopment(query) {
  // A single statement is atomic. The unique competition code makes repeat runs no-ops.
  await query(await readFile(new URL('../../seeds/development.sql', import.meta.url), 'utf8'));
}
