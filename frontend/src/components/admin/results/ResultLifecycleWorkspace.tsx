import { BackLinkLink, DashboardPanelPublishedSnapshotSection, NoticeDiv, ResultLifecycleSection } from '../../../styles/components';
import { useCallback, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resultLifecycleApi } from '../../../api/resultLifecycleApi';
import { categoriesApi, eventsApi } from '../../../api/catalogApi';
import { competitionApi } from '../../../api/competitionApi';
import { configuredPositions } from '../../../api/resultsApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import type { ResultScope } from '../../../types/adminResults';
import type { EventResult, LifecycleAction, ResultCorrection } from '../../../types/resultLifecycle';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { LifecycleActions } from './LifecycleActions';
import { PublishedWinners } from './WinnerSummary';
import { StartCorrectionForm } from './StartCorrectionForm';
import { CorrectionWorkspace } from './CorrectionWorkspace';

export function ResultLifecycleWorkspace({ scope, onState, notify }: { scope: ResultScope; onState: (result: EventResult) => void; notify: (message: string) => void }) {
  const { request, readPublished } = useAdminAuth(); const [params, setParams] = useSearchParams();
  const { competitionId, categoryId, eventId } = scope;
  const load = useCallback(async (signal: AbortSignal) => {
    const [result, points, category, event] = await Promise.all([
      resultLifecycleApi.get(request, { competitionId, categoryId, eventId }, signal), competitionApi.settings(request, competitionId, signal),
      categoriesApi(request, competitionId).get(categoryId, signal), eventsApi(request, competitionId, categoryId).get(eventId, signal),
    ]);
    const published = result.status === 'published' ? await resultLifecycleApi.published(readPublished, { competitionId, categoryId, eventId }, signal) : null;
    return { result, published, positions: configuredPositions(points), category, event };
  }, [request, readPublished, competitionId, categoryId, eventId]);
  const { state, retry, update } = useAdminResource(load);
  const current = state.status === 'ready' ? state.data.result : undefined;
  useEffect(() => { if (current) onState(current); }, [current, onState]);
  if (state.status === 'loading') return <DashboardLoading>Loading result review and publication data…</DashboardLoading>;
  if (state.status === 'error') return <><DashboardError retry={retry}>The scoped result or its publication data could not be loaded. Retry before taking lifecycle actions.</DashboardError><Link to={{ pathname: '/admin/results', search: participantSearch(params, { resultView: null, correction: null }) }}>Back to draft entry</Link></>;
  const { result, positions, published, category, event } = state.data;
  const accept = (value: EventResult, action: LifecycleAction) => {
    onState(value); notify(action === 'review' ? 'Result reviewed.' : action === 'publish' ? 'Result published.' : 'Result returned to draft.'); retry();
  };
  const started = (correction: ResultCorrection) => {
    update((data) => ({ ...data, result: { ...data.result, active_correction_id: correction.id } }));
    onState({ ...result, active_correction_id: correction.id }); notify('Private correction started.');
    setParams(participantSearch(params, { correction: correction.id, resultView: 'correction' }));
  };
  const correctionId = params.get('correction');
  return <ResultLifecycleSection aria-label="Result lifecycle workspace">
    {result.status !== 'published' ? <>
      {result.status === 'draft' && <BackLinkLink to={{ pathname: '/admin/results', search: participantSearch(params, { resultView: null, correction: null }) }}>Edit incomplete or changed draft</BackLinkLink>}
      <LifecycleActions record={result} positions={positions} eventName={event.name} categoryName={category.name}
        transition={(action, signal) => resultLifecycleApi.transition(request, scope, action, result.version, signal)} onConfirmed={accept} reload={retry} />
    </> : <>
      {published && <DashboardPanelPublishedSnapshotSection aria-label="Current public result"><h4>Current public result</h4>
        <p>Event: {published.event_name}<br />Category: {published.category_name}<br />Publication ID: <bdi>{published.publication_id}</bdi></p>
        <PublishedWinners winners={published.winners} />
        <p>Published at <time dateTime={published.published_at}>{published.published_at}</time>{result.published_by && <> by <bdi>{result.published_by}</bdi></>}</p>
        {result.reviewed_by && <p>Reviewed by <bdi>{result.reviewed_by}</bdi>{result.reviewed_at && <> at <time dateTime={result.reviewed_at}>{result.reviewed_at}</time></>}</p>}
      </DashboardPanelPublishedSnapshotSection>}
      {result.active_correction_id && <NoticeDiv><strong>Correction in Progress</strong><p>An existing private workspace is available. Starting another correction is not allowed.</p><Link to={{ pathname: '/admin/results', search: participantSearch(params, { correction: result.active_correction_id, resultView: 'correction' }) }}>Resume correction</Link></NoticeDiv>}
      {correctionId ? <CorrectionWorkspace key={correctionId} scope={scope} correctionId={correctionId} resultId={result.id} eventName={event.name} categoryName={category.name} notify={notify} onApplied={retry} /> :
        !result.active_correction_id && <StartCorrectionForm result={result} scope={scope} onStarted={started} reload={retry} />}
    </>}
  </ResultLifecycleSection>;
}
