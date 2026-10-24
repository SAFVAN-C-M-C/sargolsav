import { isDeepStrictEqual } from 'node:util';
import { ResultDraftError } from './resultErrors.js';

export function meaningfulOverrideReason(value) {
  return typeof value === 'string' && !value.includes('\0') && value.trim().length <= 1000 &&
    (value.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 10 &&
    value.trim().split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length >= 2;
}
export function validateOverrideReason(reason) {
  if (!meaningfulOverrideReason(reason)) throw new ResultDraftError(400, 'Override reason must contain at least two words and ten letters or digits, with at most 1000 characters');
}
export function sharedPositionGroups(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.position)) grouped.set(entry.position, []);
    grouped.get(entry.position).push(entry.candidate_id);
  }
  return [...grouped].filter(([, ids]) => ids.length > 1).sort(([a], [b]) => a - b)
    .map(([position, ids]) => ({ position, candidate_ids: [...ids].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1) }));
}
export async function authorizeSharedPositions(query, params, row, entries, before, actor, reason, correction = false) {
  validateOverrideReason(reason);
  const positions = sharedPositionGroups(entries);
  if (!positions.length && !before.some((entry) => entry.override_audit_id !== null)) {
    throw new ResultDraftError(400, 'Use ordinary editing when there are no shared positions to assign or remove');
  }
  const details = { event_result_id: correction ? row.event_result_id : row.id,
    correction_id: correction ? row.id : null, previous_version: row.version,
    positions, previous_positions: sharedPositionGroups(before) };
  const { rows: [audit] } = await query(`INSERT INTO audit_logs(competition_id,event_id,actor_ref,action,reason,details)
    VALUES ($1,$2,$3,'shared_position_override',$4,$5::jsonb) RETURNING id`,
  [params.competitionId, params.eventId, actor, reason.trim(), JSON.stringify(details)]);
  const shared = new Set(positions.map((group) => group.position));
  return entries.map((entry) => ({ ...entry, override_audit_id: shared.has(entry.position) ? audit.id : null }));
}

// FKs establish audit action/event scope. These checks establish approval for the actual edit.
export async function validateSharedPositions(query, params, row, entries, correction = false) {
  const groups = sharedPositionGroups(entries);
  const invalid = () => { throw new ResultDraftError(409, 'Shared-position approval does not match these entries; use explicit shared-position editing'); };
  if (!groups.length) {
    if (entries.some((entry) => entry.override_audit_id !== null)) invalid();
    return null;
  }
  const positions = new Set(groups.map((group) => group.position));
  const tied = entries.filter((entry) => positions.has(entry.position));
  const approval = tied[0].override_audit_id;
  if (!approval || tied.some((entry) => entry.override_audit_id !== approval) ||
      entries.some((entry) => !positions.has(entry.position) && entry.override_audit_id !== null)) invalid();
  const { rows: [audit] } = await query(`SELECT id,actor_ref,reason,created_at,details FROM audit_logs
    WHERE id=$1 AND competition_id=$2 AND event_id=$3 AND action='shared_position_override' FOR SHARE`,
  [approval, params.competitionId, params.eventId]);
  const liveId = correction ? row.event_result_id : row.id;
  if (!audit || !meaningfulOverrideReason(audit.reason) || !audit.actor_ref?.trim() ||
      audit.details.event_result_id !== liveId || !isDeepStrictEqual(audit.details.positions, groups)) invalid();
  if (!correction && audit.details.correction_id !== null) invalid();
  if (correction && audit.details.correction_id !== row.id) {
    // An unchanged published tie may be copied into a new workspace with its original provenance.
    const liveEntries = (await query(`SELECT candidate_id,position,override_audit_id FROM result_entries
      WHERE competition_id=$1 AND event_result_id=$2`, [params.competitionId, liveId])).rows;
    const liveShared = liveEntries.filter((entry) => positions.has(entry.position));
    if (!isDeepStrictEqual(sharedPositionGroups(liveEntries), groups) ||
        liveShared.some((entry) => entry.override_audit_id !== approval)) invalid();
  }
  return { audit_id: audit.id, actor_ref: audit.actor_ref, reason: audit.reason,
    created_at: audit.created_at.toISOString(), details: audit.details };
}
