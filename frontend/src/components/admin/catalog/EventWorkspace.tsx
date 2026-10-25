import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { eventsApi } from '../../../api/catalogApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import { participantSearch } from '../../../utils/participantPaths';
import { DashboardError, DashboardLoading } from '../DashboardStates';
import { CatalogForm } from './CatalogForm';
import { CatalogActions } from './CatalogActions';

export function EventWorkspace({ competitionId, categoryId, categoryName }: { competitionId: string; categoryId: string; categoryName: string }) {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const [success, setSuccess] = useState('');
  const load = useCallback((signal: AbortSignal) => eventsApi(request, competitionId, categoryId).list(signal), [request, competitionId, categoryId]);
  const { state, retry } = useAdminResource(load);
  const creating = params.get('catalogForm') === 'new-event';
  const eventId = params.get('event');
  return <section aria-labelledby="events-title">
    <div className="section-heading participant-section-heading"><h3 id="events-title">Events in {categoryName}</h3>
      {!creating && <Link className="participant-action-link" to={{ pathname: '/admin/categories', search: participantSearch(params, { catalogForm: 'new-event', event: null }) }}>New event</Link>}
    </div>
    {success && <p role="status" className="admin-success">{success}</p>}
    {state.status === 'loading' && <DashboardLoading>Loading events…</DashboardLoading>}
    {state.status === 'error' && <DashboardError retry={retry}>Events could not be loaded. Check your connection and try again.</DashboardError>}
    {state.status === 'ready' && <><p>{state.data.length} {state.data.length === 1 ? 'event' : 'events'}</p>
      {state.data.length ? <ul className="participant-list catalog-list" aria-label="Events">{state.data.map((event) => <li key={event.id}><Link aria-current={!creating && event.id === eventId ? 'page' : undefined}
        to={{ pathname: '/admin/categories', search: participantSearch(params, { event: event.id, catalogForm: null }) }}><span>{event.name}</span>{' '}<span className="catalog-list-order">Order: {event.sort_order}</span></Link></li>)}</ul> :
        <div className="dashboard-panel"><h4>No events yet</h4><p>This category has no events. Add an event when ready.</p></div>}
    </>}
    {creating ? <CatalogForm kind="event" cancelSearch={participantSearch(params, { catalogForm: null })}
      save={(changes, signal) => eventsApi(request, competitionId, categoryId).save(changes, signal)} onSaved={(event) => {
        setSuccess('Event created.'); retry(); setParams(participantSearch(params, { event: event.id, catalogForm: null }));
      }} /> : eventId && <EventDetails key={eventId} competitionId={competitionId} categoryId={categoryId} categoryName={categoryName} eventId={eventId}
        onChanged={() => { retry(); setSuccess('Event saved.'); }} onDeleted={() => {
          retry(); setSuccess('Event deleted.'); setParams(participantSearch(params, { event: null, catalogForm: null }));
        }} />}
  </section>;
}

function EventDetails({ competitionId, categoryId, categoryName, eventId, onChanged, onDeleted }: {
  competitionId: string; categoryId: string; categoryName: string; eventId: string;
  onChanged: () => void; onDeleted: () => void;
}) {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const load = useCallback((signal: AbortSignal) => eventsApi(request, competitionId, categoryId).get(eventId, signal), [request, competitionId, categoryId, eventId]);
  const { state, retry } = useAdminResource(load);
  if (state.status === 'loading') return <DashboardLoading>Loading event details…</DashboardLoading>;
  if (state.status === 'error') return <DashboardError retry={retry}>This event could not be loaded under this category. Choose another event or retry.</DashboardError>;
  const event = state.data;
  if (params.get('catalogForm') === 'event') return <CatalogForm kind="event" editing initialName={event.name} initialOrder={event.sort_order}
    cancelSearch={participantSearch(params, { catalogForm: null })}
    save={(changes, signal) => eventsApi(request, competitionId, categoryId).save(changes, signal, eventId)} onSaved={() => {
      onChanged(); retry(); setParams(participantSearch(params, { catalogForm: null }));
    }} />;
  return <div className="dashboard-panel"><p className="eyebrow">Event details</p><h4>{event.name}</h4><p>Parent category: {categoryName}</p><p>Display order: {event.sort_order}</p>
    <CatalogActions kind="event" name={event.name} parentName={categoryName}
      editSearch={participantSearch(params, { catalogForm: 'event' })}
      remove={(signal) => eventsApi(request, competitionId, categoryId).remove(eventId, signal)} onDeleted={onDeleted} />
  </div>;
}
