import { useEffect, useRef } from 'react';
import type { WinnerPayload } from '../../../types/adminResults';
import type { AdminUnit } from '../../../types/adminParticipants';
import { sharedGroups } from '../../../utils/sharedPositions';

export interface SharedPositionSubmission { entries: WinnerPayload[]; reason: string; version: string }

export function SharedPositionConfirmation({ submission, units, correction, pending, error, blocked, onCancel, onConfirm }: {
  submission: SharedPositionSubmission; units: AdminUnit[]; correction: boolean; pending: boolean; error?: string; blocked: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null); const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; cancel.current?.focus();
    return () => {
      if (previous?.matches(':disabled')) previous.closest('form')?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      else previous?.focus();
    };
  }, []);
  useEffect(() => { if (pending) dialog.current?.focus(); else cancel.current?.focus(); }, [pending]);
  const groups = sharedGroups(submission.entries);
  return <div className="publication-overlay"><div ref={dialog} tabIndex={-1} className="publication-dialog" role="dialog" aria-modal="true" aria-labelledby="shared-position-title" aria-describedby="shared-position-impact" onKeyDown={(event) => {
    if (event.key === 'Escape' && !pending) { event.preventDefault(); onCancel(); }
    if (event.key === 'Tab') {
      const controls = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <h3 id="shared-position-title">Confirm shared-position override</h3>
    <p id="shared-position-impact">This exceptional override replaces the complete private {correction ? 'correction' : 'draft'} winner list and records your admin identity and reason in the audit history. It does not publish results. Each shared winner receives full configured points after publication.</p>
    <p><strong>Override reason:</strong> {submission.reason}</p>
    {groups.length ? groups.map((group) => <p className="shared-position-notice" key={group.position}><strong>Shared position {group.position}</strong>: {group.winners.map((entry) => `${entry.candidate_code} · ${entry.name}`).join('; ')}</p>) : <p className="notice">This save removes the existing shared-position approval references. Historical audit records are retained. Ordinary saving becomes available after the server confirms removal.</p>}
    <h4>Complete winners to save</h4>
    <ol className="verification-winners">{submission.entries.map((entry) => <li key={entry.candidate_code}><strong>Position {entry.position}: {entry.name}</strong><p>External candidate ID: <bdi>{entry.candidate_code}</bdi><br />Unit: {units.find((unit) => unit.id === entry.unit_id)?.name}<br />Madrassa ID: {entry.madrasa_id ?? 'None'}</p></li>)}</ol>
    {submission.entries.length === 0 && <p>No winners. This removes all winners and existing override references from this private workspace.</p>}
    {error && <p role="alert" className="form-error">{error}{blocked && ' Reload the server record before retrying.'}</p>}
    <div className="actions"><button ref={cancel} type="button" className="button-secondary" disabled={pending} onClick={onCancel}>Cancel override</button><button type="button" disabled={pending || blocked} onClick={onConfirm}>{pending ? 'Saving override…' : 'Confirm override'}</button></div>
  </div></div>;
}
