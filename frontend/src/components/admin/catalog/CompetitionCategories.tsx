import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { categoriesApi } from '../../../api/catalogApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { CatalogForm } from './CatalogForm';
import { CategoryDetails } from './CategoryDetails';

export function CompetitionCategories({ competitionId, competitionName }: { competitionId: string; competitionName: string }) {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const [success, setSuccess] = useState('');
  const load = useCallback((signal: AbortSignal) => categoriesApi(request, competitionId).list(signal), [request, competitionId]);
  const { state, retry } = useAdminResource(load);
  const categoryId = params.get('category');
  const creating = params.get('catalogForm') === 'new-category';
  const change = (changes: Record<string, string | null>) => setParams(participantSearch(params, changes));
  return <>
    <div className="section-heading participant-section-heading"><h3>Competition categories</h3>
      {!creating && <Link className="participant-action-link" to={{ pathname: '/admin/categories', search: participantSearch(params, { catalogForm: 'new-category', event: null }) }}>New category</Link>}
    </div>
    {success && <p role="status" className="admin-success">{success}</p>}
    {state.status === 'loading' && <DashboardLoading>Loading categories…</DashboardLoading>}
    {state.status === 'error' && <DashboardError retry={retry}>Categories could not be loaded. Check your connection and try again.</DashboardError>}
    {state.status === 'ready' && (state.data.length ? <ul className="participant-list catalog-list" aria-label="Categories">
      {state.data.map((category) => <li key={category.id}><Link aria-current={!creating && category.id === categoryId ? 'page' : undefined} to={{ pathname: '/admin/categories', search: participantSearch(params, { category: category.id, event: null, catalogForm: null }) }}><span>{category.name}</span>{' '}<span className="catalog-list-order">Order: {category.sort_order}</span></Link></li>)}
    </ul> : <div className="dashboard-panel"><h3>No categories yet</h3><p>Create the first category for this competition. Events can be added later.</p></div>)}
    {creating ? <CatalogForm kind="category" cancelSearch={participantSearch(params, { catalogForm: null })}
      save={(changes, signal) => categoriesApi(request, competitionId).save(changes, signal)} onSaved={(category) => {
        setSuccess('Category created.'); retry(); change({ category: category.id, event: null, catalogForm: null });
      }} /> : categoryId ? <CategoryDetails key={categoryId} competitionId={competitionId} competitionName={competitionName} categoryId={categoryId}
        onChanged={(message) => { retry(); setSuccess(message); }} onDeleted={() => {
          retry(); setSuccess('Category deleted.'); change({ category: null, event: null, catalogForm: null });
        }} /> : state.status === 'ready' && state.data.length > 0 && <p>Select a category to view its details and events.</p>}
  </>;
}
