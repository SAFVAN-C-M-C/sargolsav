import { Navigate, useOutletContext } from 'react-router-dom';
import { usePublicResource } from '../../hooks/publicResource';
import type { PublicApi } from '../../types/publicApi';
import { resultsPath } from '../../utils/publicPaths';
import { EmptyState, ErrorState, LoadingCards } from '../../components/common/PublicStates';
import { PublicNavigation } from '../../components/public/navigation/PublicNavigation';

export function PublicHome({ leaderboards = false }: { leaderboards?: boolean }) {
  const api = useOutletContext<PublicApi>();
  const state = usePublicResource(api.competitions);
  if (state.status === 'ready' && state.data.length) {
    return <Navigate replace to={leaderboards ? `/competitions/${state.data[0].id}/leaderboards` : resultsPath(state.data[0].id)} />;
  }
  return <><p className="eyebrow">Welcome to Sargolsav</p><h1>A celebration of talent</h1>
    <p className="public-intro">Explore our cultural competition, one category at a time.</p><PublicNavigation />
    {state.status === 'loading' ? <LoadingCards /> : state.status === 'error' ? <ErrorState retry={api.competitions.retry} /> :
      <EmptyState title="No active competition">Our next competition will appear here when it is ready. Please check back later.</EmptyState>}</>;
}
