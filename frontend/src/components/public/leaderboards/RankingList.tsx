import { CandidateCodeP, RankingAchievementsDetails, RankingBodyDiv, RankingListOl, RankingRankSpan, RankingRowLi, RankingScoreDiv, RankingSummaryDiv, RankingWinsP, SrOnlySpan, WinnerAffiliationRankingAffiliationDl } from '../../../styles/components';
import type { Ranking } from '../../../types/public';

export function RankingList({ rows, candidates }: { rows: Ranking[]; candidates: boolean }) {
  const rankCounts = new Map<string, number>();
  for (const row of rows) rankCounts.set(row.rank, (rankCounts.get(row.rank) ?? 0) + 1);
  return <RankingListOl aria-label={candidates ? 'Candidate rankings' : 'Unit rankings'}>
    {rows.map((row) => {
      const candidate = candidates && 'candidate_id' in row ? row : undefined;
      const shared = (rankCounts.get(row.rank) ?? 0) > 1;
      return <RankingRowLi key={candidate?.candidate_id ?? row.unit_id}>
        <RankingRankSpan rank={row.rank}><SrOnlySpan>Rank </SrOnlySpan>{row.rank}</RankingRankSpan>
        <RankingBodyDiv><RankingSummaryDiv>
          <h3>{candidate ? candidate.candidate_name : row.unit_name}</h3>
          <RankingScoreDiv><strong>{row.total_points}</strong><span>points</span></RankingScoreDiv>
        </RankingSummaryDiv>
        {candidate && <><CandidateCodeP>Candidate code: <bdi>{candidate.candidate_code}</bdi></CandidateCodeP>
          <WinnerAffiliationRankingAffiliationDl><div><dt>Unit</dt><dd>{row.unit_name}</dd></div>
            {candidate.madrasa_name?.trim() && <div><dt>Madrassa</dt><dd>{candidate.madrasa_name}</dd></div>}</WinnerAffiliationRankingAffiliationDl></>}
        <RankingWinsP>{row.winning_entries} {row.winning_entries === '1' ? 'winning entry' : 'winning entries'}{shared && <span> · Shared rank</span>}</RankingWinsP>
        {Object.keys(row.position_wins).length > 0 && <RankingAchievementsDetails><summary>Position wins</summary>
          <dl>{Object.entries(row.position_wins).sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)
            .map(([position, count]) => <div key={position}><dt>Position {position}</dt><dd>{count} {count === '1' ? 'win' : 'wins'}</dd></div>)}</dl>
        </RankingAchievementsDetails>}
        </RankingBodyDiv>
      </RankingRowLi>;
    })}
  </RankingListOl>;
}
