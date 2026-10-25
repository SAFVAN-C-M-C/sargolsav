import { AdminSuccessP, CatalogListOrderSpan, DashboardPanelDiv, ParticipantActionLinkLink, ParticipantListCatalogListUl, SectionHeadingParticipantSectionHeadingDiv } from '../../../styles/components';
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
    <SectionHeadingParticipantSectionHeadingDiv><h3>Competition categories</h3>
      {!creating && <ParticipantActionLinkLink to={{ pathname: '/admin/categories', search: participantSearch(params, { catalogForm: 'new-category', event: null }) }}>New category</ParticipantActionLinkLink>}
    </SectionHeadingParticipantSectionHeadingDiv>
    {success && <AdminSuccessP role="status">{success}</AdminSuccessP>}
    {state.status === 'loading' && <DashboardLoading>Loading categories…</DashboardLoading>}
    {state.status === 'error' && <DashboardError retry={retry}>Categories could not be loaded. Check your connection and try again.</DashboardError>}
    {state.status === 'ready' && (state.data.length ? <ParticipantListCatalogListUl aria-label="Categories">
      {state.data.map((category) => <li key={category.id}><Link aria-current={!creating && category.id === categoryId ? 'page' : undefined} to={{ pathname: '/admin/categories', search: participantSearch(params, { category: category.id, event: null, catalogForm: null }) }}><span>{category.name}</span>{' '}<CatalogListOrderSpan>Order: {category.sort_order}</CatalogListOrderSpan></Link></li>)}
    </ParticipantListCatalogListUl> : <DashboardPanelDiv><h3>No categories yet</h3><p>Create the first category for this competition. Events can be added later.</p></DashboardPanelDiv>)}
    {creating ? <CatalogForm kind="category" cancelSearch={participantSearch(params, { catalogForm: null })}
      save={(changes, signal) => categoriesApi(request, competitionId).save(changes, signal)} onSaved={(category) => {
        setSuccess('Category created.'); retry(); change({ category: category.id, event: null, catalogForm: null });
      }} /> : categoryId ? <CategoryDetails key={categoryId} competitionId={competitionId} competitionName={competitionName} categoryId={categoryId}
        onChanged={(message) => { retry(); setSuccess(message); }} onDeleted={() => {
          retry(); setSuccess('Category deleted.'); change({ category: null, event: null, catalogForm: null });
        }} /> : state.status === 'ready' && state.data.length > 0 && <p>Select a category to view its details and events.</p>}
  </>;
}
