import type { AdminRequest } from './adminDashboardApi';
import type { AuthContextValue } from '../types/auth';
import type { ResultScope, WinnerPayload } from '../types/adminResults';
import type { EventResult, LifecycleAction, PublishedSnapshot, ResultCorrection } from '../types/resultLifecycle';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const nullableId = (value: unknown) => value === null || id(value);
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && !value.includes('\0');
const position = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
function pathId(value: string) { if (!id(value)) throw new Error('Invalid lifecycle ID'); return value; }
const path = (scope: ResultScope) => `/api/admin/competitions/${pathId(scope.competitionId)}/categories/${pathId(scope.categoryId)}/events/${pathId(scope.eventId)}/result`;
function parse(value: unknown, scope: ResultScope, correctionId?: string): EventResult | ResultCorrection {
  const key = correctionId === undefined ? 'result' : 'correction';
  if (!record(value) || !record(value[key])) throw new Error('Invalid lifecycle response');
  const row = value[key];
  if (!id(row.id) || row.competition_id !== scope.competitionId || row.category_id !== scope.categoryId || row.event_id !== scope.eventId || !text(row.version) ||
    typeof row.updated_at !== 'string' || !nullableText(row.reviewed_by) || !nullableText(row.reviewed_at) || !Array.isArray(row.entries) ||
    !row.entries.every((entry) => record(entry) && id(entry.id) && id(entry.candidate_id) && text(entry.candidate_code) && text(entry.name) &&
      id(entry.unit_id) && nullableId(entry.madrasa_id) && text(entry.unit_name) && nullableText(entry.madrasa_name) && position(entry.position) && nullableId(entry.override_audit_id))) throw new Error('Invalid lifecycle response');
  if (correctionId !== undefined) {
    if (row.id !== correctionId || !['draft', 'reviewed', 'applied'].includes(String(row.status)) || !id(row.event_result_id) || !id(row.base_publication_id) ||
      !text(row.reason) || !nullableText(row.applied_by) || !nullableText(row.applied_at)) throw new Error('Invalid correction response');
    return row as unknown as ResultCorrection;
  }
  if (!['draft', 'reviewed', 'published'].includes(String(row.status)) || !nullableText(row.published_by) || !nullableText(row.published_at) ||
    (row.active_correction_id !== undefined && !nullableId(row.active_correction_id))) throw new Error('Invalid result response');
  return { ...row, active_correction_id: row.active_correction_id ?? null } as unknown as EventResult;
}
export const resultLifecycleApi = {
  async get(request: AdminRequest, scope: ResultScope, signal: AbortSignal) {
    const value = await request(path(scope), signal);
    if (!record(value) || !record(value.result) || !('active_correction_id' in value.result)) throw new Error('Invalid result response');
    return parse(value, scope) as EventResult;
  },
  async transition(request: AdminRequest, scope: ResultScope, action: LifecycleAction, version: string, signal: AbortSignal) {
    const result = parse(await request(`${path(scope)}/${action}`, signal, { method: 'POST', body: { version } }), scope) as EventResult;
    if (result.status !== (action === 'review' ? 'reviewed' : action === 'publish' ? 'published' : 'draft')) throw new Error('Unexpected lifecycle transition');
    return result;
  },
  async startCorrection(request: AdminRequest, scope: ResultScope, version: string, reason: string, signal: AbortSignal) {
    const value = await request(`${path(scope)}/corrections`, signal, { method: 'POST', body: { version, reason } });
    if (!record(value) || !record(value.correction) || !id(value.correction.id)) throw new Error('Invalid correction response');
    const correction = parse(value, scope, value.correction.id) as ResultCorrection;
    if (correction.status !== 'draft') throw new Error('Unexpected correction state');
    return correction;
  },
  async correction(request: AdminRequest, scope: ResultScope, correctionId: string, signal: AbortSignal) {
    return parse(await request(`${path(scope)}/corrections/${pathId(correctionId)}`, signal), scope, correctionId) as ResultCorrection;
  },
  async saveCorrection(request: AdminRequest, scope: ResultScope, correctionId: string, version: string, entries: WinnerPayload[], signal: AbortSignal) {
    const correction = parse(await request(`${path(scope)}/corrections/${pathId(correctionId)}`, signal, { method: 'PUT', body: { version, entries } }), scope, correctionId) as ResultCorrection;
    if (correction.status !== 'draft') throw new Error('Unexpected correction state');
    return correction;
  },
  async correctionTransition(request: AdminRequest, scope: ResultScope, correctionId: string, action: LifecycleAction, version: string, signal: AbortSignal) {
    const correction = parse(await request(`${path(scope)}/corrections/${pathId(correctionId)}/${action}`, signal, { method: 'POST', body: { version } }), scope, correctionId) as ResultCorrection;
    if (correction.status !== (action === 'review' ? 'reviewed' : action === 'publish' ? 'applied' : 'draft')) throw new Error('Unexpected correction transition');
    return correction;
  },
  async saveSharedCorrection(request: AdminRequest, scope: ResultScope, correctionId: string, version: string, entries: WinnerPayload[], reason: string, signal: AbortSignal) {
    const correction = parse(await request(`${path(scope)}/corrections/${pathId(correctionId)}/shared-positions`, signal, { method: 'PUT', body: { version, shared_positions: true, reason, entries } }), scope, correctionId) as ResultCorrection;
    if (correction.status !== 'draft') throw new Error('Unexpected correction state');
    return correction;
  },
  async published(read: AuthContextValue['readPublished'], scope: ResultScope, signal: AbortSignal): Promise<PublishedSnapshot> {
    const value = await read(path(scope).replace('/api/admin/', '/api/'), signal);
    if (!record(value) || !record(value.result)) throw new Error('Invalid published projection');
    const row = value.result;
    const affiliation = (item: unknown) => record(item) && id(item.id) && text(item.name);
    if (row.competition_id !== scope.competitionId || row.category_id !== scope.categoryId || row.event_id !== scope.eventId || !id(row.publication_id) ||
      !text(row.event_name) || !text(row.category_name) || typeof row.published_at !== 'string' || !Array.isArray(row.winners) ||
      !row.winners.every((winner) => record(winner) && text(winner.candidate_code) && text(winner.name) && position(winner.position) && affiliation(winner.unit) && (winner.madrasa === null || affiliation(winner.madrasa)))) throw new Error('Invalid published projection');
    return row as unknown as PublishedSnapshot;
  },
};
