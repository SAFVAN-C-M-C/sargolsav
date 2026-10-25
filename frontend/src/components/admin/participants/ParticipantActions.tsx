import { ActionsDiv, ButtonDangerButton, FormErrorP, ParticipantActionLinkLink, } from '../../../styles/components';

import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';

export function ParticipantActions({ kind, name, parentName, editSearch, remove, onDeleted, allowDelete = true }: {
  kind: 'unit' | 'Madrassa'; name: string; parentName: string; editSearch: string;
  remove: (signal: AbortSignal) => Promise<void>; onDeleted: () => void; allowDelete?: boolean;
}) {
  const mutation = useAdminMutation();
  const clean = useUnsavedAdminForm(mutation.pending);
  return <div>
    <ActionsDiv><ParticipantActionLinkLink to={{ pathname: '/admin/units', search: editSearch }}>Edit {kind}</ParticipantActionLinkLink>
      {allowDelete && <ButtonDangerButton type="button" disabled={mutation.pending} onClick={async () => {
        if (mutation.pending || !window.confirm(`Delete ${kind} "${name}" from "${parentName}"? This permanently removes this record. Referenced records cannot be deleted; no related records will be removed.`)) return;
        const result = await mutation.run(remove);
        if (result) { clean(); onDeleted(); }
      }}>{mutation.pending ? 'Deleting…' : `Delete ${kind}`}</ButtonDangerButton>}
    </ActionsDiv>
    {mutation.error && <FormErrorP role="alert">{mutation.error}</FormErrorP>}
  </div>;
}
