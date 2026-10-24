import { useMemo } from 'react';
import { Link, NavLink, useNavigate, useOutletContext } from 'react-router-dom';
import { PublicApiError, usePublicResource } from './publicApi';
import type { Category, LeaderboardType, PublicApi } from './publicApi';
import { leaderboardPath } from './publicPaths';
import { EmptyState, ErrorState, LoadingCards } from './PublicStates';
import { RankingList } from './RankingList';

function Standings({ competitionId, categoryId, type }: {
  competitionId: string; categoryId?: string; type: LeaderboardType;
}) {
  const api = useOutletContext<PublicApi>();
  const entry = useMemo(() => api.leaderboard(competitionId, categoryId, type), [api, competitionId, categoryId, type]);
  const state = usePublicResource(entry);
  if (state.status === 'loading') return <LoadingCards label="Loading leaderboard" />;
  if (state.status === 'error') return state.error instanceof PublicApiError && [400, 404].includes(state.error.status) ?
    <EmptyState title="Leaderboard unavailable">This competition or category is no longer available. <Link to={leaderboardPath(competitionId)}>View overall rankings</Link>.</EmptyState> :
    <ErrorState retry={entry.retry} />;
  if (!state.data.length) return <EmptyState title={type === 'units' ? 'No units to display' : 'No candidates to display'}>
    {type === 'units' ? 'Units will appear here once they are added to this competition.' : 'Candidates will appear here once they are added to this category.'}
  </EmptyState>;
  return <>{state.data.every((row) => row.winning_entries === '0') &&
    <p className="leaderboard-note">No published wins for these participants yet. Zero-point entries remain in the rankings.</p>}
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
    <div className="section-heading"><div><p className="eyebrow">Competition standings</p>
      <h2 id="leaderboard-title">{category ? `${category.name} · ${type === 'units' ? 'Unit' : 'Candidate'} rankings` : 'Overall unit rankings'}</h2></div></div>
    <p className="public-intro">Points from published results. Equal scores share a rank.</p>
    <div className="leaderboard-controls"><label htmlFor="leaderboard-category">View competition or category</label>
      <select id="leaderboard-category" value={categoryId ?? ''} onChange={(event) => {
        navigate(leaderboardPath(competitionId, event.target.value || undefined, type));
      }}>
        <option value="">Overall units · all categories</option>
        {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {category ? <nav className="ranking-types" aria-label="Ranking type">
        <NavLink to={leaderboardPath(competitionId, categoryId, 'units')}>Units</NavLink>
        <NavLink to={leaderboardPath(competitionId, categoryId, 'candidates')}>Candidates</NavLink>
      </nav> : <p className="leaderboard-note">Choose a category to view its unit and candidate rankings.</p>}
    </div>
    <Standings key={`${competitionId}/${categoryId ?? 'overall'}/${type}`} competitionId={competitionId} categoryId={categoryId} type={type} />
  </section>;
}
