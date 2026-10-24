import { useEffect, useSyncExternalStore } from 'react';

export interface Competition { id: string; name: string }
export interface Category { id: string; name: string; sort_order: number }
export interface Catalog { competition: Competition; categories: Category[] }
export interface PublicEvent extends Category { status: 'published' | 'unpublished' }
export interface EventCatalog { category: Competition; events: PublicEvent[] }
export interface Winner {
  position: number;
  candidate_code?: string | null;
  name?: string | null;
  unit?: { name?: string | null } | null;
  madrasa?: { name?: string | null } | null;
}
export interface PublishedResult {
  competition_id: string; category_id: string; event_id: string;
  event_name: string; category_name: string;
  publication_id: string; published_at: string; winners: Winner[];
}
export class PublicApiError extends Error {
  constructor(public readonly status: number) { super('Public data unavailable'); }
}
type Snapshot<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

function resource<T>(read: () => Promise<T>) {
  let snapshot: Snapshot<T> = { status: 'loading' };
  let pending = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const load = () => {
    if (pending || snapshot.status === 'ready') return;
    pending = true;
    read().then((data) => { snapshot = { status: 'ready', data }; },
      (error: unknown) => { snapshot = { status: 'error', error }; })
      .finally(() => { pending = false; emit(); });
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    load,
    retry: () => { snapshot = { status: 'loading' }; emit(); load(); },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCompetition = (value: unknown): value is Competition => isRecord(value) &&
  typeof value.id === 'string' && /^[1-9][0-9]*$/.test(value.id) && typeof value.name === 'string';
const isCategory = (value: unknown): value is Category => isCompetition(value) && isRecord(value) &&
  Number.isInteger(value.sort_order) && Number(value.sort_order) >= 0;
const optionalText = (value: unknown) => value === undefined || value === null || typeof value === 'string';
const optionalEntity = (value: unknown) => value === undefined || value === null || (isRecord(value) && optionalText(value.name));
const isWinner = (value: unknown): value is Winner => isRecord(value) && Number.isInteger(value.position) &&
  Number(value.position) > 0 && Number(value.position) <= 2147483647 && optionalText(value.candidate_code) &&
  optionalText(value.name) && optionalEntity(value.unit) && optionalEntity(value.madrasa);

// The cache belongs to the mounted public shell, never to authentication or a global singleton.
// Each URL owns its response, so late requests cannot replace another competition's data.
export function createPublicApi(fetcher: typeof fetch) {
  async function get<T>(url: string, validate: (value: unknown) => value is T, fresh = false): Promise<T> {
    const response = await fetcher(url, { headers: { Accept: 'application/json' }, ...(fresh ? { cache: 'no-store' as const } : {}) });
    if (!response.ok) throw new PublicApiError(response.status);
    const value: unknown = await response.json();
    if (!validate(value)) throw new Error('Invalid public response');
    return value;
  }
  const competitions = resource(async () => (await get('/api/competitions',
    (value): value is { competitions: Competition[] } => isRecord(value) &&
      Array.isArray(value.competitions) && value.competitions.every(isCompetition))).competitions);
  const catalogs = new Map<string, ReturnType<typeof resource<Catalog>>>();
  // Event screens retain data only while mounted. Share in-flight reads, not old winners.
  const pending = new Map<string, Promise<unknown>>();
  function freshGet<T>(url: string, validate: (value: unknown) => value is T): Promise<T> {
    const existing = pending.get(url);
    if (existing) return existing as Promise<T>;
    const request = get(url, validate, true).finally(() => { pending.delete(url); });
    pending.set(url, request);
    return request;
  }
  return {
    competitions,
    catalog(id: string) {
      let entry = catalogs.get(id);
      if (!entry) {
        entry = resource(() => get(`/api/competitions/${encodeURIComponent(id)}/categories`,
          (value): value is Catalog => isRecord(value) && isCompetition(value.competition) &&
            value.competition.id === id && Array.isArray(value.categories) && value.categories.every(isCategory)));
        catalogs.set(id, entry);
      }
      return entry;
    },
    events(competitionId: string, categoryId: string) {
      const base = `/api/competitions/${encodeURIComponent(competitionId)}/categories/${encodeURIComponent(categoryId)}`;
      return resource(() => freshGet(`${base}/events`, (value): value is EventCatalog =>
        isRecord(value) && isCompetition(value.category) && value.category.id === categoryId &&
        Array.isArray(value.events) && value.events.every((event) => isCategory(event) && isRecord(event) &&
          (event.status === 'published' || event.status === 'unpublished'))));
    },
    eventResult(competitionId: string, categoryId: string, eventId: string) {
      const base = `/api/competitions/${encodeURIComponent(competitionId)}/categories/${encodeURIComponent(categoryId)}/events/${encodeURIComponent(eventId)}/result`;
      const read = async () => (await freshGet(base, (value): value is { result: PublishedResult } => {
        if (!isRecord(value) || !isRecord(value.result)) return false;
        const result = value.result;
        return result.competition_id === competitionId && result.category_id === categoryId && result.event_id === eventId &&
          typeof result.event_name === 'string' && typeof result.category_name === 'string' &&
          typeof result.publication_id === 'string' && typeof result.published_at === 'string' &&
          Array.isArray(result.winners) && result.winners.every(isWinner);
      })).result;
      return resource<PublishedResult | null>(async () => {
        try { return await read(); }
        catch (error) {
          if (!(error instanceof PublicApiError) || error.status !== 404) throw error;
          // A result 404 can mean unpublished or nonexistent. The availability API distinguishes them.
          const { availability } = await freshGet(`${base}/status`, (value): value is { availability: { status: 'published' | 'unpublished' } } =>
            isRecord(value) && isRecord(value.availability) && value.availability.event_id === eventId &&
            value.availability.category_id === categoryId && (value.availability.status === 'published' || value.availability.status === 'unpublished'));
          // Publication may have committed between the two reads. Fetch that new publication once.
          return availability.status === 'unpublished' ? null : read();
        }
      });
    },
  };
}
export type PublicApi = ReturnType<typeof createPublicApi>;

export function usePublicResource<T>(entry: ReturnType<typeof resource<T>>) {
  const snapshot = useSyncExternalStore(entry.subscribe, entry.getSnapshot);
  useEffect(() => { entry.load(); }, [entry]);
  return snapshot;
}
