import { useState } from 'react';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import { reviewProblems } from '../../../utils/resultReview';
import type { LifecycleAction, ReviewRecord } from '../../../types/resultLifecycle';
import { PublishConfirmation } from './PublishConfirmation';
import { WinnerSummary } from './WinnerSummary';

export function LifecycleActions<T extends ReviewRecord>({ record, positions, eventName, categoryName, correction = false, transition, onConfirmed, reload }: {
  record: T; positions: string[]; eventName: string; categoryName: string; correction?: boolean;
  transition: (action: LifecycleAction, signal: AbortSignal) => Promise<T>;
  onConfirmed: (record: T, action: LifecycleAction) => void; reload: () => void;
}) {
  const mutation = useAdminMutation(); const [confirming, setConfirming] = useState(false);
  const clean = useUnsavedAdminForm(mutation.pending || confirming);
  const problems = reviewProblems(record.entries, positions); const blocked = mutation.status === 409;
  const execute = async (action: LifecycleAction) => {
    if (mutation.pending || blocked) return;
    const result = await mutation.run((signal) => transition(action, signal));
    if (result) { clean(); setConfirming(false); onConfirmed(result.data, action); }
  };
  return <section className="dashboard-panel" aria-label={correction ? 'Correction review' : 'Result review'}>
    <p className="eyebrow">{correction ? 'Private correction' : 'Saved result'} · {record.status}</p>
    <WinnerSummary entries={record.entries} eventName={eventName} categoryName={categoryName} />
    {record.reviewed_by && <p>Reviewed by <bdi>{record.reviewed_by}</bdi>{record.reviewed_at && <> at <time dateTime={record.reviewed_at}>{record.reviewed_at}</time></>}</p>}
    {'published_by' in record && record.published_by && <p>Published by <bdi>{record.published_by}</bdi>{record.published_at && <> at <time dateTime={record.published_at}>{record.published_at}</time></>}</p>}
    {'applied_by' in record && record.applied_by && <p>Correction applied by <bdi>{record.applied_by}</bdi>{record.applied_at && <> at <time dateTime={record.applied_at}>{record.applied_at}</time></>}</p>}
    {record.status !== 'published' && record.status !== 'applied' && problems.length > 0 && <div className="notice"><p>Review/publication requirements:</p><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
    <div className="actions">
      {record.status === 'draft' && <button type="button" disabled={mutation.pending || blocked || problems.length > 0} onClick={() => void execute('review')}>{mutation.pending ? 'Reviewing…' : correction ? 'Review correction' : 'Review result'}</button>}
      {record.status === 'reviewed' && <><button type="button" className="button-secondary" disabled={mutation.pending || blocked} onClick={() => void execute('return-to-draft')}>Return to draft</button><button type="button" disabled={mutation.pending || blocked || problems.length > 0} onClick={() => setConfirming(true)}>{correction ? 'Publish correction' : 'Publish result'}</button></>}
      <button type="button" className="button-secondary" disabled={mutation.pending} onClick={() => { clean(); reload(); }}>Reload {correction ? 'correction' : 'result'}</button>
    </div>
    {!confirming && mutation.error && <p role="alert" className="form-error">{mutation.error}{blocked && ' Reload the current server record before retrying. Nothing was overwritten.'}</p>}
    {confirming && <PublishConfirmation entries={record.entries} eventName={eventName} categoryName={categoryName} correction={correction} pending={mutation.pending} blocked={blocked}
      error={mutation.error} onCancel={() => { clean(); setConfirming(false); }} onConfirm={() => void execute('publish')} />}
  </section>;
}
