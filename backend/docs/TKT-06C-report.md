# TKT-06C implementation report

Implemented result review, publication, corrections and public reads on the
existing TKT-06A/B services. No leaderboard, scoring API, ranking algorithm,
frontend, polling or exceptional shared-position override workflow was added.

## Endpoints and lifecycle

Admin base:
`/api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result`

- GET base (any lifecycle state, current version, active correction ID).
- POST `/review`, `/return-to-draft`, `/publish`.
- POST `/corrections` (requires current live version and a reason).
- GET/PUT `/corrections/:correctionId`.
- POST `/corrections/:correctionId/review`, `/return-to-draft`, `/publish`.

Public base: `/api/competitions/:competitionId`

- GET `/results` with optional category_id filter.
- GET `/categories/:categoryId/results`.
- GET `/categories/:categoryId/events/:eventId/result`.
- GET `/categories/:categoryId/events/:eventId/result/status`.

See [API documentation](result-lifecycle-api.md) for payloads, response examples,
validation, concurrency, public privacy rules and migration instructions.

Original results transition draft -> reviewed -> published, with reviewed -> draft
clearing review. Review and publish require a nonempty points-position map and
exactly one ordinary winner per configured position. There is no hardcoded count
of winners. Zero-point positions still require winners. Publication revalidates
relationships, completeness and the fingerprint recorded by review. Candidate,
display metadata or shared settings changes block outdated reviews. Reviewer and
publisher UIDs/timestamps derive from verified Firebase identity. Self-review is
permitted; no extra approval-separation policy is invented.

All operations retain TKT-06B's full-precision opaque version. Parent/result locks
serialize edits and transitions; stale tokens return 409. Reviewed/published
originals remain protected from ordinary draft editing. Duplicate/concurrent
publication creates one public snapshot and one audit. Public availability never
reveals whether an unpublished event is uninitialized, draft or reviewed.

## Correction design and migration

The prior schema has only one live result and one set of entries per event. It
cannot hold a correction draft alongside unchanged published entries. Migration
0007 is the smallest normalized extension used here:

- `event_results.review_snapshot` stores the reviewed metadata/settings fingerprint.
- `result_publications` stores immutable-through-API public winner projections and
  reviewer/publisher metadata. Old snapshots are retained when a correction applies.
- `result_corrections` holds draft/reviewed/applied workspaces, base publication FK,
  reason, review/application metadata and its own optimistic version.
- `correction_entries` holds separate normalized candidates/positions with scoped
  FKs and unique candidate/position per workspace. A partial unique index allows
  only one active correction per result.

Migration 0007 backfills existing published rows into snapshots. Existing reviewed
rows require return-to-draft and a fresh review because they lack a fingerprint.
New tables/sequences use the existing server-only RLS/privilege boundary; no global
roles/default privileges change. Old migration files are unchanged.

Correction drafts copy winner IDs into separate entries and use the TKT-06A
resolver when edited, preserving externally assigned string codes. Public snapshots
freeze candidate/unit/Madrassa names as well as winners, so independent candidate
name correction does not leak into a published result. Review and publish require
current matching data. Applying a correction checks the base, replaces live
entries/header, appends a snapshot, marks the workspace applied, and records a
before/after audit atomically. A failed entry/publication/audit operation rolls back
all changes. Published snapshots remain unchanged while preparing/reviewing and
after failed corrections. Applied workspaces/history remain retained.

Public queries select one complete committed snapshot; no draft/reviewed/correction
entries or actor/fingerprint/reason data are included. Lists and winners have
stable deterministic ordering and support events with no published result.

## Files

Created:

- `backend/migrations/0007_result_publications_and_corrections.sql`
- `backend/src/services/resultLifecycle.js`
- `backend/src/controllers/resultLifecycle.js`
- `backend/src/routes/resultLifecycle.js`
- `backend/test-support/result-lifecycle-http.js`
- `backend/test/result-lifecycle.test.js`
- `backend/test/result-lifecycle.integration.test.js`
- `backend/docs/result-lifecycle-api.md`
- `backend/docs/TKT-06C-report.md`

Modified:

- `backend/src/config/app.js` (admin/public router mounts).
- `backend/src/services/resultDrafts.js` (export unchanged validation/lock helpers
  and version expression for consistent reuse).
- `backend/test/schema.integration.test.js` (expected migration history count).
- `backend/test/setup-workflow.integration.test.js` (new migration history entry).
- `backend/test/setup-integrity.integration.test.js` (new protected tables and
  sequences, migration count).
- `README.md`, `backend/docs/schema.md`, `backend/migrations/README.md`.

## Environment and migration instructions

No dependencies, credentials, environment files or persistent configuration were
changed. Normal application data/schema were not migrated. Integration tests
create/migrate and drop isolated schemas with explicit search-path checks. The
legacy-publication migration test reconstructs the old shape inside one isolated
transaction and deliberately rolls it back after verifying backfill.

Before using this backend against an application database, run the existing
`npm run db:migrate` command explicitly in that intended environment with the
trusted backend owner/BYPASSRLS connection. Normal migrations 0001-0007 must be
applied. No old migration should be edited or reapplied manually.

Network-enabled tests use loopback HTTP and the configured PostgreSQL destination.
Full-suite process flags require all database suites (`TKT03_REQUIRE_POSTGRES`,
`TKT05A_REQUIRE_POSTGRES` through `TKT05D_REQUIRE_POSTGRES` = 1). Connection timeout
is 30000 ms; statement/query timeouts are 120000/150000 ms for serialized migration
locks across isolated schemas. The new suites reuse the TKT05B harness and flag.
These values apply only to the test process and do not change saved settings.

## Limitations

Lists are unpaginated. A correction replaces the full winner list and has no
cancel/delete operation; admins can resume its active ID from the main result.
Candidate identity/affiliation rules remain those of TKT-06A, with exact-name
matching and no automatic reassignment. Published display metadata changes require
controlled correction publication. Historical public versions are retained in the
database and audits, without a separate public history endpoint.

Future writers must lock/update headers and respect versions and snapshots. Trusted
SQL owners can bypass application rules; manual published-row inserts after 0007
do not create public snapshots. Legacy already-published snapshots are preserved
without retroactive completeness enforcement. Client database roles cannot directly
access snapshots or correction tables; public viewing uses only backend projections.
Firebase scenarios use injected verifier/SDK boundaries, not live user provisioning.

No push, merge, rebase or deployment was performed. Local commits are grouped into
schema/protection, implementation/tests and documentation. Exact hashes and final
working-tree status are provided in the final chat report.

## Verification results

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Focused lifecycle HTTP/PostgreSQL tests | 18 passed, zero failures/skips |
| `npm test` | 144 backend tests and 14 frontend tests passed, zero failures/skips |

All PostgreSQL suites executed. Coverage includes migration backfill, completeness,
review/return/publish transitions, unchanged public visibility during correction,
review invalidation after candidate/configuration changes, concurrent publishing
and editing, SQL/audit rollback, verified attribution, anonymous published reads,
unpublished privacy, relationship/isolation checks, role/sequence protection and
preserved deletion safeguards. Existing tests remain passing with their migration
history/security expectations extended for 0007.
