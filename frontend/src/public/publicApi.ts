import { useEffect, useSyncExternalStore } from 'react';

export interface Competition { id: string; name: string }
export interface Category { id: string; name: string; sort_order: number }
export interface Catalog { competition: Competition; categories: Category[] }
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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isCompetition = (value: unknown): value is Competition => isRecord(value) &&
  typeof value.id === 'string' && /^[1-9][0-9]*$/.test(value.id) && typeof value.name === 'string';
const isCategory = (value: unknown): value is Category => isCompetition(value) && isRecord(value) &&
  Number.isInteger(value.sort_order) && Number(value.sort_order) >= 0;

// The cache belongs to the mounted public shell, never to authentication or a global singleton.
// Each URL owns its response, so late requests cannot replace another competition's data.
export function createPublicApi(fetcher: typeof fetch) {
  async function get<T>(url: string, validate: (value: unknown) => value is T): Promise<T> {
    const response = await fetcher(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new PublicApiError(response.status);
    const value: unknown = await response.json();
    if (!validate(value)) throw new Error('Invalid public response');
    return value;
  }
  const competitions = resource(async () => (await get('/api/competitions',
    (value): value is { competitions: Competition[] } => isRecord(value) &&
      Array.isArray(value.competitions) && value.competitions.every(isCompetition))).competitions);
  const catalogs = new Map<string, ReturnType<typeof resource<Catalog>>>();
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
  };
}
export type PublicApi = ReturnType<typeof createPublicApi>;

export function usePublicResource<T>(entry: ReturnType<typeof resource<T>>) {
  const snapshot = useSyncExternalStore(entry.subscribe, entry.getSnapshot);
  useEffect(() => { entry.load(); }, [entry]);
  return snapshot;
}
