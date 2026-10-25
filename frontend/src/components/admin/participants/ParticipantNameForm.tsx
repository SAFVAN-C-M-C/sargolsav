import { AdminFormDashboardPanelForm, BackLinkLink, AppButton, FormErrorP, FormInput, FieldLabel, SrOnlyLegend } from '../../../styles/components';
import { useId, useState } from 'react';

import { participantNameError } from '../../../api/participantsApi';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import type { AdminUnit } from '../../../types/adminParticipants';

export function ParticipantNameForm({ kind, initialName = '', editing = false, cancelSearch, save, onSaved }: {
  kind: 'unit' | 'Madrassa'; initialName?: string; editing?: boolean; cancelSearch: string;
  save: (name: string, signal: AbortSignal) => Promise<AdminUnit>;
  onSaved: (entity: AdminUnit) => void;
}) {
  const [name, setName] = useState(initialName);
  const [validation, setValidation] = useState<string>();
  const inputId = useId();
  const mutation = useAdminMutation();
  const dirty = name !== initialName;
  const clean = useUnsavedAdminForm(dirty || mutation.pending);
  const title = `${editing ? 'Edit' : 'Create'} ${kind}`;
  return <AdminFormDashboardPanelForm aria-label={title} noValidate onSubmit={async (event) => {
    event.preventDefault();
    if (mutation.pending) return;
    const error = participantNameError(name); setValidation(error);
    if (error || (editing && !dirty)) return;
    const result = await mutation.run((signal) => save(name, signal));
    if (result) { clean(); onSaved(result.data); }
  }}>
    <h3>{title}</h3>
    {kind === 'unit' && !editing && <p>Madrassas are optional. Create the unit first; you can add Madrassas later.</p>}
    <fieldset disabled={mutation.pending}>
      <SrOnlyLegend>{title} details</SrOnlyLegend>
      <FieldLabel htmlFor={inputId}>{kind === 'unit' ? 'Unit' : 'Madrassa'} name</FieldLabel>
      <FormInput id={inputId} value={name} required aria-invalid={Boolean(validation)} aria-describedby={validation ? `${inputId}-error` : undefined} onChange={(event) => setName(event.target.value)} />
      {validation && <FormErrorP id={`${inputId}-error`} role="alert">{validation}</FormErrorP>}
      <AppButton type="submit" disabled={editing && !dirty}>{mutation.pending ? 'Saving…' : `${editing ? 'Save' : 'Create'} ${kind}`}</AppButton>
    </fieldset>
    {mutation.error && <FormErrorP role="alert">{mutation.error}</FormErrorP>}
    <BackLinkLink to={{ pathname: '/admin/units', search: cancelSearch }}>Cancel</BackLinkLink>
  </AdminFormDashboardPanelForm>;
}
