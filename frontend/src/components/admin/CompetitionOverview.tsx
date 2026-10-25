import { useCallback } from 'react';
import { loadOverview, type AdminCompetition } from '../../api/adminDashboardApi';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useAdminResource } from '../../hooks/useAdminResource';
import { DashboardError, DashboardLoading } from './DashboardStates';

export function CompetitionOverview({ competition }: { competition: AdminCompetition }) {
  const { request } = useAdminAuth();
  const load = useCallback((signal: AbortSignal) => loadOverview(request, competition.id, signal), [request, competition.id]);
  const { state, retry } = useAdminResource(load);
  return <section aria-labelledby="overview-title">
    <div className="dashboard-panel competition-summary">
      <p className="eyebrow">Competition overview</p>
      <h2 id="overview-title">{competition.name}</h2>
      <span className={`admin-status status-${competition.status}`}>{competition.status}</span>
      <p>Competition code: <bdi>{competition.code}</bdi></p>
    </div>
    {state.status === 'loading' && <DashboardLoading>Loading competition overview…</DashboardLoading>}
    {state.status === 'error' && <DashboardError retry={retry}>The overview is unavailable. Check your connection and try again.</DashboardError>}
    {state.status === 'ready' && <dl className="overview-metrics">
      {([['units', 'Units'], ['madrasas', 'Madrassas'], ['categories', 'Categories'], ['events', 'Events']] as const).map(([key, label]) =>
        <div className="dashboard-panel" key={key}><dt>{label}</dt><dd>{state.data[key]}</dd></div>)}
    </dl>}
  </section>;
}
