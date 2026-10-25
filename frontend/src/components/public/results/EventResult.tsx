import { CandidateCodeP, EventHeadingDiv, EyebrowP, PositionHeadingDiv, PositionNumberSpan, ResultStatusIsPublishedPublicationLabelP, SharedLabelSpan, WinnerAffiliationDl, WinnerCardLi, WinnerListUl, WinnerPositionSection, WinnerPositionsDiv } from '../../../styles/components';
import { useEffect, useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { PublicApiError } from '../../../api/publicErrors';
import { usePollingResource } from '../../../hooks/publicResource';
import type { PublicApi } from '../../../types/publicApi';
import type { Winner } from '../../../types/public';
import { categoryPath } from '../../../utils/publicPaths';
import { EmptyState, ErrorState, LoadingCards } from '../../common/PublicStates';
import { RefreshStatus } from '../../common/RefreshStatus';

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
  return <section aria-labelledby="winners-title"><h3 id="winners-title">Published winners</h3>
    <WinnerPositionsDiv>{[...positions].map(([position, group]) => <WinnerPositionSection key={position}
       aria-label={positionLabel(position)}>
      <PositionHeadingDiv position={position}><h4><PositionNumberSpan aria-hidden="true">{position}</PositionNumberSpan>{positionLabel(position)}</h4>
        {group.length > 1 && <SharedLabelSpan>Shared position · {group.length} winners</SharedLabelSpan>}</PositionHeadingDiv>
      <WinnerListUl>{group.map((winner, index) => <WinnerCardLi key={`${winner.candidate_code ?? ''}-${index}`}>
        <h5>{text(winner.name, 'Candidate name unavailable')}</h5>
        <CandidateCodeP>Candidate code: <bdi>{text(winner.candidate_code, 'Unavailable')}</bdi></CandidateCodeP>
        <WinnerAffiliationDl><div><dt>Unit</dt><dd>{text(winner.unit?.name, 'Unit unavailable')}</dd></div>
          {winner.madrasa?.name?.trim() && <div><dt>Madrassa</dt><dd>{winner.madrasa.name}</dd></div>}</WinnerAffiliationDl>
      </WinnerCardLi>)}</WinnerListUl>
    </WinnerPositionSection>)}</WinnerPositionsDiv>
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
  return <section aria-labelledby="event-title"><EventHeadingDiv><EyebrowP variant="public">{result?.category_name ?? categoryName}</EyebrowP>
    <h2 id="event-title">{result?.event_name ?? eventName}</h2></EventHeadingDiv>
    <RefreshStatus state={state} retry={entry.retry} />
    {state.status === 'loading' ? <LoadingCards label="Loading published result" /> : state.status === 'error' ?
      state.error instanceof PublicApiError && [400, 404].includes(state.error.status) ?
        <EmptyState title="Event unavailable">This event is no longer available. <Link to={categoryPath(competitionId, categoryId)}>Browse events</Link>.</EmptyState> :
        <ErrorState retry={entry.retry} /> : state.data === null ?
        <EmptyState title="Awaiting Result">The winners for this event have not been published yet. Please check back later.</EmptyState> :
        <><ResultStatusIsPublishedPublicationLabelP>Published</ResultStatusIsPublishedPublicationLabelP><Winners winners={state.data.winners} /></>}
  </section>;
}
