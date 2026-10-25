import { useEffect, useRef, useState } from 'react';
import { resultsApi } from '../../../api/resultsApi';
import { resultLifecycleApi } from '../../../api/resultLifecycleApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import { draftRows, winnerPayload, winnerSnapshot } from '../../../utils/winnerEntry';
import type { ResultDraft, ResultScope, WinnerRow } from '../../../types/adminResults';
import type { AdminUnit } from '../../../types/adminParticipants';
import type { ResultCorrection } from '../../../types/resultLifecycle';
import { WinnerEntry } from './WinnerEntry';

export function DraftEditor({ initial, scope, categoryName, units, positions, onConfirmed, reload, correctionId, onCorrectionConfirmed }: {
  initial: ResultDraft; scope: ResultScope; categoryName: string; units: AdminUnit[]; positions: string[];
  onConfirmed: (draft: ResultDraft) => void; reload: () => void;
  correctionId?: string; onCorrectionConfirmed?: (correction: ResultCorrection) => void;
}) {
  const { request } = useAdminAuth(); const mutation = useAdminMutation();
  const [rows, setRows] = useState(() => draftRows(initial)); const [version, setVersion] = useState(initial.version);
  const [saved, setSaved] = useState(() => winnerSnapshot(draftRows(initial)));
  const [validation, setValidation] = useState(''); const [success, setSuccess] = useState('');
  const nextKey = useRef(0); const addRef = useRef<HTMLButtonElement>(null); const errorRef = useRef<HTMLDivElement>(null);
  const dirty = winnerSnapshot(rows) !== saved; const clean = useUnsavedAdminForm(dirty || mutation.pending);
  useEffect(() => { if (validation) errorRef.current?.focus(); }, [validation]);
  const blocked = mutation.status === 409 && /Draft changed|Result changed|Only draft|Operation requires|shared positions/i.test(mutation.error ?? '');
  const change = (transform: (rows: WinnerRow[]) => WinnerRow[]) => { setRows(transform); setSuccess(''); setValidation(''); };
  return <form className="draft-form dashboard-panel" aria-label={correctionId ? 'Result correction draft' : 'Event result draft'} noValidate onSubmit={async (event) => {
    event.preventDefault(); if (mutation.pending || blocked) return;
    setSuccess(''); let entries;
    try { entries = winnerPayload(rows, positions, units.map((unit) => unit.id)); } catch (error) { setValidation((error as Error).message); return; }
    setValidation('');
    const result = await mutation.run(async (signal) => {
      if (correctionId) {
        const correction = await resultLifecycleApi.saveCorrection(request, scope, correctionId, version, entries, signal);
        return { draft: { ...correction, status: 'draft' as const }, correction };
      }
      return { draft: await resultsApi.save(request, scope, version, entries, signal) };
    });
    if (result) {
      const next = draftRows(result.data.draft); clean(); setRows(next); setSaved(winnerSnapshot(next)); setVersion(result.data.draft.version);
      setSuccess(correctionId ? 'Correction saved privately.' : 'Draft saved.');
      if (result.data.correction) onCorrectionConfirmed?.(result.data.correction); else onConfirmed(result.data.draft);
    }
  }}>
    <p>{correctionId ? 'Private correction workspace. The current public result remains unchanged until correction publication succeeds.' : 'Private editable draft.'} Missing winning positions and an empty winner list are allowed. Each added winner must have complete required details.</p>
    {positions.length === 0 && <p className="notice">No winning positions configured. Only an empty draft can be saved. Configure shared points in Settings before entering winners.</p>}
    {units.length === 0 && <p>No units registered. Add units before entering new winners.</p>}
    <div ref={errorRef} tabIndex={-1}>{validation && <p role="alert" className="form-error">{validation}</p>}</div>
    <fieldset className="draft-fields" disabled={mutation.pending}><legend className="sr-only">Draft winners</legend>
      {rows.map((row, index) => <WinnerEntry key={row.key} row={row} index={index} competitionId={scope.competitionId} categoryId={scope.categoryId} categoryName={categoryName} units={units} positions={positions}
        onChange={(changes) => change((current) => current.map((item) => item.key === row.key ? { ...item, ...changes } : item))} onRemove={() => { change((current) => current.filter((item) => item.key !== row.key)); addRef.current?.focus(); }} />)}
      {rows.length === 0 && <p>No winners entered.</p>}
      <button ref={addRef} type="button" className="button-secondary" disabled={positions.length === 0 || rows.length >= positions.length} onClick={() => {
        const key = `new-${nextKey.current++}`;
        change((current) => [...current, { key, candidate_code: '', name: '', unit_id: '', madrasa_id: '', position: positions.find((position) => !current.some((row) => row.position === position)) ?? '', resolution: 'unchecked' }]);
      }}>Add winner</button>
    </fieldset>
    {mutation.error && <div role="alert" className="form-error"><p>{mutation.error}</p>{mutation.status === 409 && <p>Your entries are retained. Reconcile candidate conflicts, or deliberately reload the current server draft after a version/lifecycle conflict.</p>}</div>}
    <div className="draft-save-bar"><button type="submit" disabled={mutation.pending || blocked}>{mutation.pending ? 'Saving…' : correctionId ? 'Save correction' : 'Save draft'}</button>
      <button type="button" className="button-secondary" disabled={mutation.pending} onClick={() => {
        if (!dirty || window.confirm('Discard unsaved winner entries and reload the server draft?')) { clean(); reload(); }
      }}>{correctionId ? 'Reload correction' : 'Reload draft'}</button>
      <span role="status">{mutation.pending ? 'Saving draft…' : success || (dirty ? 'Unsaved changes' : 'Draft loaded')}</span>
    </div>
  </form>;
}
