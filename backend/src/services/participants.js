import { transaction } from '../db/index.js';

export class ParticipantError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateId(id, label) {
  if (typeof id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    throw new ParticipantError(400, `${label} ID must be a positive bigint`);
  }
}

function validateName(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')) {
    throw new ParticipantError(400, 'Only name is required and allowed');
  }
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.includes('\0')) {
    throw new ParticipantError(400, 'Name must be a nonblank string without null characters');
  }
}

export function createParticipantService(db = { transaction }) {
  // Identifiers below come only from these two fixed configurations, never HTTP input.
  function resource(table, label, key, nested) {
    const columns = `id, competition_id, ${nested ? 'unit_id, ' : ''}name, created_at, updated_at`;
    const scope = `competition_id = $1${nested ? ' AND unit_id = $2' : ''}`;
    const idKey = nested ? 'madrasaId' : 'unitId';

    function validatePath(params, item) {
      validateId(params.competitionId, 'Competition');
      if (nested || item) validateId(params.unitId, 'Unit');
      if (nested && item) validateId(params.madrasaId, 'Madrassa');
    }

    async function parents(query, params, write) {
      const lock = write ? 'FOR UPDATE' : 'FOR KEY SHARE';
      const { rows: [competition] } = await query(`SELECT id FROM competitions WHERE id = $1 ${lock}`, [params.competitionId]);
      if (!competition) throw new ParticipantError(404, 'Competition not found');
      if (nested) {
        const { rows: [unit] } = await query(`SELECT id FROM units WHERE competition_id = $1 AND id = $2 ${lock}`,
          [params.competitionId, params.unitId]);
        if (!unit) throw new ParticipantError(404, 'Unit not found');
      }
    }

    const scopeValues = (params) => nested ? [params.competitionId, params.unitId] : [params.competitionId];

    async function find(query, params, write) {
      const values = [...scopeValues(params), params[idKey]];
      const { rows: [row] } = await query(`SELECT ${columns} FROM ${table}
        WHERE ${scope} AND id = $${values.length}${write ? ' FOR UPDATE' : ''}`, values);
      if (!row) throw new ParticipantError(404, `${label} not found`);
      return row;
    }

    async function audit(query, params, actor, action, before, after) {
      await query(`INSERT INTO audit_logs (competition_id, actor_ref, action, reason, details)
        VALUES ($1, $2, $3, $4, $5::jsonb)`, [
        params.competitionId, actor, `${key}_${action}`, 'Admin unit and Madrassa management',
        JSON.stringify({ [`${key}_id`]: (after ?? before).id,
          ...(nested ? { unit_id: params.unitId } : {}), before, after }),
      ]);
    }

    return {
      async create(params, body, actor) {
        validatePath(params, false);
        validateName(body);
        return db.transaction(async (query) => {
          await parents(query, params, true);
          const values = [...scopeValues(params), body.name];
          const { rows: [row] } = await query(`INSERT INTO ${table} (competition_id, ${nested ? 'unit_id, ' : ''}name)
            VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING ${columns}`, values);
          await audit(query, params, actor, 'created', null, row);
          return row;
        });
      },

      async list(params) {
        validatePath(params, false);
        return db.transaction(async (query) => {
          await parents(query, params, false);
          return (await query(`SELECT ${columns} FROM ${table} WHERE ${scope} ORDER BY id DESC`, scopeValues(params))).rows;
        });
      },

      async get(params) {
        validatePath(params, true);
        return db.transaction(async (query) => {
          await parents(query, params, false);
          return find(query, params, false);
        });
      },

      async update(params, body, actor) {
        validatePath(params, true);
        validateName(body);
        return db.transaction(async (query) => {
          await parents(query, params, true);
          const before = await find(query, params, true);
          const values = [...scopeValues(params), params[idKey], body.name];
          const { rows: [row] } = await query(`UPDATE ${table} SET name = $${values.length}
            WHERE ${scope} AND id = $${values.length - 1} RETURNING ${columns}`, values);
          await audit(query, params, actor, 'updated', before, row);
          return row;
        });
      },

      async remove(params, actor) {
        validatePath(params, true);
        return db.transaction(async (query) => {
          await parents(query, params, true);
          const before = await find(query, params, true);
          const values = [...scopeValues(params), params[idKey]];
          // Existing NO ACTION FKs reject referenced records, including concurrent references.
          await query(`DELETE FROM ${table} WHERE ${scope} AND id = $${values.length}`, values);
          await audit(query, params, actor, 'deleted', before, null);
        });
      },
    };
  }

  return {
    units: resource('units', 'Unit', 'unit', false),
    madrasas: resource('madrasas', 'Madrassa', 'madrasa', true),
  };
}
