# TKT-07A delivery report

## Implementation

The reusable SQL scoring relation and service live in `src/services/scoring.js`.
Only the newest publication snapshot for a currently published event contributes.
Each winner receives the full current configured position value; shared winners
are not divided. Multiple winners/events sum within the requested competition
and category. Corrections replace prior winners through latest-publication
selection. Pending corrections do not affect the current published score.

The endpoint is
`GET /api/competitions/:competitionId/categories/:categoryId/leaderboard/units`,
following existing public API conventions. It returns unit ID/name, exact points,
shared rank, winning entry count and position-wise wins. Numeric aggregates use
decimal strings to preserve values beyond JavaScript's safe integer range.
All competition units appear, including zero scores. Equal scores have ranks
1, 1, 3 and alphabetical display order; win counts do not break ties.

The full contract, example response, formula, error behavior, authoritative
sources and index rationale are in [scoring-api.md](scoring-api.md).

## Queries and schema

Three parameterized SQL calls per request validate competition, validate scoped
category, then calculate all standings. The aggregation uses lateral latest-
publication selection, JSON winner expansion, current settings, grouped sums and
counts, a unit roster left join and SQL rank. It reads all scoring inputs in one
MVCC statement snapshot. No individual result entries are loaded into Node.js.

No migration is required. Existing published-result, latest-publication and unit
roster indexes support the access paths. No stored totals, cache, jobs, new
dependencies or production schema/data changes are introduced.

## Files

- `src/services/scoring.js`: reusable scoring relation and unit aggregation.
- `src/routes/leaderboards.js`: public GET contract and no-store response.
- `src/config/app.js`: public router mount.
- `test/leaderboards.test.js`: HTTP validation, access, failures and mutation rejection.
- `test/leaderboards.integration.test.js`: actual PostgreSQL and result workflow coverage.
- `test-support/result-lifecycle-http.js`: optional injected scoring router for HTTP tests.
- `package.json`: two-file backend test concurrency to respect database session limits.
- `docs/scoring-api.md`, `docs/TKT-07A-report.md`, root `README.md`: documentation.

## Verification and environment

| Check | Final result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Focused HTTP/PostgreSQL scoring run | Four tests passed, zero failures/skips |
| `npm test` backend | 163 tests passed, zero failures/skips |
| `npm test` frontend | 14 tests passed in two files |
| Git whitespace checks | Passed |

The final full run includes all scoring fixtures, real PostgreSQL failure recovery,
uncommitted settings isolation, empty/missing settings, and every existing test.

The initial default-concurrency full run exceeded the configured PostgreSQL
session pooler's 15-client limit, affecting existing concurrency tests. Limiting
test-file concurrency to two preserves every test and internal concurrency check.
The initial scoring fixture was also corrected to use explicit shared-position
editing when removing an inherited tie. These issues were corrected before the
final full-suite rerun.

Verification requires network access for local HTTP and the configured database.
Full-suite process flags `TKT03_REQUIRE_POSTGRES` and `TKT05A_REQUIRE_POSTGRES`
through `TKT05D_REQUIRE_POSTGRES` are `1`. Process-only connection, statement,
query and idle-transaction timeouts are 30000/120000/150000/120000 ms. No
credentials, environment files or persistent environment configuration changed.
The test harness creates, migrates and drops isolated schemas. Ignored local
test logs and generated frontend build output are not committed.

## Limitations and git

There is no separate category unit enrollment model; all competition units form
the category roster. Published zero-value or removed-position wins still count
as winning entries. Display names use current units, while winner unit identity
comes from publication snapshots. Large production-volume benchmarks are not
claimed. Candidate/overall leaderboards, frontend and live updates remain outside
scope. No push, merge, rebase or deployment is performed. Local commit hashes
and final working-tree status are provided in the final chat report.
