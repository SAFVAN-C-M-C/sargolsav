import { migrate } from './migrate.js';
import { pool } from './pool.js';

try {
  const applied = await migrate();
  console.log(`Applied ${applied.length} migration(s)`);
} catch {
  console.error('Database migration failed. Check database availability, configuration, and migration SQL.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
