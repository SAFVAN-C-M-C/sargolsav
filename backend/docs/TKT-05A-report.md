# TKT-05A implementation and verification report

Verified on 2026-10-24. Scope: competition management APIs only.

## Delivered API

Base path: `/api/admin/competitions`. Every endpoint requires existing Firebase
admin authentication. [Full contract and examples](competition-api.md).

| Method | Path |
| --- | --- |
| POST | `/api/admin/competitions` |
| GET | `/api/admin/competitions` |
| GET | `/api/admin/competitions/:id` |
| PATCH | `/api/admin/competitions/:id` |
| PATCH | `/api/admin/competitions/:id/status` |
| GET | `/api/admin/competitions/:id/settings` |
| PUT | `/api/admin/competitions/:id/settings` |

## Business rules

- Competition creation starts in draft and creates an empty global points map.
- Code uniqueness uses the existing PostgreSQL constraint; exact text is retained.
- Lifecycle: draft to active/archived, active to archived, archived to active.
  Same-state retries are no-ops; returning to draft is rejected.
- Multiple active competitions remain supported because the existing schema
  documentation explicitly requires this. Archiving remains reversible.
- Settings belong to one path competition ID and apply to every event there.
  Points are non-negative safe whole numbers and position keys are canonical
  positive PostgreSQL integers. PUT replaces the complete map after validation.
- Current shared points are the contract for future published leaderboard scoring;
  this ticket adds no calculations, caches or frozen scores.
- All writes require the verified boolean admin claim. Audit actors use only the
  middleware UID. Strict field validation rejects client-controlled actors/scope.
- Creation, edits and audit records are atomic. Parent row locks serialize edits
  and preserve independent concurrent partial updates. SQL uses bound values.
- Missing IDs return 404, validation returns 400, duplicates/transitions return 409,
  and unexpected database errors return safe 500 responses. Internal error objects
  are no longer printed by the generic HTTP error handler.
- No competition deletion/reset, public reads, frontend competition screens, or
  units/Madrasas/categories/events/candidates/results APIs were added.

## Files

Created:

- `backend/src/services/competitions.js`
- `backend/src/controllers/competitions.js`
- `backend/src/routes/competitions.js`
- `backend/test/competitions.test.js`
- `backend/test/competitions.integration.test.js`
- `backend/test/helpers/competitions-http.js`
- `backend/docs/competition-api.md`
- `backend/docs/TKT-05A-report.md`

Modified:

- `backend/src/config/app.js`
- `backend/src/middleware/errorHandler.js`
- `backend/docs/schema.md`
- `README.md`

## Verification

| Command | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed (existing frontend TypeScript check) |
| `npm run build` | Passed |
| `npm test` | Passed: backend 59, frontend 14; zero failures/skips |
| `git diff --cached --check` | Passed for implementation commit |

The full suite used `TKT05A_REQUIRE_POSTGRES=1` and
`TKT03_REQUIRE_POSTGRES=1` so PostgreSQL could not silently skip. Existing tests
remain intact. Real PostgreSQL 17.11 tests ran migrations and fixtures only in
randomly named test schemas, with explicit search-path checks, then dropped those
schemas. HTTP tests verify every endpoint's authorization, and integration tests
cover creation/retrieval, duplicates, updates, concurrency, isolation, settings,
all lifecycle pairs and rollback after real SQL failures.

The network sandbox blocked loopback HTTP tests and database DNS access on initial
attempts. Running the checks outside that sandbox resolved both restrictions.

## Environment and Git

No dependencies, environment files, credentials, migration files or normal database
tables were changed. The attempted temporary local PostgreSQL initialization was
stopped; a final check found no remaining temporary cluster or related processes.
The successful tests used the existing configured database in isolated schemas.
Required-test flags applied only to the test process.

Implementation and tests are committed locally as `e57e03f`:
`feat(api): implement admin competition management and shared settings`.
Documentation is committed separately; its hash is supplied in the final report.
No push, merge, rebase or deployment was performed.

## Remaining work

Leaderboard calculations must consume the current shared configuration and
invalidate any future caches when it changes. Empty/missing positions require an
explicit policy in future scoring/publication services. The unchanged database
constraint permits broader numeric points than the API; legacy/direct SQL values
may need correction before scoring. No legacy data was rewritten.

Integration tests use injected token verification plus existing authentication/SDK
tests; no real Firebase user was provisioned and no live ID token was used.
Competition lists are currently unpaginated. Public result projections and all
TKT-05B/later functionality remain for separate tickets.
