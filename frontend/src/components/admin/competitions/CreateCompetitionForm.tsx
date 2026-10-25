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
  return <form className="admin-form dashboard-panel" aria-label="Create competition" noValidate onSubmit={async (event) => {
    event.preventDefault();
    const error = validateCompetition(name, code);
    setValidation(error);
    if (error) return;
    const result = await mutation.run((signal) => competitionApi.create(request, name, code, signal));
    if (result) { clean(); setName(''); setCode(''); onCreated(result.data); }
  }}>
    <h3>Create competition</h3><p>New competitions start as drafts. Name and code are required.</p>
    <fieldset disabled={mutation.pending}>
      <legend className="sr-only">New competition details</legend>
      <label htmlFor="create-name">Competition name</label><input id="create-name" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={validation ? 'create-validation' : undefined} />
      <label htmlFor="create-code">Competition code</label><input id="create-code" value={code} onChange={(event) => setCode(event.target.value)} aria-describedby={validation ? 'create-validation' : undefined} />
      {validation && <p id="create-validation" className="form-error" role="alert">{validation}</p>}
      <div className="actions"><button type="submit">{mutation.pending ? 'Creating…' : 'Create competition'}</button><button type="button" className="button-secondary" onClick={() => {
        if (!(name || code) || window.confirm('Discard the new competition details?')) { clean(); onCancel(); }
      }}>Cancel</button></div>
    </fieldset>
    {mutation.error && <p className="form-error" role="alert">{mutation.error}</p>}
  </form>;
}
