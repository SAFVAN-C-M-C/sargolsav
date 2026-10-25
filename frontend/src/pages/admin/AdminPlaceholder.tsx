import { DashboardPanelSection, EyebrowP } from '../../styles/components';
import { useOutletContext } from 'react-router-dom';
import type { AdminCompetition } from '../../api/adminDashboardApi';

export function AdminPlaceholder({ title }: { title: string }) {
  const { competition } = useOutletContext<{ competition?: AdminCompetition }>();
  return <DashboardPanelSection><EyebrowP>Coming later</EyebrowP><h2>{title}</h2>
    {competition && <p>Selected competition: <strong>{competition.name}</strong></p>}
    <p>This management screen is not available yet. Use Dashboard for the read-only competition overview.</p>
  </DashboardPanelSection>;
}
