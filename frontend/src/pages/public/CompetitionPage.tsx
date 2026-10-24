import { useEffect } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { PublicApiError } from '../../api/publicErrors';
import { usePublicResource } from '../../hooks/publicResource';
import type { LeaderboardType } from '../../types/public';
import type { PublicApi } from '../../types/publicApi';
import { categoryPath, leaderboardPath, resultsPath } from '../../utils/publicPaths';
import { EmptyState, ErrorState, LoadingCards } from '../../components/common/PublicStates';
import { PublicNavigation } from '../../components/public/navigation/PublicNavigation';
import { CompetitionPicker } from '../../components/public/navigation/CompetitionPicker';
import { CategoryBrowser } from '../../components/public/results/CategoryBrowser';
import { Leaderboards } from '../../components/public/leaderboards/Leaderboards';

export function CompetitionPage({ leaderboards = false, rankingType = 'units' }: { leaderboards?: boolean; rankingType?: LeaderboardType }) {
  const { competitionId = '', categoryId, eventId } = useParams();
  const api = useOutletContext<PublicApi>();
  const entry = api.catalog(competitionId);
  const state = usePublicResource(entry);
  const category = state.status === 'ready' ? state.data.categories.find((item) => item.id === categoryId) : undefined;
  useEffect(() => {
    document.title = state.status === 'ready' ? `${leaderboards ? `${category?.name ?? 'Overall'} · ${rankingType === 'units' ? 'Unit' : 'Candidate'} rankings` : category?.name ?? 'Results'} · ${state.data.competition.name} · Sargolsav` : 'Sargolsav';
  }, [state, category, leaderboards, eventId, rankingType]);
  return <>
    <Link className="public-back" to={leaderboards && categoryId ? leaderboardPath(competitionId) : eventId && categoryId ? categoryPath(competitionId, categoryId) : categoryId ? resultsPath(competitionId) : '/'}>← {leaderboards && categoryId ? 'Overall rankings' : eventId ? 'All events' : categoryId ? 'All categories' : 'Home'}</Link>
    <p className="eyebrow">Zonal Madrassa Cultural Competition</p>
    <h1>{state.status === 'ready' ? state.data.competition.name : 'Competition'}</h1>
    <CompetitionPicker id={competitionId} leaderboards={leaderboards} />
    <PublicNavigation competitionId={competitionId} />
    {state.status === 'loading' ? <LoadingCards /> : state.status === 'error' ?
      state.error instanceof PublicApiError && [400, 404].includes(state.error.status) ?
        <EmptyState title="Competition unavailable">This competition may no longer be active. <Link to="/">Browse available competitions</Link>.</EmptyState> : <ErrorState retry={entry.retry} /> :
      leaderboards ? <Leaderboards competitionId={competitionId} categories={state.data.categories} categoryId={categoryId} type={rankingType} /> :
        <CategoryBrowser competitionId={competitionId} categories={state.data.categories} categoryId={categoryId} eventId={eventId} />}
  </>;
}
