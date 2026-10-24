import { pool } from './pool.js';

export function createDatabase(connectionPool) {
  return {
    runQuery(text, values = []) {
      return connectionPool.query(text, values);
    },
    async transaction(work) {
      const client = await connectionPool.connect();
      let discard;
      try {
        await client.query('BEGIN');
        const result = await work((text, values = []) => client.query(text, values));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { discard = new Error('Rollback failed'); }
        throw error;
      } finally {
        client.release(discard);
      }
    },
  };
}

export const { runQuery, transaction } = createDatabase(pool);
