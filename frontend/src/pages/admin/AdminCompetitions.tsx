import { useState } from 'react';
import { Link, useLocation, useOutletContext } from 'react-router-dom';
import type { AdminWorkspace } from '../../types/adminWorkspace';
import { CreateCompetitionForm } from '../../components/admin/competitions/CreateCompetitionForm';
import { CompetitionDetails } from '../../components/admin/competitions/CompetitionDetails';

export function AdminCompetitions() {
  const { competition, competitions, upsertCompetition, selectCompetition } = useOutletContext<AdminWorkspace>();
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState('');
  const location = useLocation();
  return <section aria-labelledby="competitions-title">
    <div className="section-heading"><h2 id="competitions-title">Competitions</h2><Link to={{ pathname: '/admin', search: location.search }}>Back to dashboard</Link></div>
    <p>Manage competition details and lifecycle. Select any competition to continue working in its context.</p>
    {!creating && <button type="button" onClick={() => { setCreating(true); setSuccess(''); }}>New competition</button>}
    {creating && <CreateCompetitionForm onCancel={() => setCreating(false)} onCreated={(created) => {
      upsertCompetition(created); setCreating(false); setSuccess('Competition created as a draft.'); selectCompetition(created.id);
    }} />}
    {success && <p role="status" className="admin-success">{success}</p>}
    <ul className="admin-competition-list" aria-label="Competitions">
      {competitions.map((item) => <li key={item.id} className="dashboard-panel">
        <div><h3>{item.name}</h3><p>Code: <bdi>{item.code}</bdi></p><span className={`admin-status status-${item.status}`}>{item.status}</span></div>
        <button type="button" className="button-secondary" aria-pressed={competition?.id === item.id} onClick={() => selectCompetition(item.id)}>{competition?.id === item.id ? 'Selected' : 'Select'}<span className="sr-only"> {item.name}</span></button>
      </li>)}
    </ul>
    {competition && <><CompetitionDetails key={competition.id} id={competition.id} /><Link className="back-link" to={{ pathname: '/admin/settings', search: location.search }}>Configure shared points</Link></>}
  </section>;
}
