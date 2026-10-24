# TKT-03 completion report

Date: 2026-10-24. Scope: core PostgreSQL schema for the Sargolsav competition
application, built on the existing TKT-02 migration runner. See [schema.md](schema.md)
for the complete textual ERD and transaction-level service contract.

## 03-A: Competition structure

Migration: `0001_competition_structure.sql`.

Creates `competitions`, `units`, `madrasas`, `categories`, and `events`.
Competitions have draft/active/archived lifecycle states. Each child belongs to
exactly one competition. Units may have zero or more madrasas; each event belongs
to one category. Composite foreign keys prevent cross-competition associations.
Names are unique within their owning scopes, and competition codes are globally
unique. Internal keys are bigint identities; mutable rows have timestamptz
creation/update columns. Names and codes must be nonblank.

## 03-B: Candidates, results, settings and local fixtures

Migration: `0002_candidates_and_results.sql`.

Creates `candidates`, `event_results`, `result_entries`, and
`competition_settings`, plus the JSONB points-validation function.

- Candidate codes are mandatory caller-supplied text, unique per competition;
  leading zeros are preserved and no candidate-code generator exists.
- Every candidate has a unit and category. An optional madrasa must belong to
  that same unit and competition.
- A candidate can appear in multiple events in their category. Result entries
  describe winners, not registration or complete event participation.
- Each event has at most one result set. Draft/reviewed/published states have
  consistent reviewer/publisher identity references and timestamps.
- Each competition has at most one settings row containing a shared position
  points object. Position keys are canonical positive 32-bit integers and values
  are JSON numbers. Missing settings or an empty object represent unconfigured
  scoring; no permanent point schedule is embedded in migrations.
- No leaderboard totals are stored. Future standings must sum every published
  result entry, including multiple winners from one unit and approved ties.

Adds `npm run db:seed`, the development SQL fixture, seed helpers and guard tests.
The CLI requires NODE_ENV development/test, ALLOW_DEV_SEED=1, and a loopback host.
It atomically inserts a small `local-demo` competition with sample points,
codes `001`/`002`, and an empty draft result. Repeating it preserves existing demo
data. Seeding never runs automatically with migrations or server startup.

## 03-C: Audit, integrity, indexes and verification

Migration: `0003_audit_and_integrity.sql`.

Creates `audit_logs`, the shared-position override relationship, lookup indexes,
the partial unique position index, and automatic updated_at triggers.

Database-enforced rules include:

- All competition/category relationships and candidate madrasa/unit consistency.
- One candidate entry per event, even when an override exists.
- Positive integer winning positions and unique ordinary positions per event.
- Exceptional shared-position entries must reference an audit record for the
  same event and competition, with action `shared_position_override`, a nonblank
  actor reference and reason. A blanket position uniqueness constraint is avoided.
- Referenced override audits cannot be deleted/reassigned while in use.
- Competition deletion atomically cascades its own configuration, candidates,
  results, settings and audit records. Other competitions remain intact. There is
  no cascading relationship into admin accounts.
- Standalone deletion of referenced units/categories/candidates is blocked.
  Event deletion cascades its result set but is blocked by existing audit references.

Future transaction-level services must authenticate admins, derive trusted actor
references, validate override approval context, write audit and entries atomically,
lock result rows for edits/reviews/publication, invalidate stale reviews, and
validate configured positions and eligibility before publication. Database checks
validate state shape; they do not authenticate actors or enforce transition order.
Audit mutation privileges must be restricted by future deployment/service work.

## Validation

The full suite passes: **33 tests, 0 failures, 0 skips**, including real PostgreSQL
tests using the configured credentials. Lint, frontend typecheck and production
build also pass. Integration coverage includes:

- Real migration execution, reruns, concurrent runners and failed-DDL rollback.
- Foreign keys, scoped uniqueness, cross-competition/category boundaries,
  madrasa/unit mismatch, mandatory external codes and leading-zero preservation.
- Duplicate candidate/ordinary-position rejection, invalid positions, audited
  ties, wrong approval action/event rejection and referenced-audit protection.
- Settings validation, review/publication metadata, and derived published points
  from multiple candidates in the same unit.
- Candidate results across multiple events, timestamp updates, seed repeatability
  and preservation of edited fixtures.
- Populated competition deletion with overrides, retaining another competition
  and its unit. A separate admin-account fixture is retained.

On a temporary local PostgreSQL 17.4 cluster, the migration CLI applied three
files, then zero on rerun. The seed CLI ran twice and preserved one fixture.
That server was stopped and its files removed.

The configured database ignored startup search-path options during the first
follow-up test run, so the three schema migrations were applied in `public`.
No existing tables were deleted; fixture changes were rolled back. The harness
was corrected to explicitly set and verify schema isolation before test SQL,
recover aborted transactions before checking scope, and release failed clients.
A flaky mock assertion was corrected to accept either concurrent runner acquiring
the lock first. Completed runs remove their isolated schemas. Final follow-up
checks found three public migration records, zero competition rows and zero
leftover test schemas. The configured database is now migrated.

## Outstanding policy decisions and limits

Before implementing scoring/publication services, decide whether settings changes
rescore published results or require frozen versions; whether negative/fractional
points are permitted; and the rules for corrections, self-review and empty-result
publication. Current numeric validation does not invent those policies.

Other PostgreSQL versions, hosted TLS behavior, transaction-mode connection
poolers and future authorization/service behavior are not comprehensively verified.
Integration tests require CREATE SCHEMA rights and a direct or session-pinned
connection. Explicit TEST_DATABASE_URL or TKT03_REQUIRE_POSTGRES=1 makes database
unavailability fatal; otherwise the integration test explicitly reports a skip.

No APIs, authentication implementation, registration workflows, participation
limits, scoring service, leaderboard endpoints, frontend features or deployments
were added. Applied migrations and the TKT-02 runner were not rewritten.
Credentials, local environment files and generated builds are excluded from Git.

## Commit grouping

1. 03-A: competition structure migration.
2. 03-B: candidates/results/settings migration, guarded local seed and seed tests,
   and package-script wiring.
3. 03-C: audit/integrity migration, PostgreSQL integration tests, concurrency-test
   correction, schema/reference documentation and this completion report.
