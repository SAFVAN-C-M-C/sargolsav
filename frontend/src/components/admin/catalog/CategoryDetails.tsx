import { DashboardPanelDiv, EyebrowP, ParticipantDetailSection } from '../../../styles/components';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { categoriesApi } from '../../../api/catalogApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { CatalogForm } from './CatalogForm';
import { CatalogActions } from './CatalogActions';
import { EventWorkspace } from './EventWorkspace';

export function CategoryDetails({ competitionId, competitionName, categoryId, onChanged, onDeleted }: {
  competitionId: string; competitionName: string; categoryId: string;
  onChanged: (message: string) => void; onDeleted: () => void;
}) {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const load = useCallback((signal: AbortSignal) => categoriesApi(request, competitionId).get(categoryId, signal), [request, competitionId, categoryId]);
  const { state, retry } = useAdminResource(load);
  if (state.status === 'loading') return <DashboardLoading>Loading category details…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>This category could not be loaded in the selected competition. Choose a category from the list or retry.</DashboardError>;
  const category = state.data;
  const form = params.get('catalogForm');
  return <ParticipantDetailSection aria-labelledby="category-details-title">
    <DashboardPanelDiv><EyebrowP>Category details</EyebrowP><h3 id="category-details-title">{category.name}</h3>
      <p>Display order: {category.sort_order}</p>
      {form !== 'category' && <CatalogActions kind="category" name={category.name} parentName={competitionName}
        editSearch={participantSearch(params, { catalogForm: 'category', event: null })}
        allowDelete={form !== 'event' && form !== 'new-event'}
        remove={(signal) => categoriesApi(request, competitionId).remove(categoryId, signal)} onDeleted={onDeleted} />}
    </DashboardPanelDiv>
    {form === 'category' ? <CatalogForm kind="category" editing initialName={category.name} initialOrder={category.sort_order}
      cancelSearch={participantSearch(params, { catalogForm: null })}
      save={(changes, signal) => categoriesApi(request, competitionId).save(changes, signal, categoryId)} onSaved={() => {
        onChanged('Category saved.'); retry(); setParams(participantSearch(params, { catalogForm: null }));
      }} /> : <EventWorkspace competitionId={competitionId} categoryId={categoryId} categoryName={category.name} />}
  </ParticipantDetailSection>;
}
