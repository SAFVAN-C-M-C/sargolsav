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
  return <section className="dashboard-panel" aria-labelledby="competition-details-title">
    <div className="section-heading"><h3 id="competition-details-title">Competition details</h3><span className={`admin-status status-${saved.status}`}>{saved.status}</span></div>
    <p className="admin-context">{saved.name}</p>
    <form className="admin-form" aria-label="Edit competition" noValidate onSubmit={async (event) => {
      event.preventDefault(); setSuccess('');
      const error = validateCompetition(name, code); setValidation(error);
      if (error || !dirty) return;
      const changes = { ...(name !== saved.name ? { name } : {}), ...(code !== saved.code ? { code } : {}) };
      const result = await mutation.run((signal) => competitionApi.edit(request, saved.id, changes, signal));
      if (result) accept(result.data, 'Competition details saved.');
    }}>
      <fieldset disabled={mutation.pending}>
        <legend className="sr-only">Editable competition details</legend>
        <label htmlFor="edit-name">Name</label><input id="edit-name" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={validation ? 'edit-validation' : undefined} />
        <label htmlFor="edit-code">Code</label><input id="edit-code" value={code} onChange={(event) => setCode(event.target.value)} aria-describedby={validation ? 'edit-validation' : undefined} />
        {validation && <p id="edit-validation" className="form-error" role="alert">{validation}</p>}
        <button type="submit" disabled={!dirty}>{mutation.pending ? 'Saving…' : 'Save details'}</button>
      </fieldset>
    </form>
    <div className="admin-lifecycle"><h3>Competition status</h3><p>Activation makes a competition available to public viewers. Archiving removes it from active public listings. Other active competitions are not changed. Returning to draft is not supported.</p>
      {dirty && <p>Save or reload your details before changing status.</p>}
      <div className="actions">{lifecycleActions[saved.status].map((status) => <button type="button" className="button-secondary" key={status} disabled={mutation.pending || dirty} onClick={async () => {
        if (!window.confirm(`Change ${saved.name} from ${saved.status} to ${status}? This changes its public availability.`)) return;
        setSuccess('');
        const result = await mutation.run((signal) => competitionApi.status(request, saved.id, status, signal));
        if (result) accept(result.data, `Competition is now ${result.data.status}.`);
      }}>{status === 'active' ? 'Activate competition' : 'Archive competition'}</button>)}</div>
    </div>
    {mutation.error && <p role="alert" className="form-error">{mutation.error}</p>}
    {success && <p role="status" className="admin-success">{success}</p>}
    <button type="button" className="button-secondary" disabled={mutation.pending} onClick={() => {
      if (!dirty || window.confirm('Discard unsaved details and reload?')) { clean(); reload(); }
    }}>Reload details</button>
  </section>;
}
