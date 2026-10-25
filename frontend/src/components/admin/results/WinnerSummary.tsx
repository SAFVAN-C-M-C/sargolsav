import { SharedPositionNoticeP, VerificationWinnersOl, } from '../../../styles/components';
import type { LifecycleEntry, PublishedWinner } from '../../../types/resultLifecycle';
import { sharedGroups } from '../../../utils/sharedPositions';

export function WinnerSummary({ entries, eventName, categoryName, title = 'Winners for verification' }: { entries: LifecycleEntry[]; eventName: string; categoryName: string; title?: string }) {
  return <section aria-label={title}><h4>{title}</h4><p>Event: <strong>{eventName}</strong><br />Category: <strong>{categoryName}</strong></p>
    {sharedGroups(entries).map((group) => <SharedPositionNoticeP key={group.position}><strong>Shared position {group.position}</strong>: {group.winners.map((entry) => `${entry.candidate_code} · ${entry.name}`).join('; ')}. Each winner receives the full configured points.</SharedPositionNoticeP>)}
    {entries.length === 0 ? <p>No winners recorded.</p> : <VerificationWinnersOl>{entries.map((entry) => <li key={entry.id}><strong>Position {entry.position}: {entry.name}</strong>
      <dl><div><dt>External candidate ID</dt><dd><bdi>{entry.candidate_code}</bdi></dd></div><div><dt>Unit</dt><dd>{entry.unit_name}</dd></div><div><dt>Madrassa</dt><dd>{entry.madrasa_id === null ? 'None' : entry.madrasa_name ?? 'Unavailable'}</dd></div></dl>
    </li>)}</VerificationWinnersOl>}
  </section>;
}

export function PublishedWinners({ winners }: { winners: PublishedWinner[] }) {
  return <VerificationWinnersOl>{winners.map((winner, index) => <li key={`${winner.candidate_code}-${index}`}><strong>Position {winner.position}: {winner.name}</strong>
    <p>External candidate ID: <bdi>{winner.candidate_code}</bdi><br />Unit: {winner.unit.name}<br />Madrassa: {winner.madrasa?.name ?? 'None'}</p>
  </li>)}</VerificationWinnersOl>;
}
