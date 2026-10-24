import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDevelopmentSeed } from '../src/db/seed.js';

test('development seed requires explicit opt-in, nonproduction mode and loopback', () => {
  const env = { NODE_ENV: 'development', ALLOW_DEV_SEED: '1', PGHOST: 'localhost' };
  assert.doesNotThrow(() => assertDevelopmentSeed(env));
  for (const change of [{ NODE_ENV: 'production' }, { ALLOW_DEV_SEED: '' },
    { PGHOST: 'remote' }, { DATABASE_URL: 'postgres://user:pass@remote/db' }]) {
    assert.throws(() => assertDevelopmentSeed({ ...env, ...change }), /Seed requires/);
  }
});
