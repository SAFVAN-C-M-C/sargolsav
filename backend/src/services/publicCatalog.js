import { runQuery } from '../db/index.js';
import { CompetitionError } from './competitions.js';

function validateId(id, label) {
  if (typeof id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    throw new CompetitionError(400, `${label} ID must be a positive bigint`);
  }
}

export function createPublicCatalogService(db = { runQuery }) {
  return {
    async list() {
      return (await db.runQuery(`SELECT id, name FROM competitions
        WHERE status = 'active' ORDER BY id DESC`)).rows;
    },
    async categories(id) {
      validateId(id, 'Competition');
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
    async events(competitionId, categoryId) {
      validateId(competitionId, 'Competition');
      validateId(categoryId, 'Category');
      // Availability requires a committed publication, never private winner entries.
      // One snapshot also distinguishes a missing category from an empty event list.
      const { rows } = await db.runQuery(`SELECT k.id AS category_id, k.name AS category_name,
        e.id, e.name, e.sort_order,
        CASE WHEN EXISTS (
          SELECT 1 FROM event_results r JOIN result_publications p
            ON p.event_result_id=r.id AND p.competition_id=r.competition_id
              AND p.category_id=r.category_id AND p.event_id=r.event_id
          WHERE r.competition_id=e.competition_id AND r.category_id=e.category_id
            AND r.event_id=e.id AND r.status='published'
        ) THEN 'published' ELSE 'unpublished' END AS status
        FROM competitions c JOIN categories k ON k.competition_id=c.id
        LEFT JOIN events e ON e.competition_id=k.competition_id AND e.category_id=k.id
        WHERE c.id=$1 AND k.id=$2 AND c.status='active'
        ORDER BY e.sort_order, e.id`, [competitionId, categoryId]);
      if (!rows.length) throw new CompetitionError(404, 'Category not available');
      return {
        category: { id: rows[0].category_id, name: rows[0].category_name },
        events: rows.filter((row) => row.id !== null).map(({ id, name, sort_order, status }) => ({ id, name, sort_order, status })),
      };
    },
  };
}
