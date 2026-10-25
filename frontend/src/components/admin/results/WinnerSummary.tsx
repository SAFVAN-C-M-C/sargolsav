import type { LifecycleEntry, PublishedWinner } from '../../../types/resultLifecycle';

export function WinnerSummary({ entries, eventName, categoryName, title = 'Winners for verification' }: { entries: LifecycleEntry[]; eventName: string; categoryName: string; title?: string }) {
  return <section className="winner-summary" aria-label={title}><h4>{title}</h4><p>Event: <strong>{eventName}</strong><br />Category: <strong>{categoryName}</strong></p>
    {entries.length === 0 ? <p>No winners recorded.</p> : <ol className="verification-winners">{entries.map((entry) => <li key={entry.id}><strong>Position {entry.position}: {entry.name}</strong>
      <dl><div><dt>External candidate ID</dt><dd><bdi>{entry.candidate_code}</bdi></dd></div><div><dt>Unit</dt><dd>{entry.unit_name}</dd></div><div><dt>Madrassa</dt><dd>{entry.madrasa_id === null ? 'None' : entry.madrasa_name ?? 'Unavailable'}</dd></div></dl>
    </li>)}</ol>}
  </section>;
}

export function PublishedWinners({ winners }: { winners: PublishedWinner[] }) {
  return <ol className="verification-winners">{winners.map((winner, index) => <li key={`${winner.candidate_code}-${index}`}><strong>Position {winner.position}: {winner.name}</strong>
    <p>External candidate ID: <bdi>{winner.candidate_code}</bdi><br />Unit: {winner.unit.name}<br />Madrassa: {winner.madrasa?.name ?? 'None'}</p>
  </li>)}</ol>;
}
