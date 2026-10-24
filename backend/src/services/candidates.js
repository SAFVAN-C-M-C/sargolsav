import { transaction } from '../db/index.js';

export class CandidateError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const columns = 'id, competition_id, candidate_code, name, unit_id, madrasa_id, category_id, created_at, updated_at';
function id(value, label) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new CandidateError(400, `${label} ID must be a positive bigint`);
  }
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new CandidateError(400, `${label} must be a nonblank string without null characters`);
  }
}
function fields(body, create) {
  const allowed = create ? ['candidate_code', 'name', 'unit_id', 'madrasa_id', 'category_id'] : ['name'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length ||
      Object.keys(body).some((key) => !allowed.includes(key))) throw new CandidateError(400, 'Invalid request fields');
  text(body.name, 'Name');
  if (create) {
    text(body.candidate_code, 'Candidate code');
    id(body.unit_id, 'Unit');
    id(body.category_id, 'Category');
    if (body.madrasa_id !== undefined && body.madrasa_id !== null) id(body.madrasa_id, 'Madrassa');
  }
}
async function competition(query, competitionId) {
  const { rows } = await query('SELECT id FROM competitions WHERE id = $1 FOR KEY SHARE', [competitionId]);
  if (!rows.length) throw new CandidateError(404, 'Competition not found');
}
async function parents(query, competitionId, body) {
  await competition(query, competitionId);
  for (const [table, value, label] of [['units', body.unit_id, 'Unit'], ['categories', body.category_id, 'Category']]) {
    const { rows } = await query(`SELECT id FROM ${table} WHERE competition_id = $1 AND id = $2 FOR KEY SHARE`, [competitionId, value]);
    if (!rows.length) throw new CandidateError(400, `${label} does not belong to this competition`);
  }
  if (body.madrasa_id != null) {
    const { rows } = await query(`SELECT id FROM madrasas WHERE competition_id = $1 AND unit_id = $2 AND id = $3 FOR KEY SHARE`,
      [competitionId, body.unit_id, body.madrasa_id]);
    if (!rows.length) throw new CandidateError(400, 'Madrassa does not belong to this unit and competition');
  }
}
async function audit(query, actor, action, before, after) {
  await query(`INSERT INTO audit_logs (competition_id, actor_ref, action, reason, details)
    VALUES ($1, $2, $3, $4, $5::jsonb)`, [after.competition_id, actor, action, 'Admin candidate management',
    JSON.stringify({ candidate_id: after.id, before, after })]);
}
async function insert(query, competitionId, body) {
  return (await query(`INSERT INTO candidates (competition_id, candidate_code, name, unit_id, madrasa_id, category_id)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (competition_id, candidate_code) DO NOTHING RETURNING ${columns}`,
  [competitionId, body.candidate_code, body.name, body.unit_id, body.madrasa_id ?? null, body.category_id])).rows[0];
}

// query MUST be the query function supplied by db.transaction. No commit or separate connection here.
// The caller supplies the verified actor and must propagate failures to roll back its entire transaction.
export async function resolveCandidate(query, input, actor) {
  const { competition_id: competitionId, ...body } = input ?? {};
  id(competitionId, 'Competition');
  fields(body, true);
  text(actor, 'Actor');
  await parents(query, competitionId, body);
  const created = await insert(query, competitionId, body);
  if (created) {
    await audit(query, actor, 'candidate_created', null, created);
    return created;
  }
  // Separate statement sees a concurrent winner after ON CONFLICT waited for its commit.
  const { rows: [existing] } = await query(`SELECT ${columns} FROM candidates
    WHERE competition_id = $1 AND candidate_code = $2 FOR UPDATE`, [competitionId, body.candidate_code]);
  if (!existing || existing.name !== body.name || existing.unit_id !== body.unit_id ||
      existing.category_id !== body.category_id || existing.madrasa_id !== (body.madrasa_id ?? null)) {
    throw new CandidateError(409, 'Candidate code conflicts with existing identity or affiliation');
  }
  return existing;
}

export function createCandidateService(db = { transaction }) {
  return {
    async create(params, body, actor) {
      id(params.competitionId, 'Competition'); fields(body, true); text(actor, 'Actor');
      return db.transaction(async (query) => {
        await parents(query, params.competitionId, body);
        const row = await insert(query, params.competitionId, body);
        if (!row) throw new CandidateError(409, 'Candidate code already exists in this competition');
        await audit(query, actor, 'candidate_created', null, row);
        return row;
      });
    },
    async list(params, filters = {}) {
      id(params.competitionId, 'Competition');
      if (Object.keys(filters).some((key) => !['category_id', 'unit_id'].includes(key))) throw new CandidateError(400, 'Invalid query fields');
      for (const key of Object.keys(filters)) id(filters[key], key);
      return db.transaction(async (query) => {
        await competition(query, params.competitionId);
        const values = [params.competitionId];
        const conditions = ['competition_id = $1'];
        for (const key of ['category_id', 'unit_id']) {
          if (filters[key] !== undefined) { values.push(filters[key]); conditions.push(`${key} = $${values.length}`); }
        }
        return (await query(`SELECT ${columns} FROM candidates WHERE ${conditions.join(' AND ')} ORDER BY id DESC`, values)).rows;
      });
    },
    async get(params) {
      id(params.competitionId, 'Competition'); id(params.candidateId, 'Candidate');
      return db.transaction(async (query) => {
        await competition(query, params.competitionId);
        const { rows: [row] } = await query(`SELECT ${columns} FROM candidates WHERE competition_id = $1 AND id = $2`, [params.competitionId, params.candidateId]);
        if (!row) throw new CandidateError(404, 'Candidate not found');
        return row;
      });
    },
    async lookup(params, filters) {
      id(params.competitionId, 'Competition');
      if (!filters || Object.keys(filters).length !== 1 || !Object.hasOwn(filters, 'candidate_code')) throw new CandidateError(400, 'Only candidate_code is required and allowed');
      text(filters.candidate_code, 'Candidate code');
      return db.transaction(async (query) => {
        await competition(query, params.competitionId);
        const { rows: [row] } = await query(`SELECT ${columns} FROM candidates WHERE competition_id = $1 AND candidate_code = $2`, [params.competitionId, filters.candidate_code]);
        if (!row) throw new CandidateError(404, 'Candidate not found');
        return row;
      });
    },
    async update(params, body, actor) {
      id(params.competitionId, 'Competition'); id(params.candidateId, 'Candidate'); fields(body, false); text(actor, 'Actor');
      return db.transaction(async (query) => {
        await competition(query, params.competitionId);
        const { rows: [before] } = await query(`SELECT ${columns} FROM candidates WHERE competition_id = $1 AND id = $2 FOR UPDATE`, [params.competitionId, params.candidateId]);
        if (!before) throw new CandidateError(404, 'Candidate not found');
        const { rows: [after] } = await query(`UPDATE candidates SET name = $3 WHERE competition_id = $1 AND id = $2 RETURNING ${columns}`, [params.competitionId, params.candidateId, body.name]);
        await audit(query, actor, 'candidate_updated', before, after);
        return after;
      });
    },
  };
}
