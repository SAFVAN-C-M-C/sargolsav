import { useOutletContext } from 'react-router-dom';
import type { AdminCompetition } from '../../api/adminDashboardApi';

export function AdminPlaceholder({ title }: { title: string }) {
  const { competition } = useOutletContext<{ competition?: AdminCompetition }>();
  return <section className="dashboard-panel"><p className="eyebrow">Coming later</p><h2>{title}</h2>
    {competition && <p className="admin-context">Selected competition: <strong>{competition.name}</strong></p>}
    <p>This management screen is not available yet. Use Dashboard for the read-only competition overview.</p>
  </section>;
}
