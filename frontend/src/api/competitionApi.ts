import type { AdminCompetition, AdminRequest } from './adminDashboardApi';

export type Points = Record<string, number>;
export interface PointRow { key: string; position: string; points: string }
export const lifecycleActions: Record<AdminCompetition['status'], Array<'active' | 'archived'>> = {
  draft: ['active', 'archived'], active: ['archived'], archived: ['active'],
};

export function validateCompetition(name: string, code: string): string | undefined {
  if (![name, code].every((value) => value.trim() && !value.includes('\0'))) return 'Name and code must be nonblank and must not contain null characters.';
}

export function pointsFromRows(rows: PointRow[]): Points {
  const points: Points = {};
  for (const row of rows) {
    if (!/^[1-9][0-9]{0,9}$/.test(row.position) || Number(row.position) > 2147483647) {
      throw new Error('Positions must be positive whole numbers from 1 to 2147483647, without leading zeros.');
    }
    if (Object.hasOwn(points, row.position)) throw new Error('Each position must be unique.');
    if (!/^[0-9]+$/.test(row.points) || !Number.isSafeInteger(Number(row.points))) {
      throw new Error('Points must be non-negative whole numbers up to 9007199254740991.');
    }
    points[row.position] = Number(row.points);
  }
  return points;
}

function competition(value: unknown, id?: string): AdminCompetition {
  if (!value || typeof value !== 'object' || !('competition' in value)) throw new Error('Invalid competition response');
  const row = value.competition;
  if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string' ||
    !/^[1-9][0-9]*$/.test(row.id) || (id !== undefined && row.id !== id) ||
    !('name' in row) || typeof row.name !== 'string' || !('code' in row) || typeof row.code !== 'string' ||
    !('status' in row) || !['draft', 'active', 'archived'].includes(String(row.status))) throw new Error('Invalid competition response');
  return row as AdminCompetition;
}

function settings(value: unknown, id: string): Points {
  if (!value || typeof value !== 'object' || !('settings' in value)) throw new Error('Invalid settings response');
  if (value.settings === null) return {};
  const row = value.settings;
  if (!row || typeof row !== 'object' || !('competition_id' in row) || row.competition_id !== id ||
    !('position_points' in row) || !row.position_points || typeof row.position_points !== 'object' || Array.isArray(row.position_points)) throw new Error('Invalid settings response');
  // Legacy numeric settings can exceed today's validation rules: display them for repair,
  // but require the entire replacement to satisfy the current contract before saving.
  if (!Object.values(row.position_points).every((point) => typeof point === 'number' && Number.isFinite(point))) throw new Error('Invalid settings response');
  return row.position_points as Points;
}

const base = '/api/admin/competitions';
export const competitionApi = {
  async get(request: AdminRequest, id: string, signal: AbortSignal) {
    return competition(await request(`${base}/${encodeURIComponent(id)}`, signal), id);
  },
  async create(request: AdminRequest, name: string, code: string, signal: AbortSignal) {
    return competition(await request(base, signal, { method: 'POST', body: { name, code } }));
  },
  async edit(request: AdminRequest, id: string, body: { name?: string; code?: string }, signal: AbortSignal) {
    return competition(await request(`${base}/${encodeURIComponent(id)}`, signal, { method: 'PATCH', body }), id);
  },
  async status(request: AdminRequest, id: string, status: 'active' | 'archived', signal: AbortSignal) {
    return competition(await request(`${base}/${encodeURIComponent(id)}/status`, signal, { method: 'PATCH', body: { status } }), id);
  },
  async settings(request: AdminRequest, id: string, signal: AbortSignal) {
    return settings(await request(`${base}/${encodeURIComponent(id)}/settings`, signal), id);
  },
  async saveSettings(request: AdminRequest, id: string, position_points: Points, signal: AbortSignal) {
    const value = await request(`${base}/${encodeURIComponent(id)}/settings`, signal, { method: 'PUT', body: { position_points } });
    if (value && typeof value === 'object' && 'settings' in value && value.settings === null) throw new Error('Invalid saved settings response');
    return settings(value, id);
  },
};
