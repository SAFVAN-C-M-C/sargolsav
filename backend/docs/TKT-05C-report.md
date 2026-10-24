# TKT-05C implementation and verification report

Scope: authenticated backend category and event CRUD only. No frontend screens,
candidate registration, result management, scoring or leaderboard implementation
was added. Candidate/result records used by tests are SQL fixtures only.

## Endpoints

Base: `/api/admin/competitions/:competitionId/categories`.

| Method | Relative path |
| --- | --- |
| POST | `/` |
| GET | `/` |
| GET | `/:categoryId` |
| PATCH | `/:categoryId` |
| DELETE | `/:categoryId` |
| POST | `/:categoryId/events` |
| GET | `/:categoryId/events` |
| GET | `/:categoryId/events/:eventId` |
| PATCH | `/:categoryId/events/:eventId` |
| DELETE | `/:categoryId/events/:eventId` |

The [API contract](category-event-api.md) provides request/response examples,
validation requirements, deletion safeguards and HTTP errors.

## Business rules

- Every route requires a verified Firebase user with the boolean admin claim.
- Names are configurable, nonblank strings without null characters. Exact case
  and whitespace are preserved, with existing scoped database uniqueness.
- `sort_order` accepts JSON integers `0..2147483647`, defaults to zero on creation,
  and remains unchanged when omitted from PATCH. Lists use order ascending and
  ID ascending to resolve ties. No category names are hardcoded.
- Detail/update/delete queries include every path parent. Missing or mismatched
  competition/category IDs return 404; ordinary updates cannot change parents.
- Unused records can be deleted. Existing event/candidate FKs protect categories.
  A locked dependency check rejects event deletion for any result set, including
  empty drafts, and existing audit references also block deletion. Associated
  result entries and published data remain intact.
- Mutations and audit rows commit atomically using the middleware UID. Audit
  details retain before/after snapshots and entity IDs; failed writes roll back.
- Competition-first locks follow TKT-05A/B conventions. Parent key-share locks
  protect reads, and row locks protect deletion from concurrent FK insertions.
  SQL values use bound parameters. Errors omit SQL, credentials and stack traces.

## Files created and modified

Created:

- `backend/migrations/0004_category_event_order.sql`
- `backend/src/services/catalog.js`
- `backend/src/controllers/catalog.js`
- `backend/src/routes/catalog.js`
- `backend/test/catalog.test.js`
- `backend/test/catalog.integration.test.js`
- `backend/test-support/catalog-http.js`
- `backend/test-support/catalog-postgres.js`
- `backend/docs/category-event-api.md`
- `backend/docs/TKT-05C-report.md`

Modified:

- `backend/src/config/app.js`
- `backend/test/schema.integration.test.js` (migration count updated from 3 to 4)
- `backend/migrations/README.md`
- `backend/docs/schema.md`
- `README.md`

## Verification

Verified on 2026-10-24:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed (existing frontend TypeScript check) |
| `npm run build` | Passed |
| `npm test` | Passed: 88 backend and 14 frontend tests, zero failures/skips |
| Targeted HTTP/service and PostgreSQL checks | Passed: 16 tests, zero skips |
| Implementation staged diff check | Passed |

The targeted checks include ten real PostgreSQL scenarios plus their suite test.
A final read-only check confirmed zero remaining TKT-05C test schemas and zero
new ordering columns in the normal public schema, confirming migration is still
required there.

The new PostgreSQL suite creates only a random `tkt05c_<hex>` schema, explicitly
sets and checks the connection search path, applies migrations there and drops
that schema afterward. It verifies the incremental migration on preexisting rows,
CRUD and partial edits, stable ordering, scoped/concurrent duplicates, isolation,
immutable parents, missing records, candidates/result/audit deletion protection,
trusted audit actors, actual SQL failure rollback and concurrent result creation.
The existing suites remain intact apart from their expected migration count.

## Environment and rollout

The only schema addition is migration 0004, adding non-negative integer display
order and ordering indexes. It was tested in isolated schemas and is **not applied
to the normal configured database**. Run `npm run db:migrate` before using the new
APIs. Previous migration files and existing data are not rewritten.

No dependencies, environment files, credentials or secrets were changed. No
frontend or deployment configuration changed. Network-enabled test commands ran
outside the sandbox to reach loopback servers and PostgreSQL. The complete suite
requires all four PostgreSQL suites with their `TKT*_REQUIRE_POSTGRES` flags and
uses test-process-only statement/query timeouts of 60000/75000 ms to accommodate
concurrent migration advisory-lock waits. Persistent configuration is unchanged.

## Git and limitations

Category and event implementation share one service/controller/router following
TKT-05B patterns, so they are combined in local commit `9d6fb74`:
`feat(api): add ordered category and event management with protected deletion`.
Tests and documentation are committed separately; that hash and final working-tree
status are provided in the final chat report. No push, merge, rebase or deployment
was performed, and previous commits were not modified.

Lists remain unpaginated and there is no bulk reorder endpoint. Names retain
existing exact-text uniqueness. Parent transfers are unsupported. Writes serialize
per competition, matching earlier management APIs. Tests inject Firebase verifier
responses and retain the existing SDK tests; no live Firebase token is provisioned.

The original direct SQL event-to-result cascade is unchanged. Ordinary event
deletion must use the guarded API; direct SQL/reset tooling remains responsible
for its own deletion policy. Future result writers must respect FK constraints
and the established competition/category/event lock order. No later ticket was
started.
