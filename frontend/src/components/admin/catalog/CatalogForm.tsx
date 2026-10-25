import { AdminFormDashboardPanelForm, BackLinkLink, AppButton, FormErrorP, FormInput, FieldLabel, SrOnlyLegend } from '../../../styles/components';
import { useId, useState } from 'react';

import { catalogNameError, catalogOrderError } from '../../../api/catalogApi';
import { useAdminMutation } from '../../../hooks/useAdminMutation';
import { useUnsavedAdminForm } from '../../../hooks/useUnsavedAdminForm';
import type { AdminCategory, CatalogChanges } from '../../../types/adminCatalog';

export function CatalogForm({ kind, initialName = '', initialOrder = 0, editing = false, cancelSearch, save, onSaved }: {
  kind: 'category' | 'event'; initialName?: string; initialOrder?: number; editing?: boolean; cancelSearch: string;
  save: (changes: CatalogChanges, signal: AbortSignal) => Promise<AdminCategory>;
  onSaved: (entity: AdminCategory) => void;
}) {
  const [name, setName] = useState(initialName);
  const [displayOrder, setDisplayOrder] = useState(String(initialOrder));
  const [validation, setValidation] = useState<{ name?: string; order?: string }>({});
  const inputId = useId();
  const mutation = useAdminMutation();
  const dirty = name !== initialName || displayOrder !== String(initialOrder);
  const clean = useUnsavedAdminForm(dirty || mutation.pending);
  const title = `${editing ? 'Edit' : 'Create'} ${kind}`;
  return <AdminFormDashboardPanelForm aria-label={title} noValidate onSubmit={async (event) => {
    event.preventDefault(); if (mutation.pending) return;
    const errors = { name: catalogNameError(name), order: catalogOrderError(displayOrder) }; setValidation(errors);
    if (errors.name || errors.order || (editing && !dirty)) return;
    const changes = { ...(!editing || name !== initialName ? { name } : {}), ...(!editing || Number(displayOrder) !== initialOrder ? { sort_order: Number(displayOrder) } : {}) };
    if (!Object.keys(changes).length) { clean(); setDisplayOrder(String(initialOrder)); return; }
    const result = await mutation.run((signal) => save(changes, signal));
    if (result) { clean(); onSaved(result.data); }
  }}>
    <h3>{title}</h3>
    <fieldset disabled={mutation.pending}>
      <SrOnlyLegend>{title} details</SrOnlyLegend>
      <FieldLabel htmlFor={inputId}>{kind === 'category' ? 'Category' : 'Event'} name</FieldLabel>
      <FormInput id={inputId} value={name} required aria-invalid={Boolean(validation.name)} aria-describedby={validation.name ? `${inputId}-name-error` : undefined} onChange={(event) => setName(event.target.value)} />
      {validation.name && <FormErrorP id={`${inputId}-name-error`} role="alert">{validation.name}</FormErrorP>}
      <FieldLabel htmlFor={`${inputId}-order`}>Display order</FieldLabel>
      <FormInput id={`${inputId}-order`} value={displayOrder} inputMode="numeric" required aria-invalid={Boolean(validation.order)} aria-describedby={`${inputId}-order-help${validation.order ? ` ${inputId}-order-error` : ''}`} onChange={(event) => setDisplayOrder(event.target.value)} />
      <p id={`${inputId}-order-help`}>Use a whole number from 0 to 2147483647. Lower numbers appear first. Equal orders use ascending record ID.</p>
      {validation.order && <FormErrorP id={`${inputId}-order-error`} role="alert">{validation.order}</FormErrorP>}
      <AppButton type="submit" disabled={editing && !dirty}>{mutation.pending ? 'Saving…' : `${editing ? 'Save' : 'Create'} ${kind}`}</AppButton>
    </fieldset>
    {mutation.error && <FormErrorP role="alert">{mutation.error}</FormErrorP>}
    <BackLinkLink to={{ pathname: '/admin/categories', search: cancelSearch }}>Cancel</BackLinkLink>
  </AdminFormDashboardPanelForm>;
}
