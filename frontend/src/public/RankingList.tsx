import type { Ranking } from './publicApi';

export function RankingList({ rows, candidates }: { rows: Ranking[]; candidates: boolean }) {
  const rankCounts = new Map<string, number>();
  for (const row of rows) rankCounts.set(row.rank, (rankCounts.get(row.rank) ?? 0) + 1);
  return <ol className="ranking-list" aria-label={candidates ? 'Candidate rankings' : 'Unit rankings'}>
    {rows.map((row) => {
      const candidate = candidates && 'candidate_id' in row ? row : undefined;
      const shared = (rankCounts.get(row.rank) ?? 0) > 1;
      return <li key={candidate?.candidate_id ?? row.unit_id} className={`ranking-row rank-${['1', '2', '3'].includes(row.rank) ? row.rank : 'other'}`}>
        <span className="ranking-rank"><span className="sr-only">Rank </span>{row.rank}</span>
        <div className="ranking-body"><div className="ranking-summary">
          <h3>{candidate ? candidate.candidate_name : row.unit_name}</h3>
          <div className="ranking-score"><strong>{row.total_points}</strong><span>points</span></div>
        </div>
        {candidate && <><p className="candidate-code">Candidate code: <bdi>{candidate.candidate_code}</bdi></p>
          <dl className="winner-affiliation ranking-affiliation"><div><dt>Unit</dt><dd>{row.unit_name}</dd></div>
            {candidate.madrasa_name?.trim() && <div><dt>Madrassa</dt><dd>{candidate.madrasa_name}</dd></div>}</dl></>}
        <p className="ranking-wins">{row.winning_entries} {row.winning_entries === '1' ? 'winning entry' : 'winning entries'}{shared && <span> · Shared rank</span>}</p>
        {Object.keys(row.position_wins).length > 0 && <details className="ranking-achievements"><summary>Position wins</summary>
          <dl>{Object.entries(row.position_wins).sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)
            .map(([position, count]) => <div key={position}><dt>Position {position}</dt><dd>{count} {count === '1' ? 'win' : 'wins'}</dd></div>)}</dl>
        </details>}
        </div>
      </li>;
    })}
  </ol>;
}
