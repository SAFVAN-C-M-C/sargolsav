import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/common/PublicStates';
import { PublicNavigation } from '../../components/public/navigation/PublicNavigation';

export function NotFound() {
  return <><h1>Page not found</h1><PublicNavigation /><EmptyState title="Let’s get you back"><Link to="/">Browse available competitions</Link></EmptyState></>;
}
