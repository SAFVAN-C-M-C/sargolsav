# Category unit leaderboard (TKT-07A)

`GET /api/competitions/:competitionId/categories/:categoryId/leaderboard/units`

This public read-only route follows the existing `/api/competitions` convention.
No login or query parameters are required; unsupported parameters return 400.
Responses carry `Cache-Control: no-store`. No mutation methods are implemented.

## Response

```json
{
  "leaderboard": [
    { "unit_id": "12", "unit_name": "Unit A", "total_points": "8", "rank": "1",
      "winning_entries": "2", "position_wins": { "1": "1", "2": "1" } },
    { "unit_id": "13", "unit_name": "Unit B", "total_points": "5", "rank": "2",
      "winning_entries": "1", "position_wins": { "1": "1" } }
  ]
}
```

IDs, totals, ranks and counts are exact decimal strings. Valid point values can
reach `Number.MAX_SAFE_INTEGER`, so summed totals can exceed JavaScript's exact
integer range. Consumers should retain strings or use arbitrary precision integers.
`position_wins` has position keys and string counts; missing keys mean zero wins.
It is informational and does not break ties.

All competition units appear, even without candidates or wins in this category.
The current schema has no separate unit/category participation mapping. An empty
unit roster returns `[]`. Units without wins have `"0"` points, `"0"` entries and
`{}` position counts. Published zero-value and removed-position wins still count
in `winning_entries` and `position_wins`.

Sort order is numeric points descending. Equal totals receive shared SQL `rank()`
competition ranks (1, 1, 3), including zero-point ties. Display order within ties
is lowercase name with `C` collation, original name with `C` collation, then numeric
unit ID. Lowercase conversion follows the database locale. No other tie-breaker
applies.

Malformed/noncanonical/out-of-range positive bigint IDs return 400. Missing
competitions or categories, including a category from another competition, return
404. Unexpected database failures return sanitized 500 responses. Errors follow
`{ "error": "message" }`. POST, PUT, PATCH and DELETE have no route and return 404.
Candidate details, audit references and internal review/correction data are absent.

## Formula and authoritative data

For unit U in category C:

`total_points(U,C) = sum(current_position_points[winner.position] or 0)`

Sum each winner in the latest committed publication of each currently published
event in C and the requested competition, using the winner's published unit ID.
Each winner receives the full value, including shared positions. Multiple winners
from a unit and wins across events add independently. No point defaults are
hardcoded. Missing settings, empty settings or removed positions award zero.
The existing settings validation remains authoritative: canonical positive
position keys and non-negative safe integer values.

`event_results.status = 'published'` gates eligibility. The greatest publication
ID per event/result selects current `result_publications.snapshot.winners`, as in
the existing public result reader. Publishing corrections replaces live entries
and appends an immutable publication in one transaction. Historical publications
never enter the sum. Drafts, reviewed results, correction workspaces, review
snapshots and audit logs are never scoring sources. Pending corrections leave
previous published winners in effect. Snapshot unit assignments remain authoritative
even if working candidate metadata later changes. Display names come from `units`.

Read `competition_settings.position_points` at calculation time; review-time
points are not scoring inputs. Subsequent requests use committed configuration
changes immediately. No leaderboard total is stored.

## Database implementation

`src/services/scoring.js` exports `publishedScoresSql`, a reusable parameterized
relation with event, category, candidate code, unit, position and current points
per published winner. `$1` is competition and `$2` is category.
`createScoringService(db).categoryUnits(params)` aggregates this relation in SQL.
Future consumers can reuse it without implementing additional leaderboards here.

The service uses the existing transaction and parent validation utilities. There
are three fixed SQL calls: competition validation, scoped category validation and
aggregation. One aggregation statement selects latest publications, expands winner
JSON, joins current settings, groups by unit/position then unit, left joins all
competition units and assigns rank. Node.js receives one row per unit. No N+1
queries or entry-by-entry application aggregation occur. The aggregation reads
settings, publication status, winners and units in one PostgreSQL MVCC snapshot,
so concurrent commits cannot produce a mixture of publication versions.

No migration is required. Existing indexes support the access paths:

- `event_results_published_idx (competition_id,event_id)` partial on published
  status, plus `event_results_competition_idx` for competition filtering.
- `result_publications_latest_idx (competition_id,event_id,id DESC)` supports
  each latest-publication lookup. Both leading columns are constrained, with
  result/category identity checked before taking the newest row.
- Unique `units (competition_id,name)` covers the competition unit roster.
- Primary/composite category keys support parent validation.

JSON expansion and aggregation scale with current published winners in the
requested category. No cache tables, Redis, jobs, new dependencies or speculative
indexes were introduced. Very large competitions may eventually need measured
query-plan tuning; no large production-volume benchmark is claimed.

## Tests and scope

`test/leaderboards.test.js` covers public access, production mounting, invalid
IDs/query overrides, sanitized database failures and rejected mutations.
`test/leaderboards.integration.test.js` uses real PostgreSQL isolated schemas and
the actual draft/review/publish/correction services. It covers unpublished states,
multiple same-unit and shared winners, multiple events, pending/published
corrections, history exclusion, dynamic settings, zero-point units, deterministic
ties, isolation, exact large sums, missing parents and rejected writes.

Run from the backend directory using the existing database configuration;
`TKT05B_REQUIRE_POSTGRES=1` prevents database-unavailable skips. The harness migrates
and removes isolated schemas. Local HTTP/PostgreSQL network access is required.
No environment files or credentials are changed. Candidate leaderboards, overall
rankings, frontend interfaces and live-update infrastructure remain outside scope.

The backend `npm test` script limits file concurrency to two. Each PostgreSQL
integration file opens its own connection pool; the unbounded runner exceeded
the configured session pooler's 15-client limit. This preserves all test cases
and their internal concurrency checks while bounding cross-file connections.
