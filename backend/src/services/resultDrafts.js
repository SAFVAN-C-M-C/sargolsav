import { transaction } from '../db/index.js';
import { resolveCandidate } from './candidates.js';
import { ResultDraftError } from './resultErrors.js';
import { authorizeSharedPositions, validateOverrideReason } from './sharedPositions.js';

export { ResultDraftError } from './resultErrors.js';
export const resultVersion = "xmin::text || ':' || to_char(updated_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')";
const resultColumns = `id, competition_id, event_id, category_id, status, created_at, updated_at, ${resultVersion} AS version`;
function invalid(message) { throw new ResultDraftError(400, message); }
function id(value, label) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) invalid(`${label} ID must be a positive bigint`);
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) invalid(`${label} must be a nonblank string without null characters`);
}
function object(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) invalid('Invalid request fields');
}
function path(params, event = true) {
  id(params.competitionId, 'Competition');
  if (event || params.categoryId !== undefined) id(params.categoryId, 'Category');
  if (event) id(params.eventId, 'Event');
}
function entriesPayload(body, shared = false) {
  object(body, shared ? ['version', 'entries', 'shared_positions', 'reason'] : ['version', 'entries']);
  if (shared) {
    if (body.shared_positions !== true) invalid('shared_positions must explicitly be true');
    validateOverrideReason(body.reason);
  }
  if (typeof body.version !== 'string' || !/^[0-9]+:[0-9]{14}\.[0-9]{6}$/.test(body.version)) invalid('A valid draft version is required');
  if (!Array.isArray(body.entries)) invalid('entries must be an array');
  const codes = new Set();
  const positions = new Set();
  for (const entry of body.entries) {
    object(entry, ['candidate_code', 'name', 'unit_id', 'madrasa_id', 'position'], ['candidate_code', 'name', 'unit_id', 'position']);
    text(entry.candidate_code, 'Candidate code'); text(entry.name, 'Name'); id(entry.unit_id, 'Unit');
    if (entry.madrasa_id !== undefined && entry.madrasa_id !== null) id(entry.madrasa_id, 'Madrassa');
    if (!Number.isInteger(entry.position) || entry.position < 1 || entry.position > 2147483647) invalid('Position must be a positive PostgreSQL integer');
    if (codes.has(entry.candidate_code)) invalid('Candidate cannot appear twice in an event');
    if (!shared && positions.has(entry.position)) invalid('Shared positions are not allowed in ordinary draft entry');
    codes.add(entry.candidate_code); positions.add(entry.position);
  }
}
async function parents(query, params, event = true, write = false) {
  const { rows: competitions } = await query('SELECT id FROM competitions WHERE id = $1 FOR SHARE', [params.competitionId]);
  if (!competitions.length) throw new ResultDraftError(404, 'Competition not found');
  if (params.categoryId !== undefined) {
    const { rows } = await query('SELECT id FROM categories WHERE competition_id = $1 AND id = $2 FOR KEY SHARE', [params.competitionId, params.categoryId]);
    if (!rows.length) throw new ResultDraftError(404, 'Category not found');
  }
  if (event) {
    const { rows } = await query(`SELECT id FROM events WHERE competition_id = $1 AND category_id = $2 AND id = $3 ${write ? 'FOR UPDATE' : 'FOR KEY SHARE'}`,
      [params.competitionId, params.categoryId, params.eventId]);
    if (!rows.length) throw new ResultDraftError(404, 'Event not found');
  }
}
async function find(query, params, write) {
  const { rows: [row] } = await query(`SELECT ${resultColumns} FROM event_results
    WHERE competition_id = $1 AND category_id = $2 AND event_id = $3 ${write ? 'FOR UPDATE' : 'FOR SHARE'}`,
  [params.competitionId, params.categoryId, params.eventId]);
  if (!row) throw new ResultDraftError(404, 'Result draft not found');
  if (row.status !== 'draft') throw new ResultDraftError(409, 'Only draft results can be managed through this endpoint');
  return row;
}
async function entries(query, result) {
  return (await query(`SELECT r.id, r.candidate_id, r.position, r.override_audit_id,
    c.candidate_code, c.name, c.unit_id, c.madrasa_id
    FROM result_entries r JOIN candidates c ON c.id = r.candidate_id
      AND c.competition_id = r.competition_id AND c.category_id = r.category_id
    WHERE r.competition_id = $1 AND r.event_result_id = $2 ORDER BY r.position, c.candidate_code COLLATE "C", c.id`, [result.competition_id, result.id])).rows;
}
async function snapshot(query, result) { return { ...result, entries: await entries(query, result) }; }
async function audit(query, params, actor, action, before, after) {
  await query(`INSERT INTO audit_logs (competition_id, event_id, actor_ref, action, reason, details)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [params.competitionId, params.eventId, actor, action,
    'Admin result draft management', JSON.stringify({ event_result_id: after.id, before, after })]);
}

export function createResultDraftService(db = { transaction }) {
  return {
    async initialize(params, body, actor) {
      path(params); object(body === undefined ? {} : body, []); text(actor, 'Actor');
      return db.transaction(async (query) => {
        // Event lock serializes initializations even when a result row does not exist yet.
        await parents(query, params, true, true);
        const { rows: [created] } = await query(`INSERT INTO event_results (competition_id, category_id, event_id)
          VALUES ($1,$2,$3) ON CONFLICT (event_id) DO NOTHING RETURNING ${resultColumns}`,
        [params.competitionId, params.categoryId, params.eventId]);
        const draft = await snapshot(query, created ?? await find(query, params, true));
        if (created) await audit(query, params, actor, 'result_draft_created', null, draft);
        return { draft, created: Boolean(created) };
      });
    },
    async get(params) {
      path(params);
      return db.transaction(async (query) => {
        await parents(query, params);
        // Shared result lock keeps the header/version and entries consistent with each other.
        return snapshot(query, await find(query, params, false));
      });
    },
    async save(params, body, actor, shared = false) {
      path(params); entriesPayload(body, shared); text(actor, 'Actor');
      return db.transaction(async (query) => {
        await parents(query, params, true, true);
        const current = await find(query, params, true);
        if (current.version !== body.version) throw new ResultDraftError(409, 'Draft changed; retrieve the latest version before saving');
        const { rows: [settings] } = await query('SELECT position_points FROM competition_settings WHERE competition_id = $1 FOR SHARE', [params.competitionId]);
        for (const entry of body.entries) {
          if (!settings || !Object.hasOwn(settings.position_points, String(entry.position))) invalid('Position is not configured for this competition');
        }
        const before = await snapshot(query, current);
        if (!shared && before.entries.some((entry) => entry.override_audit_id !== null)) throw new ResultDraftError(409, 'Draft contains shared positions; use explicit shared-position editing');
        const resolved = [];
        // Consistent candidate lock order avoids inverse-order deadlocks between different events.
        const ordered = [...body.entries].sort((a, b) => a.candidate_code < b.candidate_code ? -1 : a.candidate_code > b.candidate_code ? 1 : 0);
        for (const entry of ordered) {
          const { position, ...candidate } = entry;
          const row = await resolveCandidate(query, { ...candidate, competition_id: params.competitionId, category_id: params.categoryId }, actor);
          resolved.push({ candidate_id: row.id, position });
        }
        const approved = shared ? await authorizeSharedPositions(query, params, current, resolved, before.entries, actor, body.reason) : resolved;
        await query('DELETE FROM result_entries WHERE competition_id = $1 AND event_result_id = $2', [params.competitionId, current.id]);
        for (const entry of approved) {
          await query(`INSERT INTO result_entries (competition_id, event_result_id, event_id, category_id, candidate_id, position, override_audit_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`, [params.competitionId, current.id, params.eventId, params.categoryId, entry.candidate_id, entry.position, entry.override_audit_id ?? null]);
        }
        // The existing trigger advances updated_at; xmin and full timestamp precision form the version.
        const { rows: [updated] } = await query(`UPDATE event_results SET updated_at = clock_timestamp()
          WHERE competition_id = $1 AND id = $2 RETURNING ${resultColumns}`, [params.competitionId, current.id]);
        const after = await snapshot(query, updated);
        await audit(query, params, actor, 'result_draft_updated', before, after);
        return after;
      });
    },
    async list(params, filters = {}) {
      path(params, false);
      object(filters, ['category_id'], []);
      if (params.categoryId !== undefined && Object.keys(filters).length) invalid('Category is already specified in the path');
      if (filters.category_id !== undefined) id(filters.category_id, 'Category');
      const scoped = { ...params, categoryId: params.categoryId ?? filters.category_id };
      return db.transaction(async (query) => {
        await parents(query, scoped, false);
        return (await query(`SELECT e.id AS event_id, e.category_id, e.name AS event_name,
          r.id AS event_result_id, COALESCE(r.status, 'not_started') AS status, r.updated_at
          FROM events e LEFT JOIN event_results r ON r.event_id = e.id AND r.competition_id = e.competition_id
            AND r.category_id = e.category_id
          WHERE e.competition_id = $1 ${scoped.categoryId === undefined ? '' : 'AND e.category_id = $2'}
          ORDER BY e.category_id, e.sort_order, e.id`, scoped.categoryId === undefined ? [params.competitionId] : [params.competitionId, scoped.categoryId])).rows;
      });
    },
  };
}

// Shared validation and parent lock order for result lifecycle/correction services.
export { id as validateResultId, text as validateResultText, object as validateResultObject,
  path as validateResultPath, entriesPayload as validateDraftEntries, parents as lockResultParents };
