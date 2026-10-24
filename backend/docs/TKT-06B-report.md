# TKT-06B implementation report

Implemented private event result draft management using the existing PostgreSQL
schema, Firebase admin middleware, service/controller/router structure, database
transaction helper, audit log, and TKT-06A candidate resolver.

## Endpoints

Under `/api/admin/competitions/:competitionId`:

- POST `/categories/:categoryId/events/:eventId/result-draft`
- GET `/categories/:categoryId/events/:eventId/result-draft`
- PUT `/categories/:categoryId/events/:eventId/result-draft`
- GET `/result-statuses` (optional `category_id` query filter)
- GET `/categories/:categoryId/result-statuses`

See [result-draft-api.md](result-draft-api.md) for request/response examples,
validation, status listing, lifecycle and concurrency behavior.

## Behavior and integrity

Initialization creates one empty draft per event. Existing drafts are reused
unchanged without duplicate creation audit; concurrent initialization also creates
only one result row. GET returns the header, opaque version, and position-ordered
winner entries. PUT replaces the entire entry set, allowing individual removal,
replacement, position changes, incomplete drafts and clearing all winners.
Candidate records are retained when removed from an event.

Each save checks the latest version under a row lock and validates configured
positions before candidate resolution. Candidate codes/names/IDs and duplicate
codes/positions validate before database work. The path supplies category and
competition. The existing resolver validates affiliation and reuses exact matching
identities or creates candidates with external codes preserved verbatim.
Resolution proceeds in sorted code order across events to avoid reversed candidate
lock order. No independent transaction or commit is introduced.

All candidate creation, entry replacement, header update and mutation audit writes
commit or roll back together. SQL failures and late identity conflicts leave old
entries/header/version/audits intact and discard newly resolved candidates.
Result creation/update audits record verified `request.auth.uid`, event scope,
and before/after snapshots. Body actor fields are rejected.

Competition, category, event, settings and result locks preserve scoped validation
and serialize edits. The version combines row xmin and full UTC microsecond
updated_at, avoiding a timestamp migration and JavaScript timestamp truncation.
Two editors with one version yield one successful save and one 409 before loser
candidate resolution. GET holds a shared result lock to keep header/entries
consistent with ordinary saves.

Only drafts are managed by these endpoints. Reviewed and published records reject
POST, GET-as-draft and PUT, and are never reset or overwritten. Normal saves reject
exceptional override entries. There is no lifecycle transition, public draft
route, leaderboard contribution, scoring API or frontend implementation.

## Files

Created:

- `backend/src/services/resultDrafts.js`
- `backend/src/controllers/resultDrafts.js`
- `backend/src/routes/resultDrafts.js`
- `backend/test-support/result-drafts-http.js`
- `backend/test/result-drafts.test.js`
- `backend/test/result-drafts.integration.test.js`
- `backend/docs/result-draft-api.md`
- `backend/docs/TKT-06B-report.md`

Modified:

- `backend/src/config/app.js` (mount draft/status router)
- `README.md` (link API documentation)

## Database and environment

No migrations, dependencies, credentials, environment files or persistent settings
changed. Existing event-result uniqueness, composite foreign keys, candidate
uniqueness, ordinary-position uniqueness and update timestamps remain authoritative.

The PostgreSQL test harness reuses `withParticipantDatabase`: it creates/migrates
and drops its own random `tkt05b_<hex>` schema, leaving ordinary application tables
untouched. New test execution is required with `TKT05B_REQUIRE_POSTGRES=1`.
Tests run with network access for loopback HTTP and the configured PostgreSQL
connection. Credentials are neither printed nor committed.

Full-suite test-process flags `TKT03_REQUIRE_POSTGRES` and
`TKT05A_REQUIRE_POSTGRES` through `TKT05D_REQUIRE_POSTGRES` are `1`, with
statement/query timeouts 60000/75000 ms to accommodate migration locks across
isolated schemas. The full-suite rerun also uses a 30000 ms connection timeout.
These flags do not change saved configuration. An initial full run with the
existing shorter connection budget failed concurrent initialization/creation
checks in the new draft suite and the existing catalog suite; focused draft
execution had passed. Sanitized test-only database diagnostics were enabled for
the rerun without exposing SQL or credentials, and are removed before delivery.

## Limitations

Lists are unpaginated, following current APIs. Winner editing sends the complete
set rather than individual-entry PATCH/DELETE requests. Replaced entry IDs may
change; candidate IDs remain stable. Codes and affiliations remain immutable and
name matching is exact; deliberate name corrections use TKT-06A first.

Clients must GET and reconcile after a stale-version 409. Future writers must
lock and update the same result header when changing entries so the version
advances. Existing trusted direct SQL writers are outside this API concurrency
contract. Candidate name corrections are not versioned with result headers;
resolution still rejects a stale candidate identity rather than reassigning it.

Empty drafts are permitted without configured scoring positions. Existing entries
at positions removed from configuration must be removed/replaced before saving.
Shared positions and review/publish/correction workflows are reserved for later
tickets. Firebase token scenarios use injected verifier responses plus existing
SDK-boundary tests; no live users/tokens are provisioned.

Implementation/tests and documentation are separate local commits. Final commit
hashes and working-tree status are supplied in the final chat report, avoiding a
self-referencing documentation commit hash. No push, merge, rebase or deployment.

## Verification results

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Focused draft HTTP/PostgreSQL tests | 15 passed, zero failures/skips |
| `npm test` full rerun | 126 backend tests and 14 frontend tests passed, zero failures/skips |

All PostgreSQL suites executed; none were skipped. The complete rerun with the
longer test-process connection timeout passed both previously failing suites.
The temporary diagnostic preload was removed and is not part of either commit.
Production error handling remains sanitized and unchanged. The original
short-budget failure's specific database error was not captured; the successful
rerun does not establish a definitive cause. No unrelated catalog code was changed.
