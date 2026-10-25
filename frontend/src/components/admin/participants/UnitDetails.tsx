import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { unitsApi } from '../../../api/participantsApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { ParticipantNameForm } from './ParticipantNameForm';
import { ParticipantActions } from './ParticipantActions';
import { MadrassaWorkspace } from './MadrassaWorkspace';

export function UnitDetails({ competitionId, competitionName, unitId, onChanged, onDeleted }: {
  competitionId: string; competitionName: string; unitId: string;
  onChanged: (message: string) => void; onDeleted: () => void;
}) {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const load = useCallback((signal: AbortSignal) => unitsApi(request, competitionId).get(unitId, signal), [request, competitionId, unitId]);
  const { state, retry } = useAdminResource(load);
  if (state.status === 'loading') return <DashboardLoading>Loading unit details…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>This unit could not be loaded in the selected competition. Choose a unit from the list or retry.</DashboardError>;
  const unit = state.data;
  const form = params.get('participantForm');
  return <section className="participant-detail" aria-labelledby="unit-details-title">
    <div className="dashboard-panel"><p className="eyebrow">Unit details</p><h3 id="unit-details-title">{unit.name}</h3>
      {form !== 'unit' && <ParticipantActions kind="unit" name={unit.name} parentName={competitionName}
        editSearch={participantSearch(params, { participantForm: 'unit', madrasa: null })}
        allowDelete={form !== 'madrasa' && form !== 'new-madrasa'}
        remove={(signal) => unitsApi(request, competitionId).remove(unitId, signal)} onDeleted={onDeleted} />}
    </div>
    {form === 'unit' ? <ParticipantNameForm kind="unit" editing initialName={unit.name}
      cancelSearch={participantSearch(params, { participantForm: null })}
      save={(name, signal) => unitsApi(request, competitionId).save(name, signal, unitId)} onSaved={() => {
        onChanged('Unit saved.'); retry(); setParams(participantSearch(params, { participantForm: null }));
      }} /> : <MadrassaWorkspace competitionId={competitionId} unitId={unitId} unitName={unit.name} />}
  </section>;
}
