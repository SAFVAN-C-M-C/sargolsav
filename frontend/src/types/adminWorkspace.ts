import type { AdminCompetition } from '../api/adminDashboardApi';

export interface AdminWorkspace {
  competition?: AdminCompetition;
  competitions: AdminCompetition[];
  upsertCompetition: (competition: AdminCompetition) => void;
  selectCompetition: (id: string) => void;
  setDirty: (key: string, dirty: boolean) => void;
}
