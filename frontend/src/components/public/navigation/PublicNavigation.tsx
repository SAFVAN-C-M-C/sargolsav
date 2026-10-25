import { PublicTabsNav } from '../../../styles/components';
import { NavLink } from 'react-router-dom';

export function PublicNavigation({ competitionId }: { competitionId?: string }) {
  const base = competitionId ? `/competitions/${encodeURIComponent(competitionId)}` : '';
  return <PublicTabsNav aria-label="Public navigation">
    <NavLink to={base ? `${base}/results` : '/'} end={!base}><span aria-hidden="true">▤</span> Results</NavLink>
    <NavLink to={`${base}/leaderboards`}><span aria-hidden="true">▥</span> Leaderboards</NavLink>
  </PublicTabsNav>;
}
