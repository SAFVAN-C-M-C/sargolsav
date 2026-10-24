import { runQuery } from '../db/index.js';

export function createDatabaseHealth(query = runQuery) {
  return async (_request, response) => {
    try {
      await query('SELECT 1');
      response.json({ status: 'healthy' });
    } catch {
      response.status(503).json({ status: 'unhealthy', error: 'Database unavailable' });
    }
  };
}

export const getDatabaseHealth = createDatabaseHealth();
