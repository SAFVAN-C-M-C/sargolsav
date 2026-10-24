import { runQuery } from '../db/index.js';
import { CompetitionError } from './competitions.js';

export function createPublicCatalogService(db = { runQuery }) {
  return {
    async list() {
      return (await db.runQuery(`SELECT id, name FROM competitions
        WHERE status = 'active' ORDER BY id DESC`)).rows;
    },
    async categories(id) {
      if (typeof id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
        throw new CompetitionError(400, 'Competition ID must be a positive bigint');
      }
      // One snapshot distinguishes an unavailable competition from an empty category list.
      const { rows } = await db.runQuery(`SELECT c.id AS competition_id, c.name AS competition_name,
        k.id, k.name, k.sort_order FROM competitions c
        LEFT JOIN categories k ON k.competition_id = c.id
        WHERE c.id = $1 AND c.status = 'active' ORDER BY k.sort_order, k.id`, [id]);
      if (!rows.length) throw new CompetitionError(404, 'Competition not available');
      return {
        competition: { id: rows[0].competition_id, name: rows[0].competition_name },
        categories: rows.filter((row) => row.id !== null).map(({ id, name, sort_order }) => ({ id, name, sort_order })),
      };
    },
  };
}
