import { Link } from 'react-router-dom';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';

export function ParticipantActions({ kind, name, parentName, editSearch, remove, onDeleted, allowDelete = true }: {
  kind: 'unit' | 'Madrassa'; name: string; parentName: string; editSearch: string;
  remove: (signal: AbortSignal) => Promise<void>; onDeleted: () => void; allowDelete?: boolean;
}) {
  const mutation = useAdminMutation();
  const clean = useUnsavedAdminForm(mutation.pending);
  return <div className="participant-actions">
    <div className="actions"><Link className="participant-action-link" to={{ pathname: '/admin/units', search: editSearch }}>Edit {kind}</Link>
      {allowDelete && <button type="button" className="button-danger" disabled={mutation.pending} onClick={async () => {
        if (mutation.pending || !window.confirm(`Delete ${kind} "${name}" from "${parentName}"? This permanently removes this record. Referenced records cannot be deleted; no related records will be removed.`)) return;
        const result = await mutation.run(remove);
        if (result) { clean(); onDeleted(); }
      }}>{mutation.pending ? 'Deleting…' : `Delete ${kind}`}</button>}
    </div>
    {mutation.error && <p className="form-error" role="alert">{mutation.error}</p>}
  </div>;
}
