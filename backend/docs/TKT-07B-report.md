# TKT-07B delivery report

Implemented the public category-wise candidate leaderboard at
`GET /api/competitions/:competitionId/categories/:categoryId/leaderboard/candidates`.
The contract and example response are in [candidate-leaderboard-api.md](candidate-leaderboard-api.md).

## Scoring and ranking

Reuse TKT-07A's `publishedScoresSql` unchanged. A shared internal aggregation
groups positions, points and counts for either unit ID or candidate code. Both
leaderboards use shared validation, transactions and parent checks. No scoring
rules are duplicated and the existing unit endpoint retains its contract.

Candidate winnings across events aggregate by the exact published external code,
then join the scoped registered candidate roster. Codes are unique within a
competition and immutable through supported APIs. Same-unit candidates and codes
such as `001` and `1` remain distinct. Candidate IDs, names and current unit/
Madrassa metadata come from registered records; name corrections preserve scores.

Only the latest publication for each currently published event contributes.
Shared winners each receive full current configured points. Pending corrections
do not replace published scores; applied corrections do, without summing history.
Every registered category candidate appears once, including zero-score candidates.
Missing settings or removed positions award zero while published wins still count.

Rank uses descending numeric points with shared ranks (1, 1, 3). Tied display order
uses lowercase name, exact name, external code, then candidate ID. Name/code
ordering and win counts do not break ranks. All numeric aggregates remain exact
decimal strings. Optional Madrassa ID/name are both null when absent. Internal
timestamps, audit and review/correction fields are excluded.

## Database and scope

Three fixed SQL calls validate competition, validate category membership, and
aggregate standings. The aggregation reads publications, current settings,
roster, metadata and ranks in one PostgreSQL MVCC statement snapshot. There are
no per-candidate queries or Node.js entry-by-entry sums.

Existing candidate category/code indexes, unit/Madrassa keys and TKT-07A publication
indexes suffice. No migration, index, RLS/grant change, dependency, stored total,
cache or worker is introduced. Frontend, overall unit rankings and live updates
remain outside scope. Production-volume benchmarking is not claimed. Direct SQL
changes to immutable candidate identities remain outside supported workflows.

## Files changed

- `src/services/scoring.js`: shared aggregation/validation and candidate standings.
- `src/routes/leaderboards.js`: public candidate GET endpoint.
- `test/candidate-leaderboards.test.js`: HTTP access, validation, production mounting,
  sanitized errors and rejected writes.
- `test/candidate-leaderboards.integration.test.js`: PostgreSQL candidate scoring,
  correction, identity, metadata, ranking and isolation coverage.
- `docs/candidate-leaderboard-api.md`: endpoint contract and implementation notes.
- `docs/scoring-api.md`: link to the candidate scorer and current scope.
- `docs/TKT-07B-report.md`: delivery and verification report.
- Root `README.md`: project capability and documentation links.

## Verification and environment

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Focused candidate/unit HTTP and PostgreSQL tests | Eight passed, zero failures/skips |
| `npm test` backend | 167 passed, zero failures/skips |
| `npm test` frontend | 14 passed across two files |

Integration coverage includes repeated wins per candidate, same-unit candidates,
shared winners, draft/review exclusion, registered zero-score candidates, pending
and published corrections, history exclusion, dynamic/empty/missing settings,
large exact totals, ties and external code ordering, optional Madrassa metadata,
name changes, empty categories, cross-competition/category isolation, invalid and
missing IDs, rejected writes, uncommitted settings and real SQL error recovery.
Every previous test remains and passed.

Verification used the installed PostgreSQL 17.4 binaries with temporary isolated
clusters bound to loopback, plus the existing isolated-schema harness. An initial
Windows launcher wait was corrected before verification; the final focused/full
runs passed. All temporary clusters were stopped and removed. The configured
hosted database, credentials and environment files were unchanged. Database URLs,
TLS mode and PostgreSQL-required flags were set only in the test process. Ignored
logs and generated frontend build files are not committed.

Changes are committed locally in implementation/tests and documentation groups.
Exact hashes and final working-tree status are supplied in the final chat report.
No push, merge, rebase or deployment is performed.
