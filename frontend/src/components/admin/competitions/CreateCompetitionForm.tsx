import { ActionsDiv, AdminFormDashboardPanelForm, AppButton, ButtonSecondaryButton, FormErrorP, FormInput, FieldLabel, SrOnlyLegend } from '../../../styles/components';
import { useState } from 'react';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import { competitionApi, validateCompetition } from '../../../api/competitionApi';
import type { AdminCompetition } from '../../../api/adminDashboardApi';

export function CreateCompetitionForm({ onCreated, onCancel }: { onCreated: (competition: AdminCompetition) => void; onCancel: () => void }) {
  const { request } = useAdminAuth();
  const mutation = useAdminMutation();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [validation, setValidation] = useState<string>();
  const clean = useUnsavedAdminForm(Boolean(name || code) || mutation.pending);
  return <AdminFormDashboardPanelForm aria-label="Create competition" noValidate onSubmit={async (event) => {
    event.preventDefault();
    const error = validateCompetition(name, code);
    setValidation(error);
    if (error) return;
    const result = await mutation.run((signal) => competitionApi.create(request, name, code, signal));
    if (result) { clean(); setName(''); setCode(''); onCreated(result.data); }
  }}>
    <h3>Create competition</h3><p>New competitions start as drafts. Name and code are required.</p>
    <fieldset disabled={mutation.pending}>
      <SrOnlyLegend>New competition details</SrOnlyLegend>
      <FieldLabel htmlFor="create-name">Competition name</FieldLabel><FormInput id="create-name" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={validation ? 'create-validation' : undefined} />
      <FieldLabel htmlFor="create-code">Competition code</FieldLabel><FormInput id="create-code" value={code} onChange={(event) => setCode(event.target.value)} aria-describedby={validation ? 'create-validation' : undefined} />
      {validation && <FormErrorP id="create-validation" role="alert">{validation}</FormErrorP>}
      <ActionsDiv layout="form"><AppButton type="submit">{mutation.pending ? 'Creating…' : 'Create competition'}</AppButton><ButtonSecondaryButton type="button" onClick={() => {
        if (!(name || code) || window.confirm('Discard the new competition details?')) { clean(); onCancel(); }
      }}>Cancel</ButtonSecondaryButton></ActionsDiv>
    </fieldset>
    {mutation.error && <FormErrorP role="alert">{mutation.error}</FormErrorP>}
  </AdminFormDashboardPanelForm>;
}
