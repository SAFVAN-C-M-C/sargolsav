import { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { PublicApiError, usePollingResource } from './publicApi';
import type { PublicApi } from './publicApi';
import { categoryPath, eventPath } from './publicPaths';
import { EmptyState, ErrorState, LoadingCards } from './PublicStates';
import { EventResult } from './EventResult';
import { RefreshStatus } from './RefreshStatus';

export function EventBrowser({ competitionId, categoryId, eventId }: {
  competitionId: string; categoryId: string; eventId?: string;
}) {
  const api = useOutletContext<PublicApi>();
  const entry = useMemo(() => api.events(competitionId, categoryId), [api, competitionId, categoryId]);
  const state = usePollingResource(entry, eventId === undefined);
  if (state.status === 'loading') return <LoadingCards label="Loading events" />;
  if (state.status === 'error') return state.error instanceof PublicApiError && [400, 404].includes(state.error.status) ?
    <EmptyState title="Category unavailable">This category is no longer available. Please return to the competition to browse categories.</EmptyState> :
    <ErrorState retry={entry.retry} />;
  if (eventId) {
    const event = state.data.events.find((item) => item.id === eventId);
    if (!event) return <EmptyState title="Event not found">This event is not available in this category. <Link to={categoryPath(competitionId, categoryId)}>Browse events</Link>.</EmptyState>;
    return <EventResult competitionId={competitionId} categoryId={categoryId} eventId={eventId}
      eventName={event.name} categoryName={state.data.category.name} />;
  }
  const events = [...state.data.events].sort((a, b) => a.sort_order - b.sort_order || (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0));
  return <section aria-label="Category events"><p className="public-intro">Choose an event to view its published winners.</p>
    <RefreshStatus state={state} retry={entry.retry} />
    {events.length === 0 ? <EmptyState title="Events are on the way">No events have been added to this category yet.</EmptyState> :
      <ul className="category-grid event-grid">{events.map((event) => <li key={event.id}>
        <Link className="category-card event-card" to={eventPath(competitionId, categoryId, event.id)}>
          <span className="category-copy"><strong>{event.name}</strong>
            <span className={`result-status ${event.status === 'published' ? 'is-published' : 'is-awaiting'}`}>
              {event.status === 'published' ? 'Published' : 'Awaiting Result'}
            </span>
          </span><span className="card-arrow" aria-hidden="true">↗</span>
        </Link></li>)}</ul>}
  </section>;
}
