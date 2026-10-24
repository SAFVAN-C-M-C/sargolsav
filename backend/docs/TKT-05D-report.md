# TKT-05D competition setup integration review

Review date: 2026-10-24. Scope: existing competition, settings, unit, Madrassa,
category and event management. No frontend or later-ticket functionality added.

## Findings and confirmed fixes

### Direct event deletion could remove published results

The existing API guard was correct, including its `FOR UPDATE` lock. However,
the underlying event/result foreign key used `ON DELETE CASCADE`. A new real
PostgreSQL regression test demonstrated that direct event deletion succeeded
instead of rejecting an event with published entries. That test failed before
the fix and passed afterward.

Forward migration `0005_protect_event_results.sql` replaces that FK with
`NO ACTION`. Existing API conflict handling remains unchanged. The new test proves
that published results/entries survive direct event DELETE and that intentional
whole-competition cleanup still succeeds in the isolated schema. Existing
populated cascade and audited-tie tests also remain in the complete suite.

### Supabase client roles had writes outside Firebase authorization

Read-only normal-database metadata inspection confirmed both `anon` and
`authenticated` had INSERT/UPDATE/DELETE privileges on all ten business tables,
with RLS disabled. If these tables are exposed through Supabase REST, client
access can bypass Firebase admin authorization, validation and audit writers.
Metadata confirms the grants and missing RLS; no external REST exploit or real
client mutation was attempted against the normal database.

Forward migration `0006_restrict_client_database_access.sql` enables RLS without
client policies and revokes table access from PUBLIC and existing Supabase client
roles. It covers all ten existing business tables plus migration history, and
revokes associated identity-sequence privileges. This also blocks client TRUNCATE,
audit/history tampering and identity resets. It creates no global roles and
changes no global default privileges. Owners/trusted backend connections remain
able to operate; the real Express workflow is retested against the hardened schema.

Isolated regression tests execute statements as both actual Supabase client roles
with `SET LOCAL ROLE`: mutation, truncate, audit/history deletion and sequence
reset are denied. After deliberately re-granting DML on the temporary competition
table, RLS still hides rows and blocks insertion. Hardening SQL can be reapplied
to restore those temporary grants. No normal permissions or roles are modified.

## Complete setup workflow

The new workflow test imports the actual production Express app, including its
real router mounting, middleware, controllers, services, error handling and shared
database utilities. Only the Firebase SDK verification boundary and database
connection destination are substituted. The verifier asserts revocation checks
are requested; no live Firebase user/token is provisioned.

The successful workflow creates and retrieves:

1. One competition with a shared points map; later edits preserve current points.
2. Three units, with two Madrassas in one, one in another, and none in the third.
3. The five caller-configured default categories: Kids, Children, Sub Junior,
   Junior and Teen. These are test inputs, not service constants or automatic seeds.
4. Two events per category (ten events total), including names reused across categories.
5. Updated competition/unit/Madrassa/category/event names and display order.
6. Concurrent category name/order edits plus a settings update, with no lost fields.
7. A complete structure assembled from existing detail/list endpoints, preserving
   order and full competition/unit/category relationships. No new aggregate
   endpoint or cross-request snapshot guarantee is introduced.
8. A second competition reusing scoped names, with its own unconfigured points,
   unit, Madrassa, category and event. Both structures remain isolated.

All 16 production mutation routes reject missing, non-admin, non-boolean-admin,
expired/revoked and unavailable-auth cases before any database access. Cross-scope
and mismatched-parent requests, duplicates, unsupported parent updates, invalid
points/order, invalid lifecycle transitions and referenced deletions return
consistent safe status/error shapes. Rejected requests leave structures unchanged.

All 36 successful setup mutations carry the verified UID in audit logs (31 for
the first competition, five for the second). Concurrent before/after audit
snapshots form a consistent chain. Actual SQL audit failures injected through the
production connection boundary roll back all six setup resource types; a real
SQL read failure is sanitized. No partial competition, settings, entity or audit
write survives. Earlier module tests continue to cover rollback on updates/deletes
and concurrent duplicate/deletion cases.

