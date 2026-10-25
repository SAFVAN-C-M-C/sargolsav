import { Link, useLocation, useOutletContext } from 'react-router-dom';
import { CompetitionPoints } from '../../components/admin/competitions/CompetitionPoints';
import type { AdminWorkspace } from '../../types/adminWorkspace';

export function AdminSettings() {
  const { competition } = useOutletContext<AdminWorkspace>();
  const location = useLocation();
  return <section aria-labelledby="settings-title"><div className="section-heading"><h2 id="settings-title">Settings</h2><Link to={{ pathname: '/admin', search: location.search }}>Back to dashboard</Link></div>
    {competition ? <><p className="admin-context">Selected competition: <strong>{competition.name}</strong></p><CompetitionPoints key={competition.id} id={competition.id} /></> : <p>Select a competition above to configure its shared points.</p>}
  </section>;
}
