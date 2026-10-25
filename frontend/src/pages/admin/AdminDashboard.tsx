import { useOutletContext } from 'react-router-dom';
import type { AdminCompetition } from '../../api/adminDashboardApi';
import { CompetitionOverview } from '../../components/admin/CompetitionOverview';

export function AdminDashboard() {
  const { competition } = useOutletContext<{ competition?: AdminCompetition }>();
  return <><h2>Dashboard</h2>{competition && <CompetitionOverview competition={competition} />}</>;
}
