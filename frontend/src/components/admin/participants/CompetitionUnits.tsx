import { AdminSuccessP, DashboardPanelDiv, ParticipantActionLinkLink, ParticipantListUl, SectionHeadingParticipantSectionHeadingDiv } from '../../../styles/components';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { unitsApi } from '../../../api/participantsApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { ParticipantNameForm } from './ParticipantNameForm';
import { UnitDetails } from './UnitDetails';

export function CompetitionUnits({ competitionId, competitionName }: { competitionId: string; competitionName: string }) {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const [success, setSuccess] = useState('');
  const load = useCallback((signal: AbortSignal) => unitsApi(request, competitionId).list(signal), [request, competitionId]);
  const { state, retry } = useAdminResource(load);
  const unitId = params.get('unit');
  const creating = params.get('participantForm') === 'new-unit';
  const change = (changes: Record<string, string | null>) => setParams(participantSearch(params, changes));
  return <>
    <SectionHeadingParticipantSectionHeadingDiv><h3>Participating units</h3>
      {!creating && <ParticipantActionLinkLink to={{ pathname: '/admin/units', search: participantSearch(params, { participantForm: 'new-unit', madrasa: null }) }}>New unit</ParticipantActionLinkLink>}
    </SectionHeadingParticipantSectionHeadingDiv>
    {success && <AdminSuccessP role="status">{success}</AdminSuccessP>}
    {state.status === 'loading' && <DashboardLoading>Loading units…</DashboardLoading>}
    {state.status === 'error' && <DashboardError retry={retry}>Units could not be loaded. Check your connection and try again.</DashboardError>}
    {state.status === 'ready' && (state.data.length ? <ParticipantListUl aria-label="Units">
      {state.data.map((unit) => <li key={unit.id}><Link aria-current={!creating && unit.id === unitId ? 'page' : undefined} to={{ pathname: '/admin/units', search: participantSearch(params, { unit: unit.id, madrasa: null, participantForm: null }) }}>{unit.name}</Link></li>)}
    </ParticipantListUl> : <DashboardPanelDiv><h3>No units yet</h3><p>Create the first unit for this competition. No Madrassa is required.</p></DashboardPanelDiv>)}
    {creating ? <ParticipantNameForm kind="unit" cancelSearch={participantSearch(params, { participantForm: null })}
      save={(name, signal) => unitsApi(request, competitionId).save(name, signal)} onSaved={(unit) => {
        setSuccess('Unit created.'); retry(); change({ unit: unit.id, madrasa: null, participantForm: null });
      }} /> : unitId ? <UnitDetails key={unitId} competitionId={competitionId} competitionName={competitionName} unitId={unitId}
        onChanged={(message) => { retry(); setSuccess(message); }} onDeleted={() => {
          retry(); setSuccess('Unit deleted.'); change({ unit: null, madrasa: null, participantForm: null });
        }} /> : state.status === 'ready' && state.data.length > 0 && <p>Select a unit to view its details and Madrassas.</p>}
  </>;
}
