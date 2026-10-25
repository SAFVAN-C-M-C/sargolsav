export interface AdminCompetition {
  id: string;
  name: string;
  code: string;
  status: 'draft' | 'active' | 'archived';
}

export interface CompetitionOverview {
  units: number;
  madrasas: number;
  categories: number;
  events: number;
}

export type AdminRequest = import('../types/auth').AuthContextValue['request'];
type Entity = { id: string; name: string };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const entity = (value: unknown): value is Entity => record(value) && typeof value.id === 'string' &&
  /^[1-9][0-9]*$/.test(value.id) && typeof value.name === 'string';

function list(value: unknown, key: string): Entity[] {
  if (!record(value) || !Array.isArray(value[key]) || !value[key].every(entity)) throw new Error('Invalid admin response');
  return value[key];
}

export async function loadCompetitions(request: AdminRequest, signal: AbortSignal): Promise<AdminCompetition[]> {
  const rows = list(await request('/api/admin/competitions', signal), 'competitions');
  if (!rows.every((row) => 'code' in row && typeof row.code === 'string' && 'status' in row &&
    ['draft', 'active', 'archived'].includes(String(row.status)))) throw new Error('Invalid competition response');
  return rows as AdminCompetition[];
}

// Bound nested-list concurrency; no summary endpoint or scoring aggregation is needed.
async function countChildren(parents: Entity[], read: (parent: Entity) => Promise<Entity[]>, signal: AbortSignal) {
  let next = 0;
  let total = 0;
  await Promise.all(Array.from({ length: Math.min(4, parents.length) }, async () => {
    while (next < parents.length) {
      signal.throwIfAborted();
      const parent = parents[next++];
      const children = await read(parent);
      total += children.length;
    }
  }));
  return total;
}

export async function loadOverview(request: AdminRequest, id: string, signal: AbortSignal): Promise<CompetitionOverview> {
  const base = `/api/admin/competitions/${encodeURIComponent(id)}`;
  const [units, categories] = await Promise.all([
    request(`${base}/units`, signal).then((value) => list(value, 'units')),
    request(`${base}/categories`, signal).then((value) => list(value, 'categories')),
  ]);
  const [madrasas, events] = await Promise.all([
    countChildren(units, async (unit) => list(await request(`${base}/units/${encodeURIComponent(unit.id)}/madrasas`, signal), 'madrasas'), signal),
    countChildren(categories, async (category) => list(await request(`${base}/categories/${encodeURIComponent(category.id)}/events`, signal), 'events'), signal),
  ]);
  return { units: units.length, categories: categories.length, madrasas, events };
}
