import { isDeepStrictEqual } from 'node:util';
import { transaction } from '../db/index.js';
import { resolveCandidate } from './candidates.js';
import { authorizeSharedPositions, validateSharedPositions } from './sharedPositions.js';
import { ResultDraftError, resultVersion, validateResultId as id, validateResultText as text,
  validateResultObject as object, validateResultPath as path, validateDraftEntries,
  lockResultParents as parents } from './resultDrafts.js';

const fail = (status, message) => { throw new ResultDraftError(status, message); };
function versionBody(body, reason = false) {
  object(body, reason ? ['version', 'reason'] : ['version']);
  if (typeof body.version !== 'string' || !/^[0-9]+:[0-9]{14}\.[0-9]{6}$/.test(body.version)) fail(400, 'A valid result version is required');
  if (reason) text(body.reason, 'Correction reason');
}
function checkVersion(row, version) {
  if (row.version !== version) fail(409, 'Result changed; retrieve the latest version before retrying');
}
function state(row, expected) {
  if (row.status !== expected) fail(409, `Operation requires ${expected} status`);
}
async function record(query, params, correction = false, write = true) {
  const { rows: [row] } = await query(`SELECT *, ${resultVersion} AS version FROM ${correction ? 'result_corrections' : 'event_results'}
    WHERE competition_id=$1 AND category_id=$2 AND event_id=$3 ${correction ? 'AND id=$4' : ''} ${write ? 'FOR UPDATE' : 'FOR SHARE'}`,
  [params.competitionId, params.categoryId, params.eventId, ...(correction ? [params.correctionId] : [])]);
  if (!row) fail(404, correction ? 'Correction not found' : 'Event result not found');
  return row;
}
async function winnerEntries(query, row, correction = false) {
  const rows = (await query(`SELECT r.id, r.candidate_id, r.position, r.override_audit_id,
    c.candidate_code,c.name,c.unit_id,c.madrasa_id,u.name AS unit_name,m.name AS madrasa_name
    FROM ${correction ? 'correction_entries' : 'result_entries'} r
    JOIN candidates c ON c.id=r.candidate_id AND c.competition_id=r.competition_id AND c.category_id=r.category_id
    JOIN units u ON u.id=c.unit_id AND u.competition_id=c.competition_id
    LEFT JOIN madrasas m ON m.id=c.madrasa_id AND m.unit_id=c.unit_id AND m.competition_id=c.competition_id
    WHERE r.competition_id=$1 AND r.${correction ? 'correction_id' : 'event_result_id'}=$2
    ORDER BY c.id,r.id FOR SHARE OF c`, [row.competition_id, row.id])).rows;
  return rows.sort((a, b) => a.position - b.position || (a.candidate_code < b.candidate_code ? -1 : a.candidate_code > b.candidate_code ? 1 : 0) || (BigInt(a.candidate_id) < BigInt(b.candidate_id) ? -1 : 1));
}
async function view(query, row, correction = false) {
  const visible = { ...row };
  delete visible.review_snapshot;
  return { ...visible, entries: await winnerEntries(query, row, correction) };
}
async function latestPublication(query, live) {
  return (await query('SELECT id FROM result_publications WHERE competition_id=$1 AND event_result_id=$2 ORDER BY id DESC LIMIT 1', [live.competition_id, live.id])).rows[0];
}
async function validateReview(query, params, row, correction) {
  const entries = await winnerEntries(query, row, correction);
  const { rows: [settings] } = await query('SELECT position_points FROM competition_settings WHERE competition_id=$1 FOR SHARE', [params.competitionId]);
  const positions = Object.keys(settings?.position_points ?? {});
  if (!positions.length || positions.some((p) => !entries.some((e) => String(e.position) === p))) {
    fail(400, 'Review and publication require a winner for every configured position');
  }
  const codes = new Set();
  for (const entry of entries) {
    text(entry.candidate_code, 'Candidate code'); text(entry.name, 'Name');
    id(entry.unit_id, 'Unit');
    if (entry.madrasa_id !== null) { id(entry.madrasa_id, 'Madrassa'); text(entry.madrasa_name, 'Madrassa name'); }
    if (!Number.isInteger(entry.position) || entry.position < 1 || !Object.hasOwn(settings.position_points, String(entry.position)) || codes.has(entry.candidate_code)) fail(400, 'Invalid or duplicate winner');
    codes.add(entry.candidate_code);
  }
  const sharedApproval = await validateSharedPositions(query, params, row, entries, correction);
  const { rows: [event] } = await query(`SELECT e.name AS event_name,c.name AS category_name FROM events e
    JOIN categories c ON c.id=e.category_id AND c.competition_id=e.competition_id
    WHERE e.competition_id=$1 AND e.category_id=$2 AND e.id=$3`, [params.competitionId, params.categoryId, params.eventId]);
  const publication = { competition_id: params.competitionId, event_id: params.eventId, category_id: params.categoryId,
    ...event, winners: entries.map((e) => ({ candidate_code: e.candidate_code, name: e.name, position: e.position,
      unit: { id: e.unit_id, name: e.unit_name }, madrasa: e.madrasa_id === null ? null : { id: e.madrasa_id, name: e.madrasa_name } })) };
  return { position_points: settings.position_points, publication, ...(sharedApproval ? { shared_position_approval: sharedApproval } : {}) };
}
async function audit(query, params, actor, action, before, after, reason = 'Admin result lifecycle management') {
  await query(`INSERT INTO audit_logs(competition_id,event_id,actor_ref,action,reason,details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [params.competitionId, params.eventId, actor, action, reason, JSON.stringify({ before, after })]);
}
async function insertPublication(query, live, projection) {
  return (await query(`INSERT INTO result_publications(competition_id,event_result_id,event_id,category_id,
    reviewed_by,reviewed_at,published_by,published_at,snapshot)
    SELECT competition_id,id,event_id,category_id,reviewed_by,reviewed_at,published_by,published_at,$3::jsonb
    FROM event_results WHERE competition_id=$1 AND id=$2 RETURNING id`, [live.competition_id, live.id, JSON.stringify(projection)])).rows[0];
}
async function replaceEntries(query, params, row, entries, correction) {
  await query(`DELETE FROM ${correction ? 'correction_entries' : 'result_entries'} WHERE competition_id=$1 AND ${correction ? 'correction_id' : 'event_result_id'}=$2`, [params.competitionId, row.id]);
  for (const entry of entries) {
    await query(`INSERT INTO ${correction ? 'correction_entries' : 'result_entries'}(competition_id,${correction ? 'correction_id' : 'event_result_id'},event_id,category_id,candidate_id,position,override_audit_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [params.competitionId, row.id, params.eventId, params.categoryId, entry.candidate_id, entry.position, entry.override_audit_id ?? null]);
  }
}

