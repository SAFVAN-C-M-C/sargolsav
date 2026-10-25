import { AdminSuccessP, CatalogListOrderSpan, DashboardPanelDiv, EyebrowP, ParticipantActionLinkLink, ParticipantListCatalogListUl, SectionHeadingParticipantSectionHeadingDiv } from '../../../styles/components';
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
    <SectionHeadingParticipantSectionHeadingDiv><h3 id="events-title">Events in {categoryName}</h3>
      {!creating && <ParticipantActionLinkLink to={{ pathname: '/admin/categories', search: participantSearch(params, { catalogForm: 'new-event', event: null }) }}>New event</ParticipantActionLinkLink>}
    </SectionHeadingParticipantSectionHeadingDiv>
    {success && <AdminSuccessP role="status">{success}</AdminSuccessP>}
    {state.status === 'loading' && <DashboardLoading>Loading events…</DashboardLoading>}
    {state.status === 'error' && <DashboardError retry={retry}>Events could not be loaded. Check your connection and try again.</DashboardError>}
    {state.status === 'ready' && <><p>{state.data.length} {state.data.length === 1 ? 'event' : 'events'}</p>
      {state.data.length ? <ParticipantListCatalogListUl aria-label="Events">{state.data.map((event) => <li key={event.id}><Link aria-current={!creating && event.id === eventId ? 'page' : undefined}
        to={{ pathname: '/admin/categories', search: participantSearch(params, { event: event.id, catalogForm: null }) }}><span>{event.name}</span>{' '}<CatalogListOrderSpan>Order: {event.sort_order}</CatalogListOrderSpan></Link></li>)}</ParticipantListCatalogListUl> :
        <DashboardPanelDiv><h4>No events yet</h4><p>This category has no events. Add an event when ready.</p></DashboardPanelDiv>}
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
  return <DashboardPanelDiv><EyebrowP>Event details</EyebrowP><h4>{event.name}</h4><p>Parent category: {categoryName}</p><p>Display order: {event.sort_order}</p>
    <CatalogActions kind="event" name={event.name} parentName={categoryName}
      editSearch={participantSearch(params, { catalogForm: 'event' })}
      remove={(signal) => eventsApi(request, competitionId, categoryId).remove(eventId, signal)} onDeleted={onDeleted} />
  </DashboardPanelDiv>;
}
