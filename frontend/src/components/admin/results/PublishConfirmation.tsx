import { ActionsDiv, AppButton, ButtonSecondaryButton, FormErrorP, PublicationDialogDiv, PublicationOverlayDiv } from '../../../styles/components';
import { useEffect, useRef } from 'react';
import type { LifecycleEntry } from '../../../types/resultLifecycle';
import { WinnerSummary } from './WinnerSummary';

export function PublishConfirmation({ entries, eventName, categoryName, correction, pending, error, blocked, onCancel, onConfirm }: {
  entries: LifecycleEntry[]; eventName: string; categoryName: string; correction: boolean; pending: boolean; error?: string; blocked: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null); const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; cancel.current?.focus();
    return () => {
      if (previous?.matches(':disabled')) previous.closest('section')?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      else previous?.focus();
    };
  }, []);
  useEffect(() => { if (pending) dialog.current?.focus(); else cancel.current?.focus(); }, [pending]);
  return <PublicationOverlayDiv><PublicationDialogDiv ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="publication-title" aria-describedby="publication-impact" onKeyDown={(event) => {
    if (event.key === 'Escape' && !pending) { event.preventDefault(); onCancel(); }
    if (event.key === 'Tab') {
      const controls = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <h3 id="publication-title">{correction ? 'Publish corrected result?' : 'Publish this result?'}</h3>
    <p id="publication-impact">Publishing makes these exact winners public and changes leaderboard standings.{correction ? ' The current public result is replaced only when publication succeeds. Prior publication and audit history are retained.' : ''}</p>
    <WinnerSummary entries={entries} eventName={eventName} categoryName={categoryName} title="Exact winners to publish" />
    {error && <FormErrorP role="alert">{error}</FormErrorP>}
    <ActionsDiv layout="dialog"><ButtonSecondaryButton ref={cancel} type="button" disabled={pending} onClick={onCancel}>Cancel publication</ButtonSecondaryButton><AppButton type="button" disabled={pending || blocked} onClick={onConfirm}>{pending ? 'Publishing…' : 'Confirm publication'}</AppButton></ActionsDiv>
  </PublicationDialogDiv></PublicationOverlayDiv>;
}
