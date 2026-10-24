import { Link, useOutletContext } from 'react-router-dom';
import { usePublicResource } from '../../../hooks/publicResource';
import type { PublicApi } from '../../../types/publicApi';
import { resultsPath } from '../../../utils/publicPaths';

export function CompetitionPicker({ id, leaderboards }: { id: string; leaderboards: boolean }) {
  const api = useOutletContext<PublicApi>();
  const state = usePublicResource(api.competitions);
  if (state.status === 'loading') return <p role="status">Loading competitions…</p>;
  if (state.status === 'error') return <div className="picker-error" role="alert">Competition list unavailable. <button className="button-secondary" onClick={api.competitions.retry}>Retry competitions</button></div>;
  if (state.data.length < 2) return null;
  return <nav className="competition-picker" aria-label="Choose competition">{state.data.map((competition) =>
    <Link key={competition.id} aria-current={competition.id === id ? 'true' : undefined}
      to={leaderboards ? `/competitions/${competition.id}/leaderboards` : resultsPath(competition.id)}>{competition.name}</Link>)}</nav>;
}
