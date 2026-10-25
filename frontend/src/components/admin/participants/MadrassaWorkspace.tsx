import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { madrassasApi } from '../../../api/participantsApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { ParticipantNameForm } from './ParticipantNameForm';
import { ParticipantActions } from './ParticipantActions';

export function MadrassaWorkspace({ competitionId, unitId, unitName }: { competitionId: string; unitId: string; unitName: string }) {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const [success, setSuccess] = useState('');
  const load = useCallback((signal: AbortSignal) => madrassasApi(request, competitionId, unitId).list(signal), [request, competitionId, unitId]);
  const { state, retry } = useAdminResource(load);
  const creating = params.get('participantForm') === 'new-madrasa';
  const madrassaId = params.get('madrasa');
  return <section aria-labelledby="madrassas-title">
    <div className="section-heading participant-section-heading"><h3 id="madrassas-title">Madrassas in {unitName}</h3>
      {!creating && <Link className="participant-action-link" to={{ pathname: '/admin/units', search: participantSearch(params, { participantForm: 'new-madrasa', madrasa: null }) }}>New Madrassa</Link>}
    </div>
    {success && <p role="status" className="admin-success">{success}</p>}
    {state.status === 'loading' && <DashboardLoading>Loading Madrassas…</DashboardLoading>}
    {state.status === 'error' && <DashboardError retry={retry}>Madrassas could not be loaded. Check your connection and try again.</DashboardError>}
    {state.status === 'ready' && <><p>{state.data.length} {state.data.length === 1 ? 'Madrassa' : 'Madrassas'}</p>
      {state.data.length ? <ul className="participant-list" aria-label="Madrassas">{state.data.map((madrassa) => <li key={madrassa.id}><Link aria-current={!creating && madrassa.id === madrassaId ? 'page' : undefined}
        to={{ pathname: '/admin/units', search: participantSearch(params, { madrasa: madrassa.id, participantForm: null }) }}>{madrassa.name}</Link></li>)}</ul> :
        <div className="dashboard-panel"><h4>No Madrassas yet</h4><p>This unit has no Madrassas. Madrassas are optional.</p></div>}
    </>}
    {creating ? <ParticipantNameForm kind="Madrassa" cancelSearch={participantSearch(params, { participantForm: null })}
      save={(name, signal) => madrassasApi(request, competitionId, unitId).save(name, signal)} onSaved={(madrassa) => {
        setSuccess('Madrassa created.'); retry(); setParams(participantSearch(params, { madrasa: madrassa.id, participantForm: null }));
      }} /> : madrassaId && <MadrassaDetails key={madrassaId} competitionId={competitionId} unitId={unitId} unitName={unitName} madrassaId={madrassaId}
        onChanged={() => { retry(); setSuccess('Madrassa saved.'); }} onDeleted={() => {
          retry(); setSuccess('Madrassa deleted.'); setParams(participantSearch(params, { madrasa: null, participantForm: null }));
        }} />}
  </section>;
}

function MadrassaDetails({ competitionId, unitId, unitName, madrassaId, onChanged, onDeleted }: {
  competitionId: string; unitId: string; unitName: string; madrassaId: string;
  onChanged: () => void; onDeleted: () => void;
}) {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const load = useCallback((signal: AbortSignal) => madrassasApi(request, competitionId, unitId).get(madrassaId, signal), [request, competitionId, unitId, madrassaId]);
  const { state, retry } = useAdminResource(load);
  if (state.status === 'loading') return <DashboardLoading>Loading Madrassa details…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>This Madrassa could not be loaded under this unit. Choose another Madrassa or retry.</DashboardError>;
  const madrassa = state.data;
  if (params.get('participantForm') === 'madrasa') return <ParticipantNameForm kind="Madrassa" editing initialName={madrassa.name}
    cancelSearch={participantSearch(params, { participantForm: null })}
    save={(name, signal) => madrassasApi(request, competitionId, unitId).save(name, signal, madrassaId)} onSaved={() => {
      onChanged(); retry(); setParams(participantSearch(params, { participantForm: null }));
    }} />;
  return <div className="dashboard-panel"><p className="eyebrow">Madrassa details</p><h4>{madrassa.name}</h4><p>Parent unit: {unitName}</p>
    <ParticipantActions kind="Madrassa" name={madrassa.name} parentName={unitName}
      editSearch={participantSearch(params, { participantForm: 'madrasa' })}
      remove={(signal) => madrassasApi(request, competitionId, unitId).remove(madrassaId, signal)} onDeleted={onDeleted} />
  </div>;
}
