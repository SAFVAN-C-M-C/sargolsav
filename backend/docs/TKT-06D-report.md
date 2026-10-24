# TKT-06D implementation report

Implemented explicit, reasoned shared-position saves for both original result
drafts and published-result correction drafts, reusing the existing audit table,
`shared_position_override` action, live-entry FK/index pattern, candidate resolver,
Firebase admin middleware, transaction helper and optimistic versions.

## APIs and behavior

New PUT endpoints:

- `/api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result-draft/shared-positions`
- `/api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result/corrections/:correctionId/shared-positions`

Both require exactly `version`, `shared_positions: true`, `reason` and the complete
`entries` set. They return the existing draft/correction envelope. Meaningful
reasons require two words and ten letters/digits overall, at most 1000 trimmed
characters and no NUL. Only the existing verified `admin: true` claim is required;
no new role, claim or Super Admin concept is introduced.

Ordinary saves retain duplicate-position rejection and reject edits to existing
override entries. Explicit saves issue a new approval for exact tied positions
and candidate membership. All tied members reference the approval; singletons
have null override IDs. Explicit removal also records a reasoned audit, then
ordinary editing becomes available again. There is no persistent enabled flag.
Duplicate candidates, invalid positions, unknown fields, ID/affiliation conflicts
and cross-competition/category attachment remain rejected.

Review/publication require every configured position, with additional winners
accepted only when their shared approval exactly matches the submitted groups.
The service rechecks scoped audit action, actor/reason, group membership and
workspace provenance. Approval identity/details are included in private review
fingerprints. Returning to draft clears prior review; edits advance the version;
reviewed/published originals and applied corrections remain protected. Concurrent
same-version edits/publications yield one success and one conflict.

Corrections copy unchanged published approval provenance. Inherited approvals are
accepted only while tied groups/audit IDs exactly match the current live published
entries, including approval originally issued by a previous applied correction.
Changing or clearing ties uses the explicit correction save and fresh audit.
Published entries/snapshots stay unchanged until correction publication commits.

Public APIs preserve all tied winners with deterministic position/code/ID ordering
for new snapshots. Private reasons, audit references, actors and fingerprints are
not added to public projection. Each winner retains a distinct row at the actual
winning position, so a future scorer can award the full configured points per
entry without dividing or collapsing ties. No scoring or leaderboard code/API,
frontend management screen or polling was added.

## Database and audit

New migration `0008_correction_shared_positions.sql` extends `correction_entries`
with nullable `override_audit_id`, generated action marker, the existing-style
scoped audit FK and lookup index. It replaces unconditional per-correction
position uniqueness with a partial unique index for ordinary entries. Candidate
uniqueness, scope FKs, RLS/grants and deletion protections remain in force.
Existing correction rows remain ordinary/null overrides. No new tables, sequences,
roles, global privileges or dependencies are created; migrations 0001-0007 are
unchanged.

Each explicit save writes `shared_position_override` with verified Firebase UID,
trimmed meaningful reason, database timestamp, affected competition/event/live
result/correction, prior version and old/new tied groups with sorted candidate IDs.
Standard draft/correction update audits store full before/after entries. Candidate
creation, approval, replacements, version changes and mutation audits share one
transaction. Publication also atomically replaces live entries and snapshots;
SQL/audit errors roll back all intermediate work. Referenced approvals cannot be
deleted through trusted SQL without first satisfying their FKs. There is no API
for submitting/reusing audit IDs or updating/deleting approval history.

## Files

Created:

- `backend/migrations/0008_correction_shared_positions.sql`
- `backend/src/services/resultErrors.js` (shared error class, re-exported at its
  original location to preserve existing imports and avoid circular dependencies)
- `backend/src/services/sharedPositions.js`
- `backend/test/shared-positions.test.js`
- `backend/test/shared-positions.integration.test.js`
- `backend/docs/shared-position-api.md`
- `backend/docs/TKT-06D-report.md`

Modified:

- `backend/src/services/resultDrafts.js`
- `backend/src/services/resultLifecycle.js`
- `backend/src/controllers/resultDrafts.js`
- `backend/src/controllers/resultLifecycle.js`
- `backend/src/routes/resultDrafts.js`
- `backend/src/routes/resultLifecycle.js`
- `backend/test/schema.integration.test.js`
- `backend/test/setup-integrity.integration.test.js`
- `backend/test/setup-workflow.integration.test.js` (migration history expectations)
- `README.md`, `backend/migrations/README.md`, `backend/docs/schema.md`,
  `backend/docs/result-draft-api.md`, `backend/docs/result-lifecycle-api.md`

See [shared-position API documentation](shared-position-api.md) for payloads,
validation, inherited/removal behavior, audit details and errors.

## Environment and migration instructions

No dependencies, credentials, environment files or persistent configuration were
changed. Migration 0008 was applied only inside isolated test schemas. Before
using these APIs with application data, explicitly run `npm run db:migrate` in
that intended environment with the existing trusted owner/BYPASSRLS connection.
Normal application schema/data was not migrated, pushed or deployed by this ticket.

Tests reuse the schema-pinned PostgreSQL harness, creating/migrating and dropping
only random isolated schemas. Test-only trusted SQL tampering exercises approval
membership/fingerprint defenses; normal APIs do not permit those writes. Existing
migration-count expectations now include 0008. No earlier tests are removed.

Network-enabled checks use loopback and the configured PostgreSQL destination.
Full-suite process flags require every PostgreSQL suite (`TKT03_REQUIRE_POSTGRES`
and `TKT05A_REQUIRE_POSTGRES` through `TKT05D_REQUIRE_POSTGRES` = 1). Connection,
statement and query timeouts are 30000/120000/150000 ms for concurrent schema
migrations. The new suite reuses the TKT05B harness/require flag. These values are
not saved in environment files.

## Remaining limitations

Entry edits replace the complete set. Every explicit save approves that complete
tied-group set with one reason/audit; separate per-group reasons are not exposed.
Reason syntax cannot verify the truth of an explanation; authorized admins must
provide accurate context. Existing lists remain unpaginated and correction
cancellation/public historical-version endpoints remain outside scope.

Legacy/operator-written overrides lacking exact supported approval metadata need
explicit reauthorization before new review/publication. Existing stored public
snapshots stay visible during correction. Future database writers must retain
header locking/version advancement and approval validation. Trusted SQL owners
remain capable of bypassing service-level rules. Future scoring must sum each
winner's full configured position value; no scorer is implemented here.

Verified work is committed locally in schema/protection, implementation/tests and
documentation groups. Exact hashes and final working-tree status are supplied in
the final chat report. No push, merge, rebase or deployment is performed.

## Verification results

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Focused shared-position HTTP/PostgreSQL tests | 15 passed, zero failures/skips |
| `npm test` | 159 backend tests and 14 frontend tests passed, zero failures/skips |

Every PostgreSQL suite executed. Coverage includes default duplicate rejection,
explicit flag/reason validation, ordinary admin authorization, duplicate-candidate
protection, full configured-position coverage, ties through review/publication,
changed approval/membership detection, inherited and fresh correction approvals,
concurrent saves/publishing, SQL/audit rollback, complete removal, public ordering/
privacy, scoped audit FKs, referenced-history deletion protection and whole-
competition cleanup inside the isolated schema. Existing tests remain passing.
