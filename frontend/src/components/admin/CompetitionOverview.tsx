import { AdminStatusSpan, DashboardPanelCompetitionSummaryDiv, DashboardPanelDiv, EyebrowP, OverviewMetricsDl } from '../../styles/components';
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
    <DashboardPanelCompetitionSummaryDiv>
      <EyebrowP variant="summary">Competition overview</EyebrowP>
      <h2 id="overview-title">{competition.name}</h2>
      <AdminStatusSpan status={competition.status}>{competition.status}</AdminStatusSpan>
      <p>Competition code: <bdi>{competition.code}</bdi></p>
    </DashboardPanelCompetitionSummaryDiv>
    {state.status === 'loading' && <DashboardLoading>Loading competition overview…</DashboardLoading>}
    {state.status === 'error' && <DashboardError retry={retry}>The overview is unavailable. Check your connection and try again.</DashboardError>}
    {state.status === 'ready' && <OverviewMetricsDl>
      {([['units', 'Units'], ['madrasas', 'Madrassas'], ['categories', 'Categories'], ['events', 'Events']] as const).map(([key, label]) =>
        <DashboardPanelDiv key={key}><dt>{label}</dt><dd>{state.data[key]}</dd></DashboardPanelDiv>)}
    </OverviewMetricsDl>}
  </section>;
}
