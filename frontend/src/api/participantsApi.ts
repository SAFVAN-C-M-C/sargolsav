import type { AdminRequest } from './adminDashboardApi';
import type { AdminMadrassa, AdminUnit } from '../types/adminParticipants';
import { AdminApiError } from './adminErrors';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
function pathId(value: string): string {
  if (!id(value)) throw new Error('Invalid participant ID');
  return value;
}
export function participantNameError(name: string): string | undefined {
  if (!name.trim() || name.includes('\0')) return 'Name is required and must not contain null characters.';
}

// Validate every returned parent, including lists; never render a response from another scope.
function entity(value: unknown, competitionId: string, unitId?: string): AdminUnit | AdminMadrassa {
  if (!record(value) || !id(value.id) || value.competition_id !== competitionId || typeof value.name !== 'string' ||
    (unitId !== undefined && value.unit_id !== unitId)) throw new Error('Invalid participant response');
  return value as unknown as AdminUnit | AdminMadrassa;
}
function detail(value: unknown, kind: 'unit' | 'madrasa', competitionId: string, unitId?: string, expectedId?: string) {
  if (!record(value)) throw new Error('Invalid participant response');
  const row = entity(value[kind], competitionId, unitId);
  if (expectedId !== undefined && row.id !== expectedId) throw new Error('Invalid participant response');
  return row;
}
function list(value: unknown, key: 'units' | 'madrasas', competitionId: string, unitId?: string) {
  if (!record(value) || !Array.isArray(value[key])) throw new Error('Invalid participant response');
  return value[key].map((row) => entity(row, competitionId, unitId));
}

function scopedApi(request: AdminRequest, competitionId: string, unitId?: string) {
  const base = `/api/admin/competitions/${pathId(competitionId)}/units${unitId === undefined ? '' : `/${pathId(unitId)}/madrasas`}`;
  const kind = unitId === undefined ? 'unit' : 'madrasa';
  return {
    async list(signal: AbortSignal) { return list(await request(base, signal), kind === 'unit' ? 'units' : 'madrasas', competitionId, unitId); },
    async get(entityId: string, signal: AbortSignal) { return detail(await request(`${base}/${pathId(entityId)}`, signal), kind, competitionId, unitId, entityId); },
    async save(name: string, signal: AbortSignal, entityId?: string) {
      const error = participantNameError(name);
      if (error) throw new AdminApiError(400, error);
      return detail(await request(`${base}${entityId === undefined ? '' : `/${pathId(entityId)}`}`, signal,
        { method: entityId === undefined ? 'POST' : 'PATCH', body: { name } }), kind, competitionId, unitId, entityId);
    },
    async remove(entityId: string, signal: AbortSignal) {
      try {
        await request(`${base}/${pathId(entityId)}`, signal, { method: 'DELETE' });
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 409) {
          throw new AdminApiError(409, kind === 'unit' ?
            'This unit cannot be deleted while it has Madrassas or is referenced by candidates or results. No related records were removed.' :
            'This Madrassa cannot be deleted while it is referenced by candidates or results. No related records were removed.');
        }
        throw error;
      }
    },
  };
}

export const unitsApi = (request: AdminRequest, competitionId: string) => scopedApi(request, competitionId);
export const madrassasApi = (request: AdminRequest, competitionId: string, unitId: string) => scopedApi(request, competitionId, unitId);
