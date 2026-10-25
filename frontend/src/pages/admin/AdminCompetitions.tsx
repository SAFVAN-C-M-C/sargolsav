import { AdminCompetitionListUl, AdminStatusSpan, AdminSuccessP, BackLinkLink, AppButton, ButtonSecondaryButton, DashboardPanelLi, SectionHeadingDiv, SrOnlySpan } from '../../styles/components';
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
    <SectionHeadingDiv><h2 id="competitions-title">Competitions</h2><Link to={{ pathname: '/admin', search: location.search }}>Back to dashboard</Link></SectionHeadingDiv>
    <p>Manage competition details and lifecycle. Select any competition to continue working in its context.</p>
    {!creating && <AppButton type="button" onClick={() => { setCreating(true); setSuccess(''); }}>New competition</AppButton>}
    {creating && <CreateCompetitionForm onCancel={() => setCreating(false)} onCreated={(created) => {
      upsertCompetition(created); setCreating(false); setSuccess('Competition created as a draft.'); selectCompetition(created.id);
    }} />}
    {success && <AdminSuccessP role="status">{success}</AdminSuccessP>}
    <AdminCompetitionListUl aria-label="Competitions">
      {competitions.map((item) => <DashboardPanelLi key={item.id}>
        <div><h3>{item.name}</h3><p>Code: <bdi>{item.code}</bdi></p><AdminStatusSpan status={item.status}>{item.status}</AdminStatusSpan></div>
        <ButtonSecondaryButton type="button" aria-pressed={competition?.id === item.id} onClick={() => selectCompetition(item.id)}>{competition?.id === item.id ? 'Selected' : 'Select'}<SrOnlySpan> {item.name}</SrOnlySpan></ButtonSecondaryButton>
      </DashboardPanelLi>)}
    </AdminCompetitionListUl>
    {competition && <><CompetitionDetails key={competition.id} id={competition.id} /><BackLinkLink to={{ pathname: '/admin/settings', search: location.search }}>Configure shared points</BackLinkLink></>}
  </section>;
}
