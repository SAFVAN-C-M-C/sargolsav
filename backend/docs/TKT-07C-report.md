# TKT-07C delivery report

## Endpoint and behavior

Implemented `GET /api/competitions/:competitionId/leaderboard/units`.
The [API contract](overall-leaderboard-api.md) includes the complete example,
formula, ranking, errors, query analysis and integration findings.

Every registered unit appears with ID/name, overall `total_points`, shared `rank`,
`winning_entries` and `position_wins`. IDs and numeric aggregates remain exact
decimal strings. Units without published wins receive zero; a competition without
units returns an empty array. The optional category breakdown is omitted to keep
responses to one row per unit; category details use the existing category endpoint.

Overall points sum each unit's published winnings across every category in the
competition. Each shared-position winner receives full current configured points.
All same-unit candidates contribute, with or without a Madrassa. Only the latest
publication of each currently published event is read. Pending corrections retain
the previous public score, and applied corrections replace the affected event's
score. Drafts, reviewed entries and historical publications do not contribute.
No mutable totals are stored.

Ordering is descending numeric points, with shared SQL ranks (1, 1, 3). Tied units
display alphabetically by lowercase name, exact name, then internal ID, matching
the category unit leaderboard. No win-count or other tie-breaker is introduced.

## Integration findings

All three leaderboards use the same publication/points relation and position/count
aggregation. Overall and category unit standings also share one SQL builder for
the unit roster, aggregation projection, rank and display ordering. Overall scope
omits only the category predicate and bind value; competition scope remains
mandatory. Existing category contracts and exported `publishedScoresSql` remain.

Real workflow/HTTP tests confirmed, after each relevant state/configuration change:

- Candidate totals and winning/position counts sum to category unit values.
- Category unit values sum to overall unit values.
- Shared winners receive full points in every projection.
- Drafts, reviewed results and pending draft/reviewed corrections leave standings
  unchanged. Published corrections update all affected standings without history
  duplication.
- Points changes recalculate all standings, including ties, empty/missing settings
  and totals beyond JavaScript's exact integer range. Uncommitted settings do not
  leak into public reads.
- Repeated requests retain deterministic ranks/display order, and another
  competition's publications/settings never affect the requested competition.

No supported-workflow scoring discrepancy was found. Candidate code/affiliation
invariants remain those of the existing APIs. Direct SQL identity reassignment is
unsupported. Per-response scoring is one MVCC statement snapshot; separate HTTP
requests can straddle a commit and do not share a snapshot token.

## Performance and schema

Overall requests issue two data SQL calls (competition validation, aggregate),
plus the existing transaction wrapper. Category requests retain three. Data
aggregation stays in PostgreSQL and only standings reach Node.js. There are no
N+1 queries, category loops in the handler, cache tables, Redis, jobs or dependencies.

Actual `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` checks used 500 additional events
across two categories, three winners each, and ten publication versions per event
(5,000 additional publication rows). All generated plan fixtures rolled back.
The existing latest-publication index returned one version per eligible event.
Focused local PostgreSQL 17.4 execution times were 1.913 ms for category units,
2.162 ms for category candidates and 3.342 ms for overall units; no temporary
blocks were written. Small result/roster/settings tables used sequential scans.
The API document contains full observation details and measurement limits.

Existing indexes suffice; no confirmed indexing/integrity change was required.
There is no migration, RLS/grant modification or application-schema change.
These local synthetic measurements are not hosted Supabase latency guarantees.

## Files changed

- `src/services/scoring.js`: scope-aware publication relation, shared unit SQL,
  shared validation and overall scoring method.
- `src/routes/leaderboards.js`: public overall GET route.
- `test/overall-leaderboards.test.js`: HTTP access, validation, failures, production
  mounting and rejected modifications.
- `test/overall-leaderboards.integration.test.js`: PostgreSQL workflows,
  cross-leaderboard consistency, isolation and actual query-plan diagnostics.
- `docs/overall-leaderboard-api.md`: API, formula, ranking and integration review.
- `docs/scoring-api.md`, `docs/candidate-leaderboard-api.md`: shared architecture
  references and current scope.
- `docs/TKT-07C-report.md`: delivery/verification report.
- Root `README.md`: capabilities and documentation links.

## Verification and environment

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Focused overall HTTP/integration plus existing scoring integration suites | Six passed, zero failures/skips |
| `npm test` backend | 171 passed, zero failures/skips |
| `npm test` frontend | 14 passed across two files |

All prior tests remain and passed. Verification used the installed PostgreSQL
17.4 binaries and temporary loopback-only cluster with process-only test database
URLs, TLS mode and PostgreSQL-required flags. The isolated-schema harness migrated
and dropped its fixtures. The cluster was stopped and removed. No credentials,
environment files, dependencies or persistent environment settings changed; the
configured hosted database was untouched. Ignored logs and generated build files
are not committed.

Only TKT-07C is implemented: no frontend leaderboard screens, polling or unrelated
functionality. Changes are committed locally in implementation/tests and
documentation groups. Exact hashes and final working-tree status are reported in
the final chat response. No push, merge, rebase or deployment is performed.
