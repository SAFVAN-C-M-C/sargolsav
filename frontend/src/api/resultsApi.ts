import type { AdminRequest } from './adminDashboardApi';
import { AdminApiError } from './adminErrors';
import type { Candidate, DraftRead, ResultDraft, ResultScope, ResultStatus, WinnerPayload } from '../types/adminResults';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const nullableId = (value: unknown) => value === null || id(value);
const position = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && !value.includes('\0');
function pathId(value: string) { if (!id(value)) throw new Error('Invalid results ID'); return value; }
const base = (competitionId: string) => `/api/admin/competitions/${pathId(competitionId)}`;
const draftPath = (scope: ResultScope) => `${base(scope.competitionId)}/categories/${pathId(scope.categoryId)}/events/${pathId(scope.eventId)}/result-draft`;
function draft(value: unknown, scope: ResultScope): ResultDraft {
  if (!record(value) || !record(value.draft)) throw new Error('Invalid draft response');
  const row = value.draft;
  if (!id(row.id) || row.competition_id !== scope.competitionId || row.category_id !== scope.categoryId || row.event_id !== scope.eventId ||
    row.status !== 'draft' || !text(row.version) || typeof row.updated_at !== 'string' || !Array.isArray(row.entries) ||
    !row.entries.every((entry) => record(entry) && id(entry.id) && id(entry.candidate_id) && text(entry.candidate_code) && text(entry.name) &&
      id(entry.unit_id) && nullableId(entry.madrasa_id) && position(entry.position) && nullableId(entry.override_audit_id))) throw new Error('Invalid draft response');
  return row as unknown as ResultDraft;
}
export function configuredPositions(points: Record<string, number>): string[] {
  const keys = Object.keys(points);
  if (!keys.every((key) => /^[1-9][0-9]{0,9}$/.test(key) && Number(key) <= 2147483647)) throw new Error('Invalid configured positions');
  return keys.sort((a, b) => Number(a) - Number(b));
}
export const resultsApi = {
  async statuses(request: AdminRequest, competitionId: string, signal: AbortSignal): Promise<ResultStatus[]> {
    const value = await request(`${base(competitionId)}/result-statuses`, signal);
    if (!record(value) || !Array.isArray(value.results) || !value.results.every((row) => record(row) && id(row.event_id) && id(row.category_id) && text(row.event_name) &&
      ['not_started', 'draft', 'reviewed', 'published'].includes(String(row.status)) &&
      (row.status === 'not_started' ? row.event_result_id === null : id(row.event_result_id)) && (row.updated_at === null || typeof row.updated_at === 'string'))) throw new Error('Invalid result status response');
    return value.results as ResultStatus[];
  },
  async lookup(request: AdminRequest, competitionId: string, code: string, signal: AbortSignal): Promise<Candidate | null> {
    if (!text(code)) throw new AdminApiError(400, 'External candidate ID is required.');
    try {
      const value = await request(`${base(competitionId)}/candidates/lookup?candidate_code=${encodeURIComponent(code)}`, signal);
      if (!record(value) || !record(value.candidate)) throw new Error('Invalid candidate response');
      const row = value.candidate;
      if (!id(row.id) || row.competition_id !== competitionId || !id(row.category_id) || row.candidate_code !== code || !text(row.name) || !id(row.unit_id) || !nullableId(row.madrasa_id)) throw new Error('Invalid candidate response');
      return row as unknown as Candidate;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 404 && error.message === 'Candidate not found') return null;
      throw error;
    }
  },
  async read(request: AdminRequest, scope: ResultScope, signal: AbortSignal): Promise<DraftRead> {
    try { return { kind: 'draft', draft: draft(await request(draftPath(scope), signal), scope) }; }
    catch (error) {
      if (error instanceof AdminApiError && error.status === 404 && error.message === 'Result draft not found') return { kind: 'absent' };
      if (error instanceof AdminApiError && error.status === 409) return { kind: 'locked', message: error.message };
      throw error;
    }
  },
  async initialize(request: AdminRequest, scope: ResultScope, signal: AbortSignal) {
    return draft(await request(draftPath(scope), signal, { method: 'POST', body: {} }), scope);
  },
  async save(request: AdminRequest, scope: ResultScope, version: string, entries: WinnerPayload[], signal: AbortSignal) {
    return draft(await request(draftPath(scope), signal, { method: 'PUT', body: { version, entries } }), scope);
  },
  async saveShared(request: AdminRequest, scope: ResultScope, version: string, entries: WinnerPayload[], reason: string, signal: AbortSignal) {
    return draft(await request(`${draftPath(scope)}/shared-positions`, signal, { method: 'PUT', body: { version, shared_positions: true, reason, entries } }), scope);
  },
};
