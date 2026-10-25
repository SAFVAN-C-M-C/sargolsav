import { PublicTabsNav } from '../../../styles/components';
import { NavLink } from 'react-router-dom';
import { PublicIcon } from './PublicIcon';

export function PublicNavigation({ competitionId }: { competitionId?: string }) {
  const base = competitionId ? `/competitions/${encodeURIComponent(competitionId)}` : '';
  return <PublicTabsNav aria-label="Public navigation">
    <NavLink to={base ? `${base}/results` : '/'} end={!base}><PublicIcon name="results" /> Results</NavLink>
    <NavLink to={`${base}/leaderboards`}><PublicIcon name="standings" /> Leaderboards</NavLink>
  </PublicTabsNav>;
}
