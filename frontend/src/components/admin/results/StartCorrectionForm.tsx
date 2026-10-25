import { AdminFormDashboardPanelForm, AppButton, ButtonSecondaryButton, FormErrorP, FormInput, FieldLabel, SrOnlyLegend } from '../../../styles/components';
import { useState } from 'react';
import { resultLifecycleApi } from '../../../api/resultLifecycleApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import type { ResultScope } from '../../../types/adminResults';
import type { EventResult, ResultCorrection } from '../../../types/resultLifecycle';

export function StartCorrectionForm({ result, scope, onStarted, reload }: { result: EventResult; scope: ResultScope; onStarted: (correction: ResultCorrection) => void; reload: () => void }) {
  const { request } = useAdminAuth(); const mutation = useAdminMutation();
  const [reason, setReason] = useState(''); const [validation, setValidation] = useState('');
  const clean = useUnsavedAdminForm(Boolean(reason) || mutation.pending);
  return <AdminFormDashboardPanelForm aria-label="Start result correction" noValidate onSubmit={async (event) => {
    event.preventDefault(); if (mutation.pending || mutation.status === 409) return;
    if (!reason.trim() || reason.includes('\0')) { setValidation('A nonblank correction reason without null characters is required.'); return; }
    setValidation(''); const confirmed = await mutation.run(async (signal) => {
      const correction = await resultLifecycleApi.startCorrection(request, scope, result.version, reason, signal);
      if (correction.event_result_id !== result.id) throw new Error('Invalid correction result scope'); return correction;
    });
    if (confirmed) { clean(); onStarted(confirmed.data); }
  }}>
    <h4>Start a private correction</h4><p>The current public result stays visible until the corrected result is reviewed and published. An existing workspace must be resumed; it is never reset.</p>
    <fieldset disabled={mutation.pending}><SrOnlyLegend>Correction reason</SrOnlyLegend><FieldLabel htmlFor="correction-reason">Correction reason</FieldLabel>
      <FormInput id="correction-reason" value={reason} required aria-describedby={validation ? 'correction-reason-error' : undefined} onChange={(event) => setReason(event.target.value)} />
      {validation && <FormErrorP id="correction-reason-error" role="alert">{validation}</FormErrorP>}
      <AppButton type="submit" disabled={mutation.status === 409}>{mutation.pending ? 'Starting…' : 'Start correction'}</AppButton>
    </fieldset>
    {mutation.error && <FormErrorP role="alert">{mutation.error} Reload the current result to resume existing work or refresh its version.</FormErrorP>}
    <ButtonSecondaryButton type="button" disabled={mutation.pending} onClick={() => {
      if (!reason || window.confirm('Discard the unsaved correction reason and reload the published result?')) { clean(); reload(); }
    }}>Reload published result</ButtonSecondaryButton>
  </AdminFormDashboardPanelForm>;
}
