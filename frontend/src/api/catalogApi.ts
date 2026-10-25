import type { AdminRequest } from './adminDashboardApi';
import type { AdminCategory, AdminEvent, CatalogChanges } from '../types/adminCatalog';
import { AdminApiError } from './adminErrors';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const order = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647;
function pathId(value: string): string {
  if (!id(value)) throw new Error('Invalid catalog ID');
  return value;
}
export function catalogNameError(name: string): string | undefined {
  if (!name.trim() || name.includes('\0')) return 'Name is required and must not contain null characters.';
}
export function catalogOrderError(value: string): string | undefined {
  if (!/^[0-9]+$/.test(value) || !order(Number(value))) return 'Display order must be a whole number from 0 to 2147483647.';
}

function entity(value: unknown, competitionId: string, categoryId?: string): AdminCategory | AdminEvent {
  if (!record(value) || !id(value.id) || value.competition_id !== competitionId || typeof value.name !== 'string' || !order(value.sort_order) ||
    (categoryId !== undefined && value.category_id !== categoryId)) throw new Error('Invalid catalog response');
  return value as unknown as AdminCategory | AdminEvent;
}
function detail(value: unknown, kind: 'category' | 'event', competitionId: string, categoryId?: string, expectedId?: string) {
  if (!record(value)) throw new Error('Invalid catalog response');
  const row = entity(value[kind], competitionId, categoryId);
  if (expectedId !== undefined && row.id !== expectedId) throw new Error('Invalid catalog response');
  return row;
}

function scopedApi(request: AdminRequest, competitionId: string, categoryId?: string) {
  const base = `/api/admin/competitions/${pathId(competitionId)}/categories${categoryId === undefined ? '' : `/${pathId(categoryId)}/events`}`;
  const kind = categoryId === undefined ? 'category' : 'event';
  return {
    async list(signal: AbortSignal) {
      const value = await request(base, signal);
      const key = kind === 'category' ? 'categories' : 'events';
      if (!record(value) || !Array.isArray(value[key])) throw new Error('Invalid catalog response');
      // Preserve the backend's sort_order ASC, id ASC order; bigint IDs stay strings.
      return value[key].map((row) => entity(row, competitionId, categoryId));
    },
    async get(entityId: string, signal: AbortSignal) { return detail(await request(`${base}/${pathId(entityId)}`, signal), kind, competitionId, categoryId, entityId); },
    async save(body: CatalogChanges, signal: AbortSignal, entityId?: string) {
      if ((entityId === undefined && body.name === undefined) || !Object.keys(body).length ||
        Object.keys(body).some((key) => key !== 'name' && key !== 'sort_order')) throw new AdminApiError(400, 'Invalid catalog fields.');
      const nameError = body.name === undefined ? undefined : catalogNameError(body.name);
      if (nameError) throw new AdminApiError(400, nameError);
      if (body.sort_order !== undefined && !order(body.sort_order)) throw new AdminApiError(400, 'Display order must be a whole number from 0 to 2147483647.');
      return detail(await request(`${base}${entityId === undefined ? '' : `/${pathId(entityId)}`}`, signal,
        { method: entityId === undefined ? 'POST' : 'PATCH', body }), kind, competitionId, categoryId, entityId);
    },
    async remove(entityId: string, signal: AbortSignal) {
      try { await request(`${base}/${pathId(entityId)}`, signal, { method: 'DELETE' }); }
      catch (error) {
        if (error instanceof AdminApiError && error.status === 409) throw new AdminApiError(409, kind === 'category' ?
          'This category cannot be deleted while it has events or is referenced by candidates. No related records were removed.' :
          'This event cannot be deleted while it has any result set, including an empty draft, or dependent audit records. No related records were removed.');
        throw error;
      }
    },
  };
}
export const categoriesApi = (request: AdminRequest, competitionId: string) => scopedApi(request, competitionId);
export const eventsApi = (request: AdminRequest, competitionId: string, categoryId: string) => scopedApi(request, competitionId, categoryId);
