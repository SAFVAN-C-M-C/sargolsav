import { transaction } from '../db/index.js';

export class CatalogError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateId(id, label) {
  if (typeof id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    throw new CatalogError(400, `${label} ID must be a positive bigint`);
  }
}

function validateFields(body, create) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !Object.keys(body).length || Object.keys(body).some((key) => !['name', 'sort_order'].includes(key)) ||
      (create && !Object.hasOwn(body, 'name'))) {
    throw new CatalogError(400, 'Invalid request fields');
  }
  if (Object.hasOwn(body, 'name') && (typeof body.name !== 'string' || !body.name.trim() || body.name.includes('\0'))) {
    throw new CatalogError(400, 'Name must be a nonblank string without null characters');
  }
  if (Object.hasOwn(body, 'sort_order') && (!Number.isInteger(body.sort_order) || body.sort_order < 0 || body.sort_order > 2147483647)) {
    throw new CatalogError(400, 'sort_order must be an integer between 0 and 2147483647');
  }
}

export function createCatalogService(db = { transaction }) {
  // Identifiers below come only from these two fixed configurations, never HTTP input.
  function resource(table, label, key, nested) {
    const columns = `id, competition_id, ${nested ? 'category_id, ' : ''}name, sort_order, created_at, updated_at`;
    const scope = `competition_id = $1${nested ? ' AND category_id = $2' : ''}`;
    const idKey = nested ? 'eventId' : 'categoryId';

    function validatePath(params, item) {
      validateId(params.competitionId, 'Competition');
      if (nested || item) validateId(params.categoryId, 'Category');
      if (nested && item) validateId(params.eventId, 'Event');
    }

    async function parents(query, params, write) {
      const lock = write ? 'FOR UPDATE' : 'FOR KEY SHARE';
      const { rows: [competition] } = await query(`SELECT id FROM competitions WHERE id = $1 ${lock}`, [params.competitionId]);
      if (!competition) throw new CatalogError(404, 'Competition not found');
      if (nested) {
        const { rows: [category] } = await query(`SELECT id FROM categories WHERE competition_id = $1 AND id = $2 ${lock}`,
          [params.competitionId, params.categoryId]);
        if (!category) throw new CatalogError(404, 'Category not found');
      }
    }

    const scopeValues = (params) => nested ? [params.competitionId, params.categoryId] : [params.competitionId];

    async function find(query, params, write) {
      const values = [...scopeValues(params), params[idKey]];
      const { rows: [row] } = await query(`SELECT ${columns} FROM ${table}
        WHERE ${scope} AND id = $${values.length}${write ? ' FOR UPDATE' : ''}`, values);
      if (!row) throw new CatalogError(404, `${label} not found`);
      return row;
    }

    async function audit(query, params, actor, action, before, after) {
      await query(`INSERT INTO audit_logs (competition_id, actor_ref, action, reason, details)
        VALUES ($1, $2, $3, $4, $5::jsonb)`, [
        params.competitionId, actor, `${key}_${action}`, 'Admin category and event management',
        JSON.stringify({ [`${key}_id`]: (after ?? before).id,
          ...(nested ? { category_id: params.categoryId } : {}), before, after }),
      ]);
    }

    return {
      async create(params, body, actor) {
        validatePath(params, false);
        validateFields(body, true);
        return db.transaction(async (query) => {
          await parents(query, params, true);
          const values = [...scopeValues(params), body.name, body.sort_order ?? 0];
          const { rows: [row] } = await query(`INSERT INTO ${table} (competition_id, ${nested ? 'category_id, ' : ''}name, sort_order)
            VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING ${columns}`, values);
          await audit(query, params, actor, 'created', null, row);
          return row;
        });
      },

      async list(params) {
        validatePath(params, false);
        return db.transaction(async (query) => {
          await parents(query, params, false);
          return (await query(`SELECT ${columns} FROM ${table} WHERE ${scope} ORDER BY sort_order ASC, id ASC`, scopeValues(params))).rows;
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
        validateFields(body, false);
        return db.transaction(async (query) => {
          await parents(query, params, true);
          const before = await find(query, params, true);
          const values = [...scopeValues(params), params[idKey], body.name ?? before.name, body.sort_order ?? before.sort_order];
          const { rows: [row] } = await query(`UPDATE ${table} SET name = $${values.length - 1}, sort_order = $${values.length}
            WHERE ${scope} AND id = $${values.length - 2} RETURNING ${columns}`, values);
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
          if (nested) {
            // Keep a clear API conflict as well as migration 0005's database FK guard.
            // FOR UPDATE excludes new FK references until checking/deletion finish.
            const { rows } = await query('SELECT 1 FROM event_results WHERE competition_id = $1 AND event_id = $2 LIMIT 1',
              [params.competitionId, params.eventId]);
            if (rows.length) throw new CatalogError(409, 'Event is referenced by dependent records');
          }
          // Remaining dependencies (including event audit rows) have NO ACTION FKs.
          await query(`DELETE FROM ${table} WHERE ${scope} AND id = $${values.length}`, values);
          await audit(query, params, actor, 'deleted', before, null);
        });
      },
    };
  }

  return {
    categories: resource('categories', 'Category', 'category', false),
    events: resource('events', 'Event', 'event', true),
  };
}
