# Category candidate leaderboard (TKT-07B)

`GET /api/competitions/:competitionId/categories/:categoryId/leaderboard/candidates`

Public, read-only and unauthenticated, with `Cache-Control: no-store`. No query
parameters are supported. The response includes every registered candidate in
the requested competition/category, including candidates without published wins.
An empty category returns `{ "leaderboard": [] }`.

```json
{
  "leaderboard": [{
    "candidate_id": "42",
    "candidate_code": "001",
    "candidate_name": "Candidate Name",
    "unit_id": "12",
    "unit_name": "Unit A",
    "madrasa_id": "15",
    "madrasa_name": "Madrassa A",
    "total_points": "10",
    "rank": "1",
    "winning_entries": "2",
    "position_wins": { "1": "2" }
  }]
}
```

IDs, totals, ranks and counts preserve exact decimal strings, including sums
above JavaScript's safe integer range. External codes are preserved exactly;
`001` and `1` identify different candidates. Optional `madrasa_id` and
`madrasa_name` are both null for candidates without a Madrassa. No timestamps,
reviewer identities, shared-position audit records or correction reasons appear.

## Calculation and identity

`total_points(candidate,category) = sum(current_points[published_win.position] or 0)`

`createScoringService(db).categoryCandidates(params, filters)` reuses TKT-07A's
`publishedScoresSql` and the same internal position/totals aggregation used by
the unit leaderboard. There is one row per candidate, regardless of how many
events they win. Same-unit candidates remain distinct. Shared winners each get
full points. Only the latest publication per currently published event is read;
historical publications and correction workspaces are never summed. Drafts and
reviewed entries contribute nothing; pending corrections retain previous published
winners. A published correction replaces the affected event's contribution.

Current `competition_settings.position_points` is used on every request. Empty
or missing settings, removed positions and configured zero values award zero.
Published entries still count toward `winning_entries` and `position_wins` when
their point value is zero. Uncommitted updates remain invisible.

Snapshots contain external candidate codes rather than internal candidate IDs.
Codes are immutable through the existing management API and unique within each
competition. Aggregate codes from the already scoped scoring relation and match
them exactly to the registered competition/category roster. This preserves
identity across name corrections and avoids conflating reused codes in other
competitions. Names and unit/Madrassa metadata are read from current registered
records. The existing unit leaderboard continues using published unit assignments.
Trusted database owners must preserve identity/affiliation invariants; changing
codes or reassigning candidates directly in SQL is outside supported workflows.

## Ranking and errors

Order by total points numerically descending. Tied totals share `rank()` ranks,
such as 1, 1, 3. Display ties by lowercase candidate name with `C` collation,
original name with `C` collation, external code with `C` collation, then internal
ID. Lowercase conversion follows the database locale, as with TKT-07A. Codes
sort as text, never as numbers. Display ordering and position win counts do not
break shared ranks. Zero-score candidates participate in shared ranking.

Malformed or out-of-range positive bigint IDs and unsupported/repeated query
fields return 400. Missing competitions/categories and categories belonging to
another competition return 404. Database failures return sanitized 500 responses.
Errors use `{ "error": "message" }`. POST, PUT, PATCH and DELETE have no route
and return 404; the endpoint cannot modify scores, candidates or audit history.

## Database and performance

The existing transaction utilities perform two parent checks and one aggregation
statement. Publication selection, settings, roster, metadata, grouping and ranks
use a single PostgreSQL MVCC statement snapshot. Node.js receives only standings;
there are no per-candidate queries or application-side result-entry sums.

No new migration or index is needed. Existing
`candidates_category_idx(category_id,competition_id)` supports roster filtering;
unique `(competition_id,candidate_code)` supports exact identity matching. Unit
and Madrassa primary/composite keys support joins. The existing published-result
and latest-publication indexes serve the unchanged scoring relation. RLS and
database grants remain unchanged. No totals are persisted and no cache, worker or
dependency is added. Production-scale query-plan benchmarks are not claimed.

## Verification and scope

`test/candidate-leaderboards.test.js` covers public HTTP access, validation,
production mounting, no-store responses, sanitized failures and rejected writes.
`test/candidate-leaderboards.integration.test.js` uses real PostgreSQL isolated
schemas and the real candidate/result/shared-position/correction services. It
covers multiple events per candidate, same-unit candidates, shared winners,
zero/unpublished wins, corrected and pending results, history exclusion, dynamic
and missing settings, exact large sums, deterministic tied names/codes, optional
Madrassa metadata, name corrections, empty rosters, isolation, rejected writes,
uncommitted settings and PostgreSQL error recovery. Existing unit tests remain.

Set `TEST_DATABASE_URL` to a dedicated PostgreSQL database to require real database
execution. The existing `TKT05B_REQUIRE_POSTGRES=1` flag also prevents skips.
No frontend, overall unit rankings or live-update infrastructure is implemented.
