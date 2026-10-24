import { transaction } from '../db/index.js';
import { validateResultId, validateResultObject, lockResultParents } from './resultDrafts.js';

// Reusable SQL relation: one scored row per winner in the current publication.
// $1 = competition, $2 = category. Keep points and publications in one MVCC snapshot.
export const publishedScoresSql = `
  SELECT r.event_id,r.category_id,winner->>'candidate_code' AS candidate_code,
    (winner->'unit'->>'id')::bigint AS unit_id,
    winner->>'position' AS position,
    COALESCE((s.position_points->>(winner->>'position'))::numeric,0) AS points
  FROM event_results r
  LEFT JOIN competition_settings s ON s.competition_id=r.competition_id
  JOIN LATERAL (
    SELECT p.snapshot FROM result_publications p
    WHERE p.competition_id=r.competition_id AND p.event_id=r.event_id
      AND p.event_result_id=r.id AND p.category_id=r.category_id
    ORDER BY p.id DESC LIMIT 1
  ) p ON true
  CROSS JOIN LATERAL jsonb_array_elements(p.snapshot->'winners') winner
  WHERE r.competition_id=$1 AND r.category_id=$2 AND r.status='published'
`;

export function createScoringService(db = { transaction }) {
  return {
    async categoryUnits(params, filters = {}) {
      validateResultId(params.competitionId, 'Competition');
      validateResultId(params.categoryId, 'Category');
      validateResultObject(filters, []);
      return db.transaction(async (query) => {
        await lockResultParents(query, params, false);
        return (await query(`WITH scores AS (${publishedScoresSql}),
          positions AS (
            SELECT unit_id,position,sum(points) AS points,count(*) AS wins
            FROM scores GROUP BY unit_id,position
          ), totals AS (
            SELECT unit_id,sum(points) AS total_points,sum(wins) AS winning_entries,
              jsonb_object_agg(position,wins::text) AS position_wins
            FROM positions GROUP BY unit_id
          ), standings AS (
            SELECT u.id AS unit_id,u.name AS unit_name,
              COALESCE(t.total_points,0) AS total_points,
              COALESCE(t.winning_entries,0) AS winning_entries,
              COALESCE(t.position_wins,'{}'::jsonb) AS position_wins
            FROM units u LEFT JOIN totals t ON t.unit_id=u.id
            WHERE u.competition_id=$1
          )
          SELECT unit_id,unit_name,total_points::text,winning_entries::text,position_wins,
            (rank() OVER (ORDER BY total_points DESC))::text AS rank
          FROM standings ORDER BY standings.total_points DESC,lower(unit_name) COLLATE "C",unit_name COLLATE "C",unit_id`,
        [params.competitionId, params.categoryId])).rows;
      });
    },
  };
}
