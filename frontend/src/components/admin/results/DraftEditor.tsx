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
import { meaningfulOverrideReason, sharedGroups } from '../../../utils/sharedPositions';
import { SharedPositionConfirmation, type SharedPositionSubmission } from './SharedPositionConfirmation';

export function DraftEditor({ initial, scope, categoryName, units, positions, onConfirmed, reload, correctionId, onCorrectionConfirmed }: {
  initial: ResultDraft; scope: ResultScope; categoryName: string; units: AdminUnit[]; positions: string[];
  onConfirmed: (draft: ResultDraft) => void; reload: () => void;
  correctionId?: string; onCorrectionConfirmed?: (correction: ResultCorrection) => void;
}) {
  const { request } = useAdminAuth(); const mutation = useAdminMutation();
  const [rows, setRows] = useState(() => draftRows(initial)); const [version, setVersion] = useState(initial.version);
  const [saved, setSaved] = useState(() => winnerSnapshot(draftRows(initial)));
  const [validation, setValidation] = useState(''); const [success, setSuccess] = useState('');
  const [allowShared, setAllowShared] = useState(false); const [reason, setReason] = useState('');
  const [hasOverride, setHasOverride] = useState(() => initial.entries.some((entry) => entry.override_audit_id !== null) || sharedGroups(initial.entries).length > 0);
  const [confirmation, setConfirmation] = useState<SharedPositionSubmission>();
  const nextKey = useRef(0); const addRef = useRef<HTMLButtonElement>(null); const errorRef = useRef<HTMLDivElement>(null);
  const dirty = winnerSnapshot(rows) !== saved || allowShared || Boolean(reason); const clean = useUnsavedAdminForm(dirty || mutation.pending || Boolean(confirmation));
  useEffect(() => { if (validation) errorRef.current?.focus(); }, [validation]);
  const blocked = mutation.status === 409 && /Draft changed|Result changed|Only draft|Operation requires|shared.positions|override/i.test(mutation.error ?? '');
  const change = (transform: (rows: WinnerRow[]) => WinnerRow[]) => { setRows(transform); setSuccess(''); setValidation(''); };
  const save = async (submission: SharedPositionSubmission, shared: boolean) => {
    if (mutation.pending || blocked) return;
    const { entries, version, reason } = submission;
    const result = await mutation.run(async (signal) => {
      if (correctionId) {
        const correction = shared ? await resultLifecycleApi.saveSharedCorrection(request, scope, correctionId, version, entries, reason, signal) : await resultLifecycleApi.saveCorrection(request, scope, correctionId, version, entries, signal);
        return { draft: { ...correction, status: 'draft' as const }, correction };
      }
      return { draft: shared ? await resultsApi.saveShared(request, scope, version, entries, reason, signal) : await resultsApi.save(request, scope, version, entries, signal) };
    });
    if (result) {
      const next = draftRows(result.data.draft); clean(); setRows(next); setSaved(winnerSnapshot(next)); setVersion(result.data.draft.version);
      setHasOverride(result.data.draft.entries.some((entry) => entry.override_audit_id !== null) || sharedGroups(result.data.draft.entries).length > 0);
      setAllowShared(false); setReason(''); setConfirmation(undefined);
      setSuccess(shared ? 'Shared-position changes saved privately. Review is required before publication.' : correctionId ? 'Correction saved privately.' : 'Draft saved.');
      if (result.data.correction) onCorrectionConfirmed?.(result.data.correction); else onConfirmed(result.data.draft);
    }
  };
  return <form className="draft-form dashboard-panel" aria-label={correctionId ? 'Result correction draft' : 'Event result draft'} noValidate onSubmit={async (event) => {
    event.preventDefault(); if (mutation.pending || blocked || confirmation) return;
    setSuccess(''); let entries;
    try {
      entries = winnerPayload(rows, positions, units.map((unit) => unit.id), allowShared);
      if (hasOverride && !allowShared) throw new Error('This saved workspace contains override references. Enable Allow Shared Positions and enter a fresh reason to edit or remove them.');
      if (allowShared && !hasOverride && sharedGroups(entries).length === 0) throw new Error('No shared positions or existing override to remove. Turn off Allow Shared Positions and save normally.');
      if (allowShared && !meaningfulOverrideReason(reason)) throw new Error('Override reason must contain at least two words and ten letters or digits, with at most 1000 characters and no null characters.');
    } catch (error) { setValidation((error as Error).message); return; }
    setValidation(''); const submission = { entries, version, reason };
    if (allowShared) setConfirmation(submission); else await save(submission, false);
  }}>
    <p>{correctionId ? 'Private correction workspace. The current public result remains unchanged until correction publication succeeds.' : 'Private editable draft.'} Missing winning positions and an empty winner list are allowed. Each added winner must have complete required details.</p>
    {positions.length === 0 && <p className="notice">No winning positions configured. Only an empty draft can be saved. Configure shared points in Settings before entering winners.</p>}
    {units.length === 0 && <p>No units registered. Add units before entering new winners.</p>}
    <div ref={errorRef} tabIndex={-1}>{validation && <p role="alert" className="form-error">{validation}</p>}</div>
    <fieldset className="shared-position-controls" disabled={mutation.pending || Boolean(confirmation)}><legend>Exceptional shared positions</legend>
      {hasOverride && <p className="shared-position-notice">Saved shared-position approval references are present. All edits and removals require a fresh explicit override save. No override is automatically enabled.</p>}
      <label className="shared-position-toggle"><input type="checkbox" checked={allowShared} aria-describedby="shared-position-help" onChange={(event) => { setAllowShared(event.target.checked); setSuccess(''); setValidation(''); }} />Allow Shared Positions</label>
      <p id="shared-position-help">Use only for an exceptional tie confirmed by the judges. A meaningful reason and explicit confirmation are required for each save. Duplicate candidates are never allowed.</p>
      {allowShared && <><label htmlFor="shared-position-reason">Shared-position override reason</label><textarea id="shared-position-reason" value={reason} required aria-describedby="shared-position-help" onChange={(event) => { setReason(event.target.value); setSuccess(''); }} /></>}
      {sharedGroups(rows).map((group) => <p className="shared-position-notice" key={group.position}><strong>Shared position {group.position}</strong>: {group.winners.map((entry, index) => `${entry.candidate_code || `Winner ${index + 1}`} · ${entry.name || 'Name required'}`).join('; ')}</p>)}
    </fieldset>
    <fieldset className="draft-fields" disabled={mutation.pending || Boolean(confirmation)}><legend className="sr-only">Draft winners</legend>
      {rows.map((row, index) => <WinnerEntry key={row.key} row={row} index={index} competitionId={scope.competitionId} categoryId={scope.categoryId} categoryName={categoryName} units={units} positions={positions}
        onChange={(changes) => change((current) => current.map((item) => item.key === row.key ? { ...item, ...changes } : item))} onRemove={() => { change((current) => current.filter((item) => item.key !== row.key)); addRef.current?.focus(); }} />)}
      {rows.length === 0 && <p>No winners entered.</p>}
      <button ref={addRef} type="button" className="button-secondary" disabled={positions.length === 0 || (!allowShared && rows.length >= positions.length)} onClick={() => {
        const key = `new-${nextKey.current++}`;
        change((current) => [...current, { key, candidate_code: '', name: '', unit_id: '', madrasa_id: '', position: positions.find((position) => !current.some((row) => row.position === position)) ?? (allowShared ? positions[0] : ''), resolution: 'unchecked' }]);
      }}>Add winner</button>
    </fieldset>
    {!confirmation && mutation.error && <div role="alert" className="form-error"><p>{mutation.error}</p>{mutation.status === 409 && <p>Your entries are retained. Reconcile candidate conflicts, or deliberately reload the current server draft after a version/lifecycle conflict.</p>}</div>}
    <div className="draft-save-bar"><button type="submit" disabled={mutation.pending || blocked || Boolean(confirmation)}>{mutation.pending ? 'Saving…' : allowShared ? 'Save shared-position override' : correctionId ? 'Save correction' : 'Save draft'}</button>
      <button type="button" className="button-secondary" disabled={mutation.pending || Boolean(confirmation)} onClick={() => {
        if (!dirty || window.confirm('Discard unsaved winner entries and reload the server draft?')) { clean(); reload(); }
      }}>{correctionId ? 'Reload correction' : 'Reload draft'}</button>
      <span role="status">{mutation.pending ? 'Saving draft…' : success || (dirty ? 'Unsaved changes' : 'Draft loaded')}</span>
    </div>
    {confirmation && <SharedPositionConfirmation submission={confirmation} units={units} correction={Boolean(correctionId)} pending={mutation.pending} error={mutation.error} blocked={blocked} onCancel={() => setConfirmation(undefined)} onConfirm={() => void save(confirmation, true)} />}
  </form>;
}
