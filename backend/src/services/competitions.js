import { runQuery, transaction } from '../db/index.js';

// Only explicitly constructed application errors may expose their messages.
export class CompetitionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const invalid = (message) => { throw new CompetitionError(400, message); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function bodyFields(body, allowed, required = []) {
  if (!isObject(body) || !Object.keys(body).length ||
      Object.keys(body).some((key) => !allowed.includes(key)) ||
      required.some((key) => !Object.hasOwn(body, key))) {
    invalid('Invalid request fields');
  }
}

function textFields(body) {
  for (const value of Object.values(body)) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
      invalid('Code and name must be nonblank strings without null characters');
    }
  }
}

function competitionId(id) {
  if (typeof id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    invalid('Competition ID must be a positive bigint');
  }
  return id;
}

export function validatePoints(points) {
  if (!isObject(points)) invalid('position_points must be an object');
  for (const [position, value] of Object.entries(points)) {
    if (!/^[1-9][0-9]{0,9}$/.test(position) || Number(position) > 2147483647) {
      invalid('Position keys must be canonical positive integers up to 2147483647');
    }
    if (!Number.isSafeInteger(value) || value < 0) {
      invalid('Points must be non-negative safe whole numbers');
    }
  }
}

const transitions = {
  draft: ['active', 'archived'],
  active: ['archived'],
  archived: ['active'],
};

export function createCompetitionService(db = { runQuery, transaction }) {
  async function find(query, id, lock = false) {
    const { rows: [competition] } = await query(
      `SELECT id, code, name, status, created_at, updated_at FROM competitions WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!competition) throw new CompetitionError(404, 'Competition not found');
    return competition;
  }

  async function audit(query, id, actor, action, details) {
    await query(`INSERT INTO audit_logs (competition_id, actor_ref, action, reason, details)
      VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [id, actor, action, 'Admin competition management', JSON.stringify(details)]);
  }

  return {
    async create(body, actor) {
      bodyFields(body, ['code', 'name'], ['code', 'name']);
      textFields(body);
      return db.transaction(async (query) => {
        const { rows: [competition] } = await query(`INSERT INTO competitions (code, name)
          VALUES ($1, $2) RETURNING id, code, name, status, created_at, updated_at`, [body.code, body.name]);
        await query('INSERT INTO competition_settings (competition_id) VALUES ($1)', [competition.id]);
        await audit(query, competition.id, actor, 'competition_created', { code: body.code, name: body.name });
        return competition;
      });
    },

    async list() {
      return (await db.runQuery('SELECT id, code, name, status, created_at, updated_at FROM competitions ORDER BY id DESC')).rows;
    },

    async get(id) {
      return find(db.runQuery, competitionId(id));
    },

    async update(id, body, actor) {
      competitionId(id);
      bodyFields(body, ['code', 'name']);
      textFields(body);
      return db.transaction(async (query) => {
        const previous = await find(query, id, true);
        const { rows: [competition] } = await query(`UPDATE competitions SET code = $2, name = $3
          WHERE id = $1 RETURNING id, code, name, status, created_at, updated_at`,
        [id, body.code ?? previous.code, body.name ?? previous.name]);
        await audit(query, id, actor, 'competition_updated', {
          before: { code: previous.code, name: previous.name }, after: { code: competition.code, name: competition.name },
        });
        return competition;
      });
    },

    async updateStatus(id, body, actor) {
      competitionId(id);
      bodyFields(body, ['status'], ['status']);
      if (typeof body.status !== 'string' || !Object.hasOwn(transitions, body.status)) invalid('Invalid competition status');
      return db.transaction(async (query) => {
        const previous = await find(query, id, true);
        // Retrying the same status is an idempotent no-op.
        if (previous.status === body.status) return previous;
        if (!transitions[previous.status].includes(body.status)) {
          throw new CompetitionError(409, 'Invalid competition status transition');
        }
        const { rows: [competition] } = await query(`UPDATE competitions SET status = $2
          WHERE id = $1 RETURNING id, code, name, status, created_at, updated_at`, [id, body.status]);
        await audit(query, id, actor, 'competition_status_updated', { before: previous.status, after: body.status });
        return competition;
      });
    },

    async getSettings(id) {
      competitionId(id);
      // A single snapshot distinguishes legacy unconfigured settings from a missing competition.
      const { rows: [row] } = await db.runQuery(`SELECT c.id, s.competition_id, s.position_points, s.created_at, s.updated_at
        FROM competitions c LEFT JOIN competition_settings s ON s.competition_id = c.id WHERE c.id = $1`, [id]);
      if (!row) throw new CompetitionError(404, 'Competition not found');
      if (row.competition_id === null) return null;
      return {
        competition_id: row.competition_id, position_points: row.position_points,
        created_at: row.created_at, updated_at: row.updated_at,
      };
    },

    async updateSettings(id, body, actor) {
      competitionId(id);
      bodyFields(body, ['position_points'], ['position_points']);
      validatePoints(body.position_points);
      return db.transaction(async (query) => {
        // Parent first: this also serializes concurrent first-time settings writes.
        await find(query, id, true);
        const { rows: [previous] } = await query('SELECT position_points FROM competition_settings WHERE competition_id = $1', [id]);
        const { rows: [settings] } = await query(`INSERT INTO competition_settings (competition_id, position_points)
          VALUES ($1, $2::jsonb) ON CONFLICT (competition_id) DO UPDATE SET position_points = EXCLUDED.position_points
          RETURNING competition_id, position_points, created_at, updated_at`, [id, JSON.stringify(body.position_points)]);
        await audit(query, id, actor, 'competition_settings_updated', {
          before: previous?.position_points ?? null, after: body.position_points,
        });
        return settings;
      });
    },
  };
}
