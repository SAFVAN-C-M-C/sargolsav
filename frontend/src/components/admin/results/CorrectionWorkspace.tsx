import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resultLifecycleApi } from '../../../api/resultLifecycleApi';
import { competitionApi } from '../../../api/competitionApi';
import { unitsApi } from '../../../api/participantsApi';
import { configuredPositions } from '../../../api/resultsApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import type { ResultScope } from '../../../types/adminResults';
import type { LifecycleAction, ResultCorrection } from '../../../types/resultLifecycle';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { DraftEditor } from './DraftEditor';
import { LifecycleActions } from './LifecycleActions';

export function CorrectionWorkspace({ scope, correctionId, resultId, eventName, categoryName, onApplied, notify }: {
  scope: ResultScope; correctionId: string; resultId: string; eventName: string; categoryName: string;
  onApplied: () => void; notify: (message: string) => void;
}) {
  const { request } = useAdminAuth(); const [params] = useSearchParams();
  const { competitionId, categoryId, eventId } = scope;
  const reviewMode = params.get('resultView') === 'correction-review';
  const load = useCallback(async (signal: AbortSignal) => {
    const [correction, units, points] = await Promise.all([
      resultLifecycleApi.correction(request, { competitionId, categoryId, eventId }, correctionId, signal), unitsApi(request, competitionId).list(signal), competitionApi.settings(request, competitionId, signal),
    ]);
    if (correction.event_result_id !== resultId) throw new Error('Correction belongs to a different result');
    return { correction, units, positions: configuredPositions(points), reviewMode };
  }, [request, competitionId, categoryId, eventId, correctionId, resultId, reviewMode]);
  const { state, retry, update } = useAdminResource(load);
  if (state.status === 'loading') return <DashboardLoading>Loading private correction…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>The correction or its entry options could not be loaded. The public result has not been changed by this read.</DashboardError>;
  const { correction, positions, units } = state.data;
  const confirm = (value: ResultCorrection, action?: LifecycleAction) => {
    update((data) => ({ ...data, correction: value }));
    if (action === 'publish') { notify('Correction published.'); onApplied(); }
    else if (action) notify(action === 'review' ? 'Correction reviewed.' : 'Correction returned to draft.');
  };
  const reviewing = state.data.reviewMode || correction.status !== 'draft';
  return <section className="correction-workspace" aria-label="Private correction workspace"><h4>Private correction · {correction.status}</h4>
    <p>Reason: {correction.reason}</p><p>Based on publication <bdi>{correction.base_publication_id}</bdi>. Public winners remain unchanged until correction publication succeeds.</p>
    <nav className="actions" aria-label="Correction workspace navigation">
      <Link className="participant-action-link" to={{ pathname: '/admin/results', search: participantSearch(params, { correction: null, resultView: null }) }}>Back to published result</Link>
      {correction.status === 'draft' && <Link className="participant-action-link" to={{ pathname: '/admin/results', search: participantSearch(params, { resultView: reviewing ? 'correction' : 'correction-review' }) }}>{reviewing ? 'Edit correction' : 'Review saved correction'}</Link>}
    </nav>
    {correction.status === 'applied' && <p role="status">Correction applied. This workspace is read-only; a new correction must start from the current published result.</p>}
    {!reviewing ?
      <DraftEditor initial={{ ...correction, status: 'draft' }} scope={scope} categoryName={categoryName} units={units} positions={positions} correctionId={correction.id}
        onCorrectionConfirmed={(value) => confirm(value)} onConfirmed={() => {}} reload={retry} /> :
      <LifecycleActions record={correction} positions={positions} eventName={eventName} categoryName={categoryName} correction
        transition={(action, signal) => resultLifecycleApi.correctionTransition(request, scope, correctionId, action, correction.version, signal)}
        onConfirmed={confirm} reload={retry} />}
  </section>;
}