## Schema and migration validation

Migration 0004 remains unchanged. Existing compatibility tests verify its default
zero on preexisting categories/events. The workflow checks its two scoped ordering
indexes and deterministic API output. The runner applies all current migrations
in temporary schemas and a rerun applies zero files. Existing concurrent runner,
failing DDL rollback and migration-history tests are retained with the expected
current migration count.

Normal Supabase was inspected **read-only**. At inspection, migrations 0001–0004
were applied, both ordering columns existed, the event/result FK still cascaded,
and there were zero competitions. Migrations 0005 and 0006 were not applied there.
Normal tables, records, grants, roles and schema were not reset, dropped or changed.
Only random `tkt05d_<hex>` schemas contain review fixtures and temporary grants;
they explicitly set/check search path and are removed after testing.

## Verification

Final hardened-schema verification:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed (existing frontend TypeScript check) |
| `npm run build` | Passed |
| `npm test` | Passed: 100 backend and 14 frontend tests, zero failures/skips |
| Targeted integrity tests | Passed: direct deletion and both Supabase client-role safeguards |
| Targeted production-app workflow | Passed; the final full run also covers injected SQL failures |

The deletion regression failed before the fix with a missing expected FK rejection.
The initial complete run with migration 0005 passed 99 backend tests and 14
frontend tests; all final tests were then rerun with migration 0006. The final
read-only normal-database check confirmed zero remaining TKT-05D schemas, the same
four applied migrations and zero competitions. Normal RLS and cascade behavior
remain unchanged because neither new migration was applied there.

Full-suite commands require PostgreSQL with the existing `TKT03_REQUIRE_POSTGRES`
and `TKT05A/B/C/D_REQUIRE_POSTGRES` flags set to `1`. Test-process-only statement
and query timeouts are 60000/75000 ms to accommodate concurrent migration advisory
locks across independent schemas. No persistent environment settings are changed.

## Files changed

Created:

- `backend/migrations/0005_protect_event_results.sql`
- `backend/migrations/0006_restrict_client_database_access.sql`
- `backend/test-support/setup-postgres.js`
- `backend/test/setup-integrity.integration.test.js`
- `backend/test/setup-workflow.integration.test.js`
- `backend/docs/TKT-05D-report.md`

Modified:

- `backend/test/schema.integration.test.js` (expected migration count)
- `backend/src/services/catalog.js` (guard comment reflecting the new FK)
- `backend/docs/category-event-api.md`
- `backend/docs/schema.md`
- `backend/migrations/README.md`
- `README.md`

## Remaining risks, limitations and rollout

The two confirmed database risks remain in the normal database until migrations
0005 and 0006 are explicitly applied. They have been fixed and verified in source
and isolated schemas only. Apply them before candidate/result management or public
exposure. No deployment is performed by this review.

The backend must use a trusted owner/BYPASSRLS connection. A read-only ownership
check confirmed the currently configured backend role meets that requirement.
A future least-privilege
backend role requires explicit server-only policies/grants. Future tables and
sequences need equivalent protection; existing global defaults are unchanged.
Trusted owners/service credentials can still bypass RLS or intentionally purge
competition data; keep them server-only. Future public result access must use a
limited projection/policy, not broad client table grants.

Multiple active competitions remain permitted by the explicit existing schema
requirements. Names retain exact-text uniqueness, lists remain unpaginated, and
there is no aggregate structure endpoint or atomic bulk setup/reorder operation.
Each mutation is atomic; an entire multi-request setup is not one transaction.
The original database points check accepts broader numeric values than API writes;
legacy/operator-written values must be reviewed before future scoring. Future
leaderboards must use current shared points and handle unconfigured positions.

No secrets, environment files, dependencies, earlier migrations or existing
commits are modified. Local commit `ef5c46f` contains the two database fixes and
their regression tests: `fix(db): protect results and close Supabase client access bypass`.
The complete workflow test and review documentation form a separate local commit;
its hash and final working-tree status are supplied in the final chat report.
No push, merge, rebase or deployment occurs.
