import { useEffect, useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { PublicApiError, usePollingResource } from './publicApi';
import type { PublicApi, Winner } from './publicApi';
import { categoryPath } from './publicPaths';
import { EmptyState, ErrorState, LoadingCards } from './PublicStates';
import { RefreshStatus } from './RefreshStatus';

function positionLabel(position: number) {
  const lastTwo = position % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[position % 10] ?? 'th');
  return `${position}${suffix} place`;
}
const text = (value: string | null | undefined, fallback: string) => value?.trim() ? value : fallback;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function Winners({ winners }: { winners: Winner[] }) {
  const ordered = [...winners].sort((a, b) => a.position - b.position ||
    compare(a.candidate_code ?? '', b.candidate_code ?? '') || compare(a.name ?? '', b.name ?? '') ||
    compare(a.unit?.name ?? '', b.unit?.name ?? '') || compare(a.madrasa?.name ?? '', b.madrasa?.name ?? ''));
  const positions = new Map<number, Winner[]>();
  for (const winner of ordered) positions.set(winner.position, [...(positions.get(winner.position) ?? []), winner]);
  if (!winners.length) return <EmptyState title="Winner details unavailable">This published result has no winner details to display.</EmptyState>;
  return <section aria-labelledby="winners-title"><h3 id="winners-title" className="eyebrow">Published winners</h3>
    <div className="winner-positions">{[...positions].map(([position, group]) => <section key={position}
      className={`winner-position position-${position <= 3 ? position : 'other'}`} aria-label={positionLabel(position)}>
      <div className="position-heading"><h4><span className="position-number" aria-hidden="true">{position}</span>{positionLabel(position)}</h4>
        {group.length > 1 && <span className="shared-label">Shared position · {group.length} winners</span>}</div>
      <ul className="winner-list">{group.map((winner, index) => <li key={`${winner.candidate_code ?? ''}-${index}`} className="winner-card">
        <h5>{text(winner.name, 'Candidate name unavailable')}</h5>
        <p className="candidate-code">Candidate code: <bdi>{text(winner.candidate_code, 'Unavailable')}</bdi></p>
        <dl className="winner-affiliation"><div><dt>Unit</dt><dd>{text(winner.unit?.name, 'Unit unavailable')}</dd></div>
          {winner.madrasa?.name?.trim() && <div><dt>Madrassa</dt><dd>{winner.madrasa.name}</dd></div>}</dl>
      </li>)}</ul>
    </section>)}</div>
  </section>;
}

export function EventResult({ competitionId, categoryId, eventId, eventName, categoryName }: {
  competitionId: string; categoryId: string; eventId: string; eventName: string; categoryName: string;
}) {
  const api = useOutletContext<PublicApi>();
  const entry = useMemo(() => api.eventResult(competitionId, categoryId, eventId), [api, competitionId, categoryId, eventId]);
  const state = usePollingResource(entry);
  const result = state.status === 'ready' ? state.data : null;
  useEffect(() => { document.title = `${result?.event_name ?? eventName} · ${result?.category_name ?? categoryName} · Sargolsav`; }, [result, eventName, categoryName]);
  return <section aria-labelledby="event-title"><div className="event-heading"><p className="eyebrow">{result?.category_name ?? categoryName}</p>
    <h2 id="event-title">{result?.event_name ?? eventName}</h2></div>
    <RefreshStatus state={state} retry={entry.retry} />
    {state.status === 'loading' ? <LoadingCards label="Loading published result" /> : state.status === 'error' ?
      state.error instanceof PublicApiError && [400, 404].includes(state.error.status) ?
        <EmptyState title="Event unavailable">This event is no longer available. <Link to={categoryPath(competitionId, categoryId)}>Browse events</Link>.</EmptyState> :
        <ErrorState retry={entry.retry} /> : state.data === null ?
        <EmptyState title="Awaiting Result">The winners for this event have not been published yet. Please check back later.</EmptyState> :
        <><p className="result-status is-published publication-label">Published</p><Winners winners={state.data.winners} /></>}
  </section>;
}