export function createResultLifecycleService(db = { transaction }) {
  async function context(query, params, correction, write = true) {
    await parents(query, params, true, write);
    const live = await record(query, params, false, write);
    if (!correction) return { live, row: live };
    state(live, 'published');
    const row = await record(query, params, true, write);
    if (row.event_result_id !== live.id) fail(404, 'Correction not found');
    return { live, row };
  }
  function validatePath(params, correction) { path(params); if (correction) id(params.correctionId, 'Correction'); }
  async function transition(params, body, actor, operation, correction) {
    validatePath(params, correction); versionBody(body); text(actor, 'Actor');
    return db.transaction(async (query) => {
      const { live, row } = await context(query, params, correction);
      checkVersion(row, body.version);
      state(row, operation === 'review' ? 'draft' : 'reviewed');
      const before = await view(query, row, correction);
      const table = correction ? 'result_corrections' : 'event_results';
      const update = async (sql, values = []) => (await query(`UPDATE ${table} SET ${sql}
        WHERE competition_id=$1 AND id=$2 RETURNING *, ${resultVersion} AS version`, [params.competitionId, row.id, ...values])).rows[0];
      let after;
      if (operation === 'return-to-draft') {
        after = await update("status='draft',reviewed_by=NULL,reviewed_at=NULL,review_snapshot=NULL");
      } else {
        const checked = await validateReview(query, params, row, correction);
        if (operation === 'review') {
          after = await update("status='reviewed',reviewed_by=$3,reviewed_at=clock_timestamp(),review_snapshot=$4::jsonb", [actor, JSON.stringify(checked)]);
        } else {
          if (!row.review_snapshot || !isDeepStrictEqual(row.review_snapshot, checked)) fail(409, 'Result information or points configuration changed after review; return to draft and review again');
          if (correction) {
            const latest = await latestPublication(query, live);
            if (latest?.id !== row.base_publication_id) fail(409, 'Published base changed; correction cannot be applied');
            const correctedEntries = await winnerEntries(query, row, true);
            await replaceEntries(query, params, live, correctedEntries, false);
            await query(`UPDATE event_results SET reviewed_by=c.reviewed_by,reviewed_at=c.reviewed_at,review_snapshot=c.review_snapshot,
              published_by=$4,published_at=clock_timestamp() FROM result_corrections c
              WHERE event_results.competition_id=$1 AND event_results.id=$2 AND c.id=$3 AND c.competition_id=$1`,
            [params.competitionId, live.id, row.id, actor]);
            after = await update("status='applied',applied_by=$3,applied_at=clock_timestamp()", [actor]);
          } else {
            after = await update("status='published',published_by=$3,published_at=clock_timestamp()", [actor]);
          }
          const publication = await insertPublication(query, live, checked.publication);
          const visible = await view(query, after, correction);
          visible.publication_id = publication.id;
          await audit(query, params, actor, correction ? 'result_correction_published' : 'result_published', before, visible, correction ? row.reason : undefined);
          return visible;
        }
      }
      const visible = await view(query, after, correction);
      const action = operation === 'review' ? 'reviewed' : 'returned_to_draft';
      await audit(query, params, actor, `result_${correction ? 'correction_' : ''}${action}`, before, visible, correction ? row.reason : undefined);
      return visible;
    });
  }
  return {
    async get(params, correction = false) {
      validatePath(params, correction);
      return db.transaction(async (query) => {
        const { row } = await context(query, params, correction, false);
        const visible = await view(query, row, correction);
        if (!correction) visible.active_correction_id = (await query("SELECT id FROM result_corrections WHERE competition_id=$1 AND event_result_id=$2 AND status IN ('draft','reviewed')", [params.competitionId, row.id])).rows[0]?.id ?? null;
        return visible;
      });
    },
    review: (p, b, a, correction = false) => transition(p, b, a, 'review', correction),
    returnToDraft: (p, b, a, correction = false) => transition(p, b, a, 'return-to-draft', correction),
    publish: (p, b, a, correction = false) => transition(p, b, a, 'publish', correction),
    async startCorrection(params, body, actor) {
      path(params); versionBody(body, true); text(actor, 'Actor');
      return db.transaction(async (query) => {
        const { live } = await context(query, params, false);
        checkVersion(live, body.version); state(live, 'published');
        const base = await latestPublication(query, live);
        if (!base) fail(409, 'Published snapshot is missing');
        const existing = await query("SELECT id FROM result_corrections WHERE competition_id=$1 AND event_result_id=$2 AND status IN ('draft','reviewed')", [params.competitionId, live.id]);
        if (existing.rows.length) fail(409, 'An active correction already exists');
        const source = await winnerEntries(query, live);
        const { rows: [row] } = await query(`INSERT INTO result_corrections(competition_id,event_result_id,event_id,category_id,base_publication_id,reason)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING *, ${resultVersion} AS version`, [params.competitionId, live.id, params.eventId, params.categoryId, base.id, body.reason]);
        await replaceEntries(query, params, row, source, true);
        const visible = await view(query, row, true);
        await audit(query, params, actor, 'result_correction_started', await view(query, live), visible, body.reason);
        return visible;
      });
    },
    async saveCorrection(params, body, actor, shared = false) {
      validatePath(params, true); validateDraftEntries(body, shared); text(actor, 'Actor');
      return db.transaction(async (query) => {
        const { row } = await context(query, params, true);
        checkVersion(row, body.version); state(row, 'draft');
        const { rows: [settings] } = await query('SELECT position_points FROM competition_settings WHERE competition_id=$1 FOR SHARE', [params.competitionId]);
        for (const e of body.entries) if (!Object.hasOwn(settings?.position_points ?? {}, String(e.position))) fail(400, 'Position is not configured for this competition');
        const before = await view(query, row, true);
        if (!shared && before.entries.some((entry) => entry.override_audit_id !== null)) fail(409, 'Correction contains shared positions; use explicit shared-position editing');
        const resolved = [];
        const ordered = [...body.entries].sort((a, b) => a.candidate_code < b.candidate_code ? -1 : a.candidate_code > b.candidate_code ? 1 : 0);
        for (const { position, ...candidate } of ordered) {
          const found = await resolveCandidate(query, { ...candidate, competition_id: params.competitionId, category_id: params.categoryId }, actor);
          resolved.push({ candidate_id: found.id, position });
        }
        const approved = shared ? await authorizeSharedPositions(query, params, row, resolved, before.entries, actor, body.reason, true) : resolved;
        await replaceEntries(query, params, row, approved, true);
        const { rows: [updated] } = await query(`UPDATE result_corrections SET updated_at=clock_timestamp() WHERE competition_id=$1 AND id=$2
          RETURNING *, ${resultVersion} AS version`, [params.competitionId, row.id]);
        const visible = await view(query, updated, true);
        await audit(query, params, actor, 'result_correction_updated', before, visible, row.reason);
        return visible;
      });
    },
  };
}

