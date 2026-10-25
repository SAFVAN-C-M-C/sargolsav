import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { categoriesApi } from '../../../api/catalogApi';
import { resultsApi } from '../../../api/resultsApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import type { ResultDraft } from '../../../types/adminResults';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { DraftManager } from './DraftManager';
import { ResultLifecycleWorkspace } from './ResultLifecycleWorkspace';
import type { EventResult } from '../../../types/resultLifecycle';

const labels = { not_started: 'Awaiting', draft: 'Draft', reviewed: 'Reviewed', published: 'Published' };
export function ResultsWorkspace({ competitionId }: { competitionId: string }) {
  const { request } = useAdminAuth(); const [params] = useSearchParams();
  const load = useCallback(async (signal: AbortSignal) => {
    const [categories, results] = await Promise.all([categoriesApi(request, competitionId).list(signal), resultsApi.statuses(request, competitionId, signal)]);
    if (results.some((row) => !categories.some((category) => category.id === row.category_id)) || new Set(results.map((row) => row.event_id)).size !== results.length) throw new Error('Invalid result catalog');
    return { categories, results };
  }, [request, competitionId]);
  const { state, retry, update } = useAdminResource(load);
  const [notice, setNotice] = useState<{ event: string; text: string }>();
  const onState = useCallback((result: EventResult) => update((data) => ({ ...data, results: data.results.map((row) => row.event_id === result.event_id && row.category_id === result.category_id ?
    { ...row, status: result.status, event_result_id: result.id, updated_at: result.updated_at, active_correction_id: result.active_correction_id } : row) })), [update]);
  if (state.status === 'loading') return <DashboardLoading>Loading result statuses…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>Result categories and statuses could not be loaded. Try again.</DashboardError>;
  const categoryId = params.get('category'); const eventId = params.get('event');
  const selected = state.data.results.find((row) => row.category_id === categoryId && row.event_id === eventId);
  const category = state.data.categories.find((row) => row.id === categoryId);
  const accept = (draft: ResultDraft) => update((data) => ({ ...data, results: data.results.map((row) => row.event_id === draft.event_id && row.category_id === draft.category_id ?
    { ...row, status: 'draft', event_result_id: draft.id, updated_at: draft.updated_at } : row) }));
  return <>
    <p>Enter private drafts, verify saved winners, review results, and publish with confirmation. Published changes use separate private corrections.</p>
    {notice?.event === eventId && <p role="status" className="admin-success">{notice.text}</p>}
    {state.data.categories.length === 0 ? <div className="dashboard-panel"><h3>No categories yet</h3><p>Create categories and events before entering winners.</p></div> : <>
      <nav className="competition-picker" aria-label="Result categories"><Link to={{ pathname: '/admin/results', search: participantSearch(params, { category: null, event: null, correction: null, resultView: null }) }}>All categories</Link>
        {state.data.categories.map((item) => <Link key={item.id} aria-current={categoryId === item.id ? 'page' : undefined} to={{ pathname: '/admin/results', search: participantSearch(params, { category: item.id, event: null, correction: null, resultView: null }) }}>{item.name}</Link>)}
      </nav>
      {categoryId && !category && <p role="alert">Category unavailable in this competition. Choose another category.</p>}
      {state.data.categories.filter((item) => !categoryId || item.id === categoryId).map((item) => <section key={item.id} className="result-category" aria-label={`Results for ${item.name}`}><h3>{item.name}</h3>
        {state.data.results.filter((row) => row.category_id === item.id).length === 0 ? <p>No events in this category.</p> : <ul className="participant-list">{state.data.results.filter((row) => row.category_id === item.id).map((row) => <li key={row.event_id}><Link aria-current={selected === row ? 'page' : undefined}
          to={{ pathname: '/admin/results', search: participantSearch(params, { category: item.id, event: row.event_id, correction: null, resultView: null }) }}><span>{row.event_name}</span>{' '}<span className="result-entry-status">{labels[row.status]}{row.active_correction_id ? ' · Correction in Progress' : ''}</span></Link></li>)}</ul>}
      </section>)}
    </>}
    {eventId && !selected && <p role="alert">Event unavailable in the selected category.</p>}
    {selected && category && <section className="result-editor" aria-label={`Result entry for ${selected.event_name}`}><h3>{selected.event_name}</h3>
      {selected.status === 'reviewed' || selected.status === 'published' || params.get('resultView') ?
        <ResultLifecycleWorkspace key={`${competitionId}/${category.id}/${selected.event_id}`} scope={{ competitionId, categoryId: category.id, eventId: selected.event_id }} onState={onState} notify={(text) => setNotice({ event: selected.event_id, text })} /> :
        <>{selected.status === 'draft' && <Link className="back-link" to={{ pathname: '/admin/results', search: participantSearch(params, { resultView: 'review', correction: null }) }}>Review saved result</Link>}
          <DraftManager key={`${competitionId}/${category.id}/${selected.event_id}`} scope={{ competitionId, categoryId: category.id, eventId: selected.event_id }} categoryName={category.name} onConfirmed={accept} /></>}
    </section>}
  </>;
}
