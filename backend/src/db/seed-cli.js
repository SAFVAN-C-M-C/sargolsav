import { pool } from './pool.js';
import { assertDevelopmentSeed, seedDevelopment } from './seed.js';

try {
  assertDevelopmentSeed(process.env);
  await seedDevelopment((sql) => pool.query(sql));
  console.log('Development seed complete (existing demo data is preserved)');
} catch {
  console.error('Development seed failed. Check local-only seed flags, database configuration, and applied migrations.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
