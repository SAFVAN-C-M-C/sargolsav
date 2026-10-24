import { transaction } from '../db/index.js';
import { validateResultId, validateResultObject, lockResultParents } from './resultDrafts.js';

// Reusable SQL relation: one scored row per winner in the current publication.
// $1 = competition, optional $2 = category. Scope is internal, never request SQL.
function publishedScores(category = true) {
  return `
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
  WHERE r.competition_id=$1 ${category ? 'AND r.category_id=$2' : ''} AND r.status='published'
`;
}

export const publishedScoresSql = publishedScores();

// identity is an internal SQL column name, never request input.
function totalsSql(identity, category = true) {
  return `WITH scores AS (${publishedScores(category)}),
    positions AS (
      SELECT ${identity},position,sum(points) AS points,count(*) AS wins
      FROM scores GROUP BY ${identity},position
    ), totals AS (
      SELECT ${identity},sum(points) AS total_points,sum(wins) AS winning_entries,
        jsonb_object_agg(position,wins::text) AS position_wins
      FROM positions GROUP BY ${identity}
    )`;
}

function unitStandingsSql(category = true) {
  return `${totalsSql('unit_id', category)}, standings AS (
    SELECT u.id AS unit_id,u.name AS unit_name,
      COALESCE(t.total_points,0) AS total_points,
      COALESCE(t.winning_entries,0) AS winning_entries,
      COALESCE(t.position_wins,'{}'::jsonb) AS position_wins
    FROM units u LEFT JOIN totals t ON t.unit_id=u.id
    WHERE u.competition_id=$1
  )
  SELECT unit_id,unit_name,total_points::text,winning_entries::text,position_wins,
    (rank() OVER (ORDER BY total_points DESC))::text AS rank
  FROM standings ORDER BY standings.total_points DESC,lower(unit_name) COLLATE "C",unit_name COLLATE "C",unit_id`;
}

export function createScoringService(db = { transaction }) {
  async function readScope(params, filters, sql, category = true) {
    validateResultId(params.competitionId, 'Competition');
    if (category) validateResultId(params.categoryId, 'Category');
    validateResultObject(filters, []);
    return db.transaction(async (query) => {
      await lockResultParents(query, category ? params : { competitionId: params.competitionId }, false);
      return (await query(sql, [params.competitionId, ...(category ? [params.categoryId] : [])])).rows;
    });
  }
  return {
    async categoryUnits(params, filters = {}) {
      return readScope(params, filters, unitStandingsSql());
    },
    async overallUnits(params, filters = {}) {
      return readScope(params, filters, unitStandingsSql(false), false);
    },
    async categoryCandidates(params, filters = {}) {
      return readScope(params, filters, `${totalsSql('candidate_code')}, standings AS (
        SELECT c.id AS candidate_id,c.candidate_code,c.name AS candidate_name,
          c.unit_id,u.name AS unit_name,c.madrasa_id,m.name AS madrasa_name,
          COALESCE(t.total_points,0) AS total_points,
          COALESCE(t.winning_entries,0) AS winning_entries,
          COALESCE(t.position_wins,'{}'::jsonb) AS position_wins
        FROM candidates c
        JOIN units u ON u.id=c.unit_id AND u.competition_id=c.competition_id
        LEFT JOIN madrasas m ON m.id=c.madrasa_id AND m.unit_id=c.unit_id AND m.competition_id=c.competition_id
        LEFT JOIN totals t ON t.candidate_code=c.candidate_code
        WHERE c.competition_id=$1 AND c.category_id=$2
      )
      SELECT candidate_id,candidate_code,candidate_name,unit_id,unit_name,madrasa_id,madrasa_name,
        total_points::text,winning_entries::text,position_wins,
        (rank() OVER (ORDER BY total_points DESC))::text AS rank
      FROM standings ORDER BY standings.total_points DESC,lower(candidate_name) COLLATE "C",
        candidate_name COLLATE "C",candidate_code COLLATE "C",candidate_id`);
    },
  };
}
