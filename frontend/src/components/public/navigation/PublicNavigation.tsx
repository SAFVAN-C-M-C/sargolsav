import { NavLink } from 'react-router-dom';

export function PublicNavigation({ competitionId }: { competitionId?: string }) {
  const base = competitionId ? `/competitions/${encodeURIComponent(competitionId)}` : '';
  return <nav className="public-tabs" aria-label="Public navigation">
    <NavLink to={base ? `${base}/results` : '/'} end={!base}><span aria-hidden="true">▤</span> Results</NavLink>
    <NavLink to={`${base}/leaderboards`}><span aria-hidden="true">▥</span> Leaderboards</NavLink>
  </nav>;
}
