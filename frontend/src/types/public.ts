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
