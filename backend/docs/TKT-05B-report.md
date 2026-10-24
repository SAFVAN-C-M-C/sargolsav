# TKT-05B implementation and verification report

Scope: backend unit and optional Madrassa management only. No frontend screens,
category/event management, candidate registration, results, scoring or leaderboards
were implemented. Existing related tables are used only for integrity tests.

## Implemented endpoints

All routes require Firebase admin authorization. Base:
`/api/admin/competitions/:competitionId/units`.

| Method | Relative path |
| --- | --- |
| POST | `/` |
| GET | `/` |
| GET | `/:unitId` |
| PATCH | `/:unitId` |
| DELETE | `/:unitId` |
| POST | `/:unitId/madrasas` |
| GET | `/:unitId/madrasas` |
| GET | `/:unitId/madrasas/:madrasaId` |
| PATCH | `/:unitId/madrasas/:madrasaId` |
| DELETE | `/:unitId/madrasas/:madrasaId` |

The [API contract](unit-madrasa-api.md) contains request/response examples,
validation, relationship rules, deletion behavior and error responses.

## Business rules

- Path IDs must be canonical positive PostgreSQL bigint strings. POST/PATCH accept
  only a nonblank `name` without null characters. Names retain exact text and case.
- Units belong to an existing competition; Madrassas belong to an existing unit
  within that competition. Reads and mutations include the complete path scope.
  Wrong competition/unit paths return 404 without exposing unrelated records.
- Uniqueness follows existing constraints: unit names within competition, Madrassa
  names within unit. Different parent scopes can reuse names.
- Units without Madrassas are valid; empty lists are successful responses.
- Parent IDs cannot change through POST/PATCH. No public endpoints were added.
- DELETE succeeds only for unreferenced records. Existing foreign keys block units
  with Madrassas or candidates and Madrassas with candidates. No associated data
  or results are cascaded or detached. Blocked deletions return 409.
- All mutations and their audit records commit together, with actors derived from
  the verified Firebase UID. Audit snapshots survive entity deletion.
- Writes follow competition-first row locking, consistent with TKT-05A. Parent
  key-share locks protect read validation/retrieval. Values use bound SQL parameters.
- Invalid input, missing records, duplicates, referenced deletion, authorization
  and database failures return consistent sanitized responses.

## Files created or modified

Created:

- `backend/src/services/participants.js`
- `backend/src/controllers/participants.js`
- `backend/src/routes/participants.js`
- `backend/test/participants.test.js`
- `backend/test/participants.integration.test.js`
- `backend/test-support/participants-http.js`
- `backend/test-support/postgres.js`
- `backend/docs/unit-madrasa-api.md`
- `backend/docs/TKT-05B-report.md`

Modified:

- `backend/src/config/app.js`
- `backend/docs/schema.md`
- `README.md`

## Verification

Verified on 2026-10-24:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed (existing frontend TypeScript check) |
| `npm run build` | Passed |
| `npm test` | Passed: 72 backend tests and 14 frontend tests, zero failures/skips |
| Targeted HTTP/service tests | Passed: 4 tests |
| Targeted PostgreSQL suite | Passed: 8 scenarios plus suite test, zero skips |
| `git diff --cached --check` | Passed for implementation commit |

The complete suite ran with `TKT03_REQUIRE_POSTGRES=1`,
`TKT05A_REQUIRE_POSTGRES=1`, and `TKT05B_REQUIRE_POSTGRES=1` so all PostgreSQL
suites were required to execute. A final read-only database check confirmed zero
remaining TKT-05B test schemas.

The PostgreSQL harness creates a random `tkt05b_<hex>` schema, runs existing
migrations there, sets/verifies the connection search path explicitly and drops
only that schema afterward. Tests cover CRUD, units without Madrassas, exact
names, concurrent duplicates, isolated parent scopes, missing parents, blocked
deletions preserving published results, verified audit attribution and rollback
after actual SQL errors on every mutation type. Existing tests remain intact.

## Environment and limitations

No environment files, credentials, dependencies or migrations are changed.
Normal database tables are not modified by the isolated integration tests.
Test-process flags require the existing and new PostgreSQL suites to run.
Network-enabled checks run outside the sandbox to reach loopback HTTP servers
and the configured database, as in TKT-05A. No deployment or application setup
changes are required.

Implementation and tests are committed locally as `c61447e`:
`feat(api): add scoped unit and Madrassa management with audited deletion`.
Documentation is committed separately; its hash is provided in the final report.
No push, merge, rebase or deployment was performed.

Lists remain unpaginated. Names use existing case-sensitive exact-text uniqueness,
so differently cased/spaced names are distinct. Moves between parents are not
supported. Authentication tests inject verifier responses and preserve existing
Firebase SDK tests; no live user or token is provisioned. Writes serialize per
competition, which favors consistency at the expected administrative scale.
Future tickets must continue to use the established parent lock order and foreign
keys. No later-ticket implementation was started.
