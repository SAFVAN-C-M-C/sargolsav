import { useCallback, useRef, useState } from 'react';
import { competitionApi, pointsFromRows, type PointRow, type Points } from '../../../api/competitionApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import { DashboardError, DashboardLoading } from '../DashboardStates';

export function CompetitionPoints({ id }: { id: string }) {
  const { request } = useAdminAuth();
  const load = useCallback((signal: AbortSignal) => competitionApi.settings(request, id, signal), [request, id]);
  const { state, retry } = useAdminResource(load);
  if (state.status === 'loading') return <DashboardLoading>Loading points settings…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>Shared points could not be loaded. Try again.</DashboardError>;
  return <PointsForm id={id} initial={state.data} />;
}

function toRows(points: Points): PointRow[] {
  return Object.entries(points).map(([position, value], index) => ({ key: `saved-${index}`, position, points: String(value) }));
}
const snapshot = (rows: PointRow[]) => JSON.stringify(rows.map(({ position, points }) => [position, points]));

function PointsForm({ id, initial }: { id: string; initial: Points }) {
  const { request } = useAdminAuth();
  const [rows, setRows] = useState(() => toRows(initial));
  const [saved, setSaved] = useState(() => snapshot(toRows(initial)));
  const [validation, setValidation] = useState<string>();
  const [success, setSuccess] = useState('');
  const nextKey = useRef(0);
  const mutation = useAdminMutation();
  const dirty = snapshot(rows) !== saved;
  const clean = useUnsavedAdminForm(dirty || mutation.pending);
  return <form className="admin-form dashboard-panel" aria-label="Shared points configuration" noValidate onSubmit={async (event) => {
    event.preventDefault(); setSuccess(''); setValidation(undefined);
    if (!dirty || mutation.pending) return;
    let points: Points;
    try { points = pointsFromRows(rows); } catch (error) { setValidation((error as Error).message); return; }
    if (!window.confirm(`${rows.length ? 'Save the complete shared points configuration?' : 'Clear all configured points?'} This affects all published leaderboards for this competition. Removed positions will be unconfigured.`)) return;
    const result = await mutation.run((signal) => competitionApi.saveSettings(request, id, points, signal));
    if (result) {
      const next = toRows(result.data); clean(); setRows(next); setSaved(snapshot(next)); setSuccess('Shared points saved. Published leaderboards use this configuration.');
    }
  }}>
    <h3>Position points</h3>
    <p id="points-impact">This configuration is shared by all events. Changing points affects all published leaderboards for this competition. Saving replaces the entire configuration; removing a position leaves it unconfigured.</p>
    <fieldset disabled={mutation.pending} aria-describedby="points-impact points-rules">
      <legend className="sr-only">Winning positions and points</legend>
      <p id="points-rules">Positions: 1–2147483647, no leading zeros or duplicates. Points: whole numbers from 0 to 9007199254740991.</p>
      {rows.length === 0 && <p>No winning positions configured. No default points are assumed.</p>}
      {rows.map((row, index) => <div className="points-row" key={row.key}>
        <div><label htmlFor={`position-${row.key}`}>Position {index + 1}</label><input id={`position-${row.key}`} inputMode="numeric" value={row.position} onChange={(event) => setRows(rows.map((item) => item.key === row.key ? { ...item, position: event.target.value } : item))} aria-describedby={validation ? 'points-validation' : undefined} /></div>
        <div><label htmlFor={`points-${row.key}`}>Points for row {index + 1}</label><input id={`points-${row.key}`} inputMode="numeric" value={row.points} onChange={(event) => setRows(rows.map((item) => item.key === row.key ? { ...item, points: event.target.value } : item))} aria-describedby={validation ? 'points-validation' : undefined} /></div>
        <button type="button" className="button-secondary" aria-label={`Remove position row ${index + 1}`} onClick={() => setRows(rows.filter((item) => item.key !== row.key))}>Remove</button>
      </div>)}
      <button type="button" className="button-secondary" onClick={() => setRows([...rows, { key: `new-${nextKey.current++}`, position: '', points: '' }])}>Add position</button>
      {validation && <p id="points-validation" role="alert" className="form-error">{validation}</p>}
      <div className="actions"><button type="submit" disabled={!dirty}>{mutation.pending ? 'Saving…' : 'Save shared points'}</button><button className="button-secondary" type="button" disabled={!dirty} onClick={() => {
        if (window.confirm('Discard unsaved point changes?')) { clean(); setRows(JSON.parse(saved).map(([position, points]: [string, string], index: number) => ({ key: `reset-${index}`, position, points }))); setValidation(undefined); }
      }}>Discard changes</button></div>
    </fieldset>
    {mutation.error && <p className="form-error" role="alert">{mutation.error}</p>}
    {success && <p className="admin-success" role="status">{success}</p>}
  </form>;
}
