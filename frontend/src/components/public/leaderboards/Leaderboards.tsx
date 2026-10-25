import { EyebrowP, LeaderboardControlsDiv, LeaderboardNoteP, PublicIntroP, RankingTypesNav, SectionHeadingDiv } from '../../../styles/components';
import { useMemo } from 'react';
import { Link, NavLink, useNavigate, useOutletContext } from 'react-router-dom';
import { PublicApiError } from '../../../api/publicErrors';
import { usePollingResource } from '../../../hooks/publicResource';
import type { Category, LeaderboardType } from '../../../types/public';
import type { PublicApi } from '../../../types/publicApi';
import { leaderboardPath } from '../../../utils/publicPaths';
import { EmptyState, ErrorState, LoadingCards } from '../../common/PublicStates';
import { RankingList } from './RankingList';
import { RefreshStatus } from '../../common/RefreshStatus';
import { PublicChoiceField } from '../navigation/PublicChoiceField';

function Standings({ competitionId, categoryId, type }: {
  competitionId: string; categoryId?: string; type: LeaderboardType;
}) {
  const api = useOutletContext<PublicApi>();
  const entry = useMemo(() => api.leaderboard(competitionId, categoryId, type), [api, competitionId, categoryId, type]);
  const state = usePollingResource(entry);
  if (state.status === 'loading') return <LoadingCards label="Loading leaderboard" />;
  if (state.status === 'error') return state.error instanceof PublicApiError && [400, 404].includes(state.error.status) ?
    <EmptyState title="Leaderboard unavailable">This competition or category is no longer available. <Link to={leaderboardPath(competitionId)}>View overall rankings</Link>.</EmptyState> :
    <ErrorState retry={entry.retry} />;
  if (!state.data.length) return <><RefreshStatus state={state} retry={entry.retry} /><EmptyState title={type === 'units' ? 'No units to display' : 'No candidates to display'}>
    {type === 'units' ? 'Units will appear here once they are added to this competition.' : 'Candidates will appear here once they are added to this category.'}
  </EmptyState></>;
  return <><RefreshStatus state={state} retry={entry.retry} />{state.data.every((row) => row.winning_entries === '0') &&
    <LeaderboardNoteP>No published wins for these participants yet. Zero-point entries remain in the rankings.</LeaderboardNoteP>}
    <RankingList rows={state.data} candidates={type === 'candidates'} />
  </>;
}

export function Leaderboards({ competitionId, categories, categoryId, type }: {
  competitionId: string; categories: Category[]; categoryId?: string; type: LeaderboardType;
}) {
  const navigate = useNavigate();
  const category = categories.find((item) => item.id === categoryId);
  if (categoryId !== undefined && !category) return <EmptyState title="Category not found">
    This category is not available in this competition. <Link to={leaderboardPath(competitionId)}>View overall rankings</Link>.
  </EmptyState>;
  return <section aria-labelledby="leaderboard-title">
    <SectionHeadingDiv><div><EyebrowP variant="publicHeading">Competition standings</EyebrowP>
      <h2 id="leaderboard-title">{category ? `${category.name} · ${type === 'units' ? 'Unit' : 'Candidate'} rankings` : 'Overall unit rankings'}</h2></div></SectionHeadingDiv>
    <PublicIntroP>Points from published results. Equal scores share a rank.</PublicIntroP>
    <LeaderboardControlsDiv>
      <PublicChoiceField label="View competition or category" value={categoryId ?? ''}
        options={[{ value: '', label: 'Overall units · all categories', description: 'The whole competition, together' }, ...categories.map((item) => ({ value: item.id, label: item.name }))]}
        onChange={(value) => navigate(leaderboardPath(competitionId, value || undefined, type))} />
      {category ? <RankingTypesNav aria-label="Ranking type">
        <NavLink to={leaderboardPath(competitionId, categoryId, 'units')}>Units</NavLink>
        <NavLink to={leaderboardPath(competitionId, categoryId, 'candidates')}>Candidates</NavLink>
      </RankingTypesNav> : <LeaderboardNoteP>Choose a category to view its unit and candidate rankings.</LeaderboardNoteP>}
    </LeaderboardControlsDiv>
    <Standings key={`${competitionId}/${categoryId ?? 'overall'}/${type}`} competitionId={competitionId} categoryId={categoryId} type={type} />
  </section>;
}
