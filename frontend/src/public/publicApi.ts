import { createPublicResource as resource } from './publicResource';
import { PublicApiError, PublicPayloadError } from './publicErrors';
export { PublicApiError } from './publicErrors';
export { usePublicResource, usePollingResource } from './publicResource';

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
export type LeaderboardType = 'units' | 'candidates';
export interface UnitRanking {
  unit_id: string; unit_name: string; total_points: string; rank: string;
  winning_entries: string; position_wins: Record<string, string>;
}
export interface CandidateRanking extends UnitRanking {
  candidate_id: string; candidate_name: string; candidate_code: string;
  madrasa_id?: string | null; madrasa_name?: string | null;
}
export type Ranking = UnitRanking | CandidateRanking;
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
const positiveInteger = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
const unsignedInteger = (value: unknown): value is string => value === '0' || positiveInteger(value);
function isRanking(value: unknown, type: LeaderboardType): value is Ranking {
  if (!isRecord(value) || !positiveInteger(value.unit_id) || typeof value.unit_name !== 'string' ||
      !unsignedInteger(value.total_points) || !positiveInteger(value.rank) || !unsignedInteger(value.winning_entries) ||
      !isRecord(value.position_wins) || !Object.entries(value.position_wins).every(([position, count]) =>
        positiveInteger(position) && unsignedInteger(count))) return false;
  return type === 'units' || (positiveInteger(value.candidate_id) && typeof value.candidate_name === 'string' &&
    typeof value.candidate_code === 'string' && optionalText(value.madrasa_id) && optionalText(value.madrasa_name));
}

// The cache belongs to the mounted public shell, never to authentication or a global singleton.
// Each URL owns its response, so late requests cannot replace another competition's data.
export function createPublicApi(fetcher: typeof fetch) {
  async function get<T>(url: string, validate: (value: unknown) => value is T, fresh = false): Promise<T> {
    const response = await fetcher(url, { headers: { Accept: 'application/json' }, ...(fresh ? { cache: 'no-store' as const } : {}) });
    if (!response.ok) throw new PublicApiError(response.status);
    const value: unknown = await response.json();
    if (!validate(value)) throw new PublicPayloadError();
    return value;
  }
  const competitions = resource(async () => (await get('/api/competitions',
    (value): value is { competitions: Competition[] } => isRecord(value) &&
      Array.isArray(value.competitions) && value.competitions.every(isCompetition))).competitions);
  const catalogs = new Map<string, ReturnType<typeof resource<Catalog>>>();
  // Share in-flight reads, never old winners/standings across screen visits.
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
    leaderboard(competitionId: string, categoryId: string | undefined, type: LeaderboardType) {
      const base = `/api/competitions/${encodeURIComponent(competitionId)}`;
      const scope = categoryId === undefined ? '' : `/categories/${encodeURIComponent(categoryId)}`;
      return resource<Ranking[]>(async () => {
        if (type === 'candidates' && categoryId === undefined) throw new PublicApiError(400);
        return (await freshGet(`${base}${scope}/leaderboard/${type}`, (value): value is { leaderboard: Ranking[] } =>
          isRecord(value) && Array.isArray(value.leaderboard) && value.leaderboard.every((row) => isRanking(row, type)))).leaderboard;
      });
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
      let awaiting = false;
      const availability = async () => (await freshGet(`${base}/status`, (value): value is { availability: { status: 'published' | 'unpublished' } } =>
        isRecord(value) && isRecord(value.availability) && value.availability.event_id === eventId &&
        value.availability.category_id === categoryId && (value.availability.status === 'published' || value.availability.status === 'unpublished'))).availability;
      return resource<PublishedResult | null>(async () => {
        if (awaiting) {
          if ((await availability()).status === 'unpublished') return null;
          awaiting = false;
        }
        try { return await read(); }
        catch (error) {
          if (!(error instanceof PublicApiError) || error.status !== 404) throw error;
          // A result 404 can mean unpublished or nonexistent. The availability API distinguishes them.
          const state = await availability();
          // Publication may have committed between the two reads. Fetch that new publication once.
          awaiting = state.status === 'unpublished';
          return awaiting ? null : read();
        }
      });
    },
  };
}
export type PublicApi = ReturnType<typeof createPublicApi>;
