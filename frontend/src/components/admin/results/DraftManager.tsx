import { AppButton, DashboardPanelDiv, FormErrorP } from '../../../styles/components';
import { useCallback } from 'react';
import { competitionApi } from '../../../api/competitionApi';
import { unitsApi } from '../../../api/participantsApi';
import { configuredPositions, resultsApi } from '../../../api/resultsApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import type { ResultDraft, ResultScope } from '../../../types/adminResults';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { DraftEditor } from './DraftEditor';

export function DraftManager({ scope, categoryName, onConfirmed }: { scope: ResultScope; categoryName: string; onConfirmed: (draft: ResultDraft) => void }) {
  const { request } = useAdminAuth();
  const { competitionId, categoryId, eventId } = scope;
  const load = useCallback(async (signal: AbortSignal) => {
    const [read, units, points] = await Promise.all([resultsApi.read(request, { competitionId, categoryId, eventId }, signal), unitsApi(request, competitionId).list(signal), competitionApi.settings(request, competitionId, signal)]);
    return { read, units, positions: configuredPositions(points) };
  }, [request, competitionId, categoryId, eventId]);
  const { state, retry, update } = useAdminResource(load);
  const mutation = useAdminMutation(); const clean = useUnsavedAdminForm(mutation.pending);
  if (state.status === 'loading') return <DashboardLoading>Loading draft and entry options…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>Draft or entry options could not be loaded. Try again.</DashboardError>;
  const { read, units, positions } = state.data;
  const accept = (draft: ResultDraft) => { update((data) => ({ ...data, read: { kind: 'draft', draft } })); onConfirmed(draft); };
  if (read.kind === 'locked') return <DashboardPanelDiv role="alert"><h4>Draft editing unavailable</h4><p>{read.message}</p><AppButton type="button" onClick={retry}>Reload draft</AppButton></DashboardPanelDiv>;
  if (read.kind === 'absent') return <DashboardPanelDiv><h4>No draft yet</h4><p>Initialize an empty private draft before entering winners. This does not publish results.</p><AppButton type="button" disabled={mutation.pending} onClick={async () => {
    const result = await mutation.run((signal) => resultsApi.initialize(request, scope, signal)); if (result) { clean(); accept(result.data); }
  }}>{mutation.pending ? 'Initializing…' : 'Initialize draft'}</AppButton>{mutation.error && <><FormErrorP role="alert">{mutation.error}</FormErrorP><AppButton type="button" disabled={mutation.pending} onClick={retry}>Reload draft</AppButton></>}</DashboardPanelDiv>;
  return <DraftEditor initial={read.draft} scope={scope} categoryName={categoryName} units={units} positions={positions} onConfirmed={accept} reload={retry} />;
}
