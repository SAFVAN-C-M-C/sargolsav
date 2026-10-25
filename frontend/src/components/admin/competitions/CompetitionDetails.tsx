import { ActionsDiv, AdminFormForm, AdminLifecycleDiv, AdminStatusSpan, AdminSuccessP, AppButton, ButtonSecondaryButton, DashboardPanelSection, FormErrorP, FormInput, FieldLabel, SectionHeadingDiv, SrOnlyLegend } from '../../../styles/components';
import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { AdminCompetition } from '../../../api/adminDashboardApi';
import { competitionApi, lifecycleActions, validateCompetition } from '../../../api/competitionApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import type { AdminWorkspace } from '../../../types/adminWorkspace';
import { DashboardError, DashboardLoading } from '../DashboardStates';

export function CompetitionDetails({ id }: { id: string }) {
  const { request } = useAdminAuth();
  const { upsertCompetition } = useOutletContext<AdminWorkspace>();
  const load = useCallback((signal: AbortSignal) => competitionApi.get(request, id, signal), [request, id]);
  const { state, retry } = useAdminResource(load);
  useEffect(() => { if (state.status === 'ready') upsertCompetition(state.data); }, [state, upsertCompetition]);
  if (state.status === 'loading') return <DashboardLoading>Loading competition details…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>Competition details could not be loaded. Try again.</DashboardError>;
  return <CompetitionEditor initial={state.data} reload={retry} />;
}

function CompetitionEditor({ initial, reload }: { initial: AdminCompetition; reload: () => void }) {
  const { request } = useAdminAuth();
  const { upsertCompetition } = useOutletContext<AdminWorkspace>();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [code, setCode] = useState(initial.code);
  const [validation, setValidation] = useState<string>();
  const [success, setSuccess] = useState('');
  const mutation = useAdminMutation();
  const dirty = name !== saved.name || code !== saved.code;
  const clean = useUnsavedAdminForm(dirty || mutation.pending);
  const accept = (competition: AdminCompetition, message: string) => {
    clean(); setSaved(competition); setName(competition.name); setCode(competition.code);
    upsertCompetition(competition); setSuccess(message);
  };
  return <DashboardPanelSection aria-labelledby="competition-details-title">
    <SectionHeadingDiv><h3 id="competition-details-title">Competition details</h3><AdminStatusSpan status={saved.status}>{saved.status}</AdminStatusSpan></SectionHeadingDiv>
    <p>{saved.name}</p>
    <AdminFormForm aria-label="Edit competition" noValidate onSubmit={async (event) => {
      event.preventDefault(); setSuccess('');
      const error = validateCompetition(name, code); setValidation(error);
      if (error || !dirty) return;
      const changes = { ...(name !== saved.name ? { name } : {}), ...(code !== saved.code ? { code } : {}) };
      const result = await mutation.run((signal) => competitionApi.edit(request, saved.id, changes, signal));
      if (result) accept(result.data, 'Competition details saved.');
    }}>
      <fieldset disabled={mutation.pending}>
        <SrOnlyLegend>Editable competition details</SrOnlyLegend>
        <FieldLabel htmlFor="edit-name">Name</FieldLabel><FormInput id="edit-name" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={validation ? 'edit-validation' : undefined} />
        <FieldLabel htmlFor="edit-code">Code</FieldLabel><FormInput id="edit-code" value={code} onChange={(event) => setCode(event.target.value)} aria-describedby={validation ? 'edit-validation' : undefined} />
        {validation && <FormErrorP id="edit-validation" role="alert">{validation}</FormErrorP>}
        <AppButton type="submit" disabled={!dirty}>{mutation.pending ? 'Saving…' : 'Save details'}</AppButton>
      </fieldset>
    </AdminFormForm>
    <AdminLifecycleDiv><h3>Competition status</h3><p>Activation makes a competition available to public viewers. Archiving removes it from active public listings. Other active competitions are not changed. Returning to draft is not supported.</p>
      {dirty && <p>Save or reload your details before changing status.</p>}
      <ActionsDiv>{lifecycleActions[saved.status].map((status) => <ButtonSecondaryButton type="button" key={status} disabled={mutation.pending || dirty} onClick={async () => {
        if (!window.confirm(`Change ${saved.name} from ${saved.status} to ${status}? This changes its public availability.`)) return;
        setSuccess('');
        const result = await mutation.run((signal) => competitionApi.status(request, saved.id, status, signal));
        if (result) accept(result.data, `Competition is now ${result.data.status}.`);
      }}>{status === 'active' ? 'Activate competition' : 'Archive competition'}</ButtonSecondaryButton>)}</ActionsDiv>
    </AdminLifecycleDiv>
    {mutation.error && <FormErrorP role="alert">{mutation.error}</FormErrorP>}
    {success && <AdminSuccessP role="status">{success}</AdminSuccessP>}
    <ButtonSecondaryButton type="button" disabled={mutation.pending} onClick={() => {
      if (!dirty || window.confirm('Discard unsaved details and reload?')) { clean(); reload(); }
    }}>Reload details</ButtonSecondaryButton>
  </DashboardPanelSection>;
}
