# Overall unit leaderboard (TKT-07C)

`GET /api/competitions/:competitionId/leaderboard/units`

Public, read-only and unauthenticated. Responses carry `Cache-Control: no-store`.
No query parameters or mutation methods are supported. The response has the same
unit row contract as the category unit leaderboard; `total_points` now covers
every category in the requested competition.

```json
{
  "leaderboard": [
    {
      "unit_id": "12",
      "unit_name": "Unit A",
      "total_points": "16",
      "rank": "1",
      "winning_entries": "4",
      "position_wins": { "1": "2", "2": "2" }
    },
    {
      "unit_id": "13",
      "unit_name": "Unit B",
      "total_points": "13",
      "rank": "2",
      "winning_entries": "3",
      "position_wins": { "1": "2", "2": "1" }
    },
    {
      "unit_id": "14",
      "unit_name": "Unit C",
      "total_points": "0",
      "rank": "3",
      "winning_entries": "0",
      "position_wins": {}
    }
  ]
}
```

IDs, totals, ranks and counts are exact decimal strings. Totals may exceed
JavaScript's safe integer range. Position keys are strings and missing keys mean
zero wins. Every registered competition unit appears, even without candidates,
categories or published wins. An empty competition without units returns
`{ "leaderboard": [] }`; one with units but no published results returns all units
at zero with shared rank `"1"`.

The optional category breakdown is omitted: one row per unit keeps data transfer
small and the existing category unit endpoint supplies per-category details.

## Formula, publication source and ranking

`overall_points(U) = sum(category_points(U,C) for every category C)`

Equivalently, sum the current configured position value for every winning entry
assigned to U in the latest publication of every currently published event in
this competition. The scorer always filters competition identity, even when the
category predicate is omitted. It never sums other competitions' publications or
uses their points configuration.

Shared-position winners each receive full points. All same-unit winners count,
including candidates without a Madrassa. Drafts and reviewed results contribute
nothing. Pending correction workspaces leave current published standings intact;
publishing a correction replaces that event's contribution. Older publications
are retained as history but never summed. The current
`competition_settings.position_points` is read during every calculation. Empty or
missing settings, removed positions and configured zero values award zero while
published entries still count in winning/position counts. No totals are stored.

Rank by points numerically descending, using shared SQL `rank()` ranks (1, 1, 3).
Within a tie, display lowercase unit name with `C` collation, original name with
`C` collation, then numeric unit ID. Lowercase conversion follows the database
locale, matching TKT-07A. Position counts and alphabetical ordering do not break
ranks. Unit names come from current unit records; winner unit assignments come
from the authoritative publication snapshot.

Malformed/noncanonical/out-of-range positive bigint IDs or unsupported/repeated
query fields return 400. Missing competitions return 404. Unexpected database
failures return sanitized 500 errors. Errors use `{ "error": "message" }`.
POST, PUT, PATCH and DELETE return 404. Candidate metadata, Madrassa affiliations,
audit references, publication history and internal correction details are absent.

## Architecture and integration review

`createScoringService(db).overallUnits(params, filters)` uses the same internal
publication relation, current-points expression, position/count aggregation and
unit standings/ranking statement as `categoryUnits`. Only the category predicate
and bind parameter are omitted. The exported category-scoped `publishedScoresSql`
remains available to existing consumers. The candidate endpoint also uses that
same publication generator and position/count aggregation.

The focused integration test checks all three endpoints after every relevant
workflow/configuration change:

- Candidate points, win counts and position counts sum to category unit values.
- Category unit points, win counts and position counts sum to overall unit values.
- Shared positions retain full values in each projection.
- Drafts, reviewed results and pending corrections leave standings unchanged.
- Published corrections remove previous contributions and update every affected
  projection; history is not double-counted.
- Current points changes recalculate all projections, including zero and very
  large values. Uncommitted settings stay invisible.
- Repeated responses preserve ranks and alphabetical/name/code ordering.
- Another competition, including reused external candidate codes, stays isolated.

The identity checks assume the existing supported candidate invariants: external
codes and affiliations are immutable through APIs. Candidate grouping uses the
registered identity matched by publication code; unit grouping uses the published
unit ID. Unsupported direct SQL identity/affiliation reassignment can invalidate
that correspondence. No supported workflow discrepancy was found.

Each response calculates all its standings in one MVCC statement snapshot.
Equality across endpoints holds for the same committed state; independent HTTP
requests can straddle a publication or settings commit. No cross-request snapshot
token or combined response is introduced.

## Queries, indexes and measured plans

Overall requests use two fixed data SQL calls: competition validation, then the
single aggregate statement. Category requests retain three (competition, category,
aggregate). The transaction utility also issues BEGIN/COMMIT. Database call counts
do not grow with events, units or categories. PostgreSQL expands snapshot winners,
groups them and assigns rank; Node.js receives only one row per unit.

Real `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` checks exercise the actual service
statements after adding 500 published events across two categories, three winners
per event, and ten publication versions per added event (5,000 additional history
rows). These synthetic fixtures and their settings are rolled back afterward.
Base fixtures also include a correction, reviewed result and another competition.

Observed focused-run results on local PostgreSQL 17.4:

| Query | Published events selected | Execution time | Shared buffer hits | Temp blocks written |
| --- | --- | --- | --- | --- |
| Category units | 252 | 1.913 ms | 767 | 0 |
| Category candidates | 252 | 2.162 ms | 769 | 0 |
| Overall units | 503 | 3.342 ms | 1520 | 0 |

Every plan used `result_publications_latest_idx
(competition_id,event_id,id DESC)`, returning one publication row per eligible
event before winner expansion. Historical versions were not transferred or
aggregated. The planner chose sequential scans for the small roster/settings
tables and the roughly 500-row result table, appropriate to this fixture's high
competition selectivity. No forced planner settings were used.

Existing `event_results_published_idx`, `event_results_competition_idx`, unit
roster `(competition_id,name)`, candidate category/code indexes and metadata keys
remain available for larger or more selective datasets. No confirmed indexing or
integrity issue was found, so no migration is added. RLS and grants are unchanged.
There is no Redis, persisted score table, job, dependency or per-category query
loop in the request handler. Winner expansion scales with current published wins;
the indexed latest lookup limits each event to one snapshot. Measurements are a
local synthetic review, not a Supabase production latency or capacity guarantee.

## Tests and scope

`test/overall-leaderboards.test.js` covers the public HTTP contract, production
mounting, invalid IDs/query overrides, sanitized failures and rejected mutations.
`test/overall-leaderboards.integration.test.js` covers actual publishing and
correction services, cross-leaderboard invariants, multiple categories/units,
shared winners, zero units, empty competitions, configuration changes, shared
ranks, isolation, exact arithmetic, real SQL error recovery and query-plan review.
The previous category and candidate suites remain in place.

Set `TEST_DATABASE_URL` or the existing `TKT05B_REQUIRE_POSTGRES=1` flag to require
PostgreSQL execution. Tests use the existing schema-pinned harness and remove
their isolated schemas. No frontend screens, polling or live-update work is added.
