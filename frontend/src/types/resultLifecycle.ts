import type { DraftEntry } from './adminResults';

export interface LifecycleEntry extends DraftEntry { unit_name: string; madrasa_name: string | null }
interface LifecycleBase {
  id: string; competition_id: string; category_id: string; event_id: string;
  version: string; updated_at: string; entries: LifecycleEntry[];
  reviewed_by: string | null; reviewed_at: string | null;
}
export interface EventResult extends LifecycleBase {
  status: 'draft' | 'reviewed' | 'published'; published_by: string | null; published_at: string | null;
  active_correction_id: string | null;
}
export interface ResultCorrection extends LifecycleBase {
  status: 'draft' | 'reviewed' | 'applied'; event_result_id: string; base_publication_id: string;
  reason: string; applied_by: string | null; applied_at: string | null;
}
export type ReviewRecord = EventResult | ResultCorrection;
export interface PublishedWinner {
  position: number; candidate_code: string; name: string;
  unit: { id: string; name: string }; madrasa: { id: string; name: string } | null;
}
export interface PublishedSnapshot {
  competition_id: string; category_id: string; event_id: string; event_name: string; category_name: string;
  publication_id: string; published_at: string; winners: PublishedWinner[];
}
export type LifecycleAction = 'review' | 'return-to-draft' | 'publish';
