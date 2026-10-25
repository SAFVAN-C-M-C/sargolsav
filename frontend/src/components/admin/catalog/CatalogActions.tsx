import { Link } from 'react-router-dom';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';

export function CatalogActions({ kind, name, parentName, editSearch, remove, onDeleted, allowDelete = true }: {
  kind: 'category' | 'event'; name: string; parentName: string; editSearch: string;
  remove: (signal: AbortSignal) => Promise<void>; onDeleted: () => void; allowDelete?: boolean;
}) {
  const mutation = useAdminMutation();
  const clean = useUnsavedAdminForm(mutation.pending);
  return <div className="catalog-actions">
    <div className="actions"><Link className="participant-action-link" to={{ pathname: '/admin/categories', search: editSearch }}>Edit {kind}</Link>
      {allowDelete && <button type="button" className="button-danger" disabled={mutation.pending} onClick={async () => {
        if (mutation.pending || !window.confirm(`Delete ${kind} "${name}" from "${parentName}"? This permanently removes this record. Dependent records block deletion; no events, candidates, results or audit evidence will be removed with it.`)) return;
        const result = await mutation.run(remove);
        if (result) { clean(); onDeleted(); }
      }}>{mutation.pending ? 'Deleting…' : `Delete ${kind}`}</button>}
    </div>
    {mutation.error && <p className="form-error" role="alert">{mutation.error}</p>}
  </div>;
}
