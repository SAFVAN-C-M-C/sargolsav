import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
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
  return <form className="admin-form dashboard-panel" aria-label={title} noValidate onSubmit={async (event) => {
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
      <legend className="sr-only">{title} details</legend>
      <label htmlFor={inputId}>{kind === 'unit' ? 'Unit' : 'Madrassa'} name</label>
      <input id={inputId} value={name} required aria-invalid={Boolean(validation)} aria-describedby={validation ? `${inputId}-error` : undefined} onChange={(event) => setName(event.target.value)} />
      {validation && <p id={`${inputId}-error`} role="alert" className="form-error">{validation}</p>}
      <button type="submit" disabled={editing && !dirty}>{mutation.pending ? 'Saving…' : `${editing ? 'Save' : 'Create'} ${kind}`}</button>
    </fieldset>
    {mutation.error && <p role="alert" className="form-error">{mutation.error}</p>}
    <Link className="back-link" to={{ pathname: '/admin/units', search: cancelSearch }}>Cancel</Link>
  </form>;
}
