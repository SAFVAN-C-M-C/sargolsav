export interface ResultStatus {
  event_id: string; category_id: string; event_name: string;
  event_result_id: string | null; status: 'not_started' | 'draft' | 'reviewed' | 'published'; updated_at: string | null;
}
export interface Candidate {
  id: string; competition_id: string; category_id: string; candidate_code: string;
  name: string; unit_id: string; madrasa_id: string | null;
}
export interface DraftEntry {
  id: string; candidate_id: string; candidate_code: string; name: string;
  unit_id: string; madrasa_id: string | null; position: number; override_audit_id: string | null;
}
export interface ResultDraft {
  id: string; competition_id: string; category_id: string; event_id: string;
  status: 'draft'; version: string; updated_at: string; entries: DraftEntry[];
}
export interface WinnerPayload {
  candidate_code: string; name: string; unit_id: string; madrasa_id: string | null; position: number;
}
export interface ResultScope { competitionId: string; categoryId: string; eventId: string }
export type DraftRead = { kind: 'draft'; draft: ResultDraft } | { kind: 'absent' } | { kind: 'locked'; message: string };
export interface WinnerRow {
  key: string; candidate_code: string; name: string; unit_id: string; madrasa_id: string; position: string;
  resolution: 'unchecked' | 'new' | 'existing' | 'saved' | 'conflict';
}