export function createPublicResultService(db = { transaction }) {
  async function read(params, filters, mode) {
    path(params, mode !== 'list');
    object(filters, mode === 'list' ? ['category_id'] : [], []);
    if (params.categoryId !== undefined && filters.category_id !== undefined) fail(400, 'Category is already specified in the path');
    if (filters.category_id !== undefined) id(filters.category_id, 'Category');
    const scoped = { ...params, categoryId: params.categoryId ?? filters.category_id };
    return db.transaction(async (query) => {
      await parents(query, scoped, mode !== 'list');
      const values = [params.competitionId];
      let where = 'e.competition_id=$1';
      if (scoped.categoryId !== undefined) { values.push(scoped.categoryId); where += ` AND e.category_id=$${values.length}`; }
      if (mode !== 'list') { values.push(params.eventId); where += ` AND e.id=$${values.length}`; }
      // One statement/snapshot selects a complete committed publication, never working entries.
      const rows = (await query(`SELECT p.id AS publication_id,p.snapshot,p.published_at,e.id AS event_id,e.category_id
        FROM events e LEFT JOIN event_results r ON r.event_id=e.id AND r.competition_id=e.competition_id AND r.category_id=e.category_id AND r.status='published'
        LEFT JOIN LATERAL (SELECT id,snapshot,published_at FROM result_publications WHERE competition_id=e.competition_id AND event_result_id=r.id ORDER BY id DESC LIMIT 1) p ON true
        WHERE ${where} ${mode === 'list' ? 'AND p.id IS NOT NULL' : ''}
        ORDER BY e.category_id,e.sort_order,e.id`, values)).rows;
      if (mode === 'status') return { event_id: params.eventId, category_id: params.categoryId, status: rows[0]?.publication_id ? 'published' : 'unpublished' };
      const project = (row) => ({ competition_id: row.snapshot.competition_id, event_id: row.snapshot.event_id,
        category_id: row.snapshot.category_id, event_name: row.snapshot.event_name, category_name: row.snapshot.category_name,
        winners: row.snapshot.winners, publication_id: row.publication_id, published_at: row.published_at });
      if (mode === 'list') return rows.map(project);
      if (!rows[0]?.publication_id) fail(404, 'Published result not found');
      return project(rows[0]);
    });
  }
  return {
    list: (params, filters = {}) => read(params, filters, 'list'),
    get: (params, filters = {}) => read(params, filters, 'get'),
    status: (params, filters = {}) => read(params, filters, 'status'),
  };
}
