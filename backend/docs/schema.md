# TKT-03 PostgreSQL schema

## Review chunks

| Chunk | Migration | Supporting files |
| --- | --- | --- |
| 03-A | `0001_competition_structure.sql` | This ERD and ownership documentation |
| 03-B | `0002_candidates_and_results.sql` | `seeds/development.sql`, `src/db/seed*.js`, package scripts |
| 03-C | `0003_audit_and_integrity.sql` | `test/schema.integration.test.js`, `test/seed.test.js`, integrity/service contract below |
| 05-C | `0004_category_event_order.sql` | `docs/category-event-api.md`, `test/catalog.integration.test.js` |
| 05-D | `0005_protect_event_results.sql`, `0006_restrict_client_database_access.sql` | `docs/TKT-05D-report.md`, `test/setup-*.integration.test.js` |

All migrations use the unchanged TKT-02 runner. These are new files, not replacements
for applied migrations. Run `npm run db:migrate` explicitly; reruns skip history.
PostgreSQL 14+ is the intended baseline (local verification version is reported
separately). No extensions are required.

## Relationships (textual ERD)

```text
competitions 1 --- * units 1 --- * madrasas
competitions 1 --- * categories 1 --- * events
competitions 1 --- 0..1 competition_settings
units       1 --- * candidates (* --- 0..1 madrasas, same unit)
categories  1 --- * candidates
events      1 --- 0..1 event_results 1 --- * result_entries * --- 1 candidates
competitions 1 -- * audit_logs (* --- 0..1 events)
audit_logs  1 --- * result_entries (optional shared-position override reference)
```

Every business row carries `competition_id`; composite foreign keys bind all
relationships to that competition. Candidate/result/event category IDs must also
agree. Repeated scope IDs are integrity keys, not independently editable labels.
One category per candidate and one category per event; multiple events may use
the same category. There is no candidate registration/participation table yet:
result entries describe winners only. Future registration can add an explicit
candidate/event junction and configurable limits without changing candidate codes.

## Conventions and lifecycle

Plural snake_case tables, singular `_id` columns, `bigint GENERATED ALWAYS AS
IDENTITY` internal primary keys. `candidate_code` is mandatory caller-supplied
text with no default: `001` stays `001`. Codes are unique per competition. Display
names are unique per owning scope (units/categories per competition, madrasas per
unit, events per category). Text comparison is case-sensitive; no implicit
trimming, case folding, numeric conversion, or code format policy is imposed.
Names/codes cannot be blank. `madrasas` is the consistent database spelling.

TKT-05C adds `sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0)` to
categories/events. Existing records receive zero. Their management lists use
`sort_order ASC, id ASC`, with indexes matching competition/category scope. Names
remain configurable and parent relationships remain immutable through the APIs.
See the [category/event API contract](category-event-api.md).

TKT-05B exposes [unit and Madrassa management APIs](unit-madrasa-api.md) using these
unchanged relationships and uniqueness constraints. Parent IDs are fixed by the
URL scope. Unit deletion is blocked by Madrassas/candidates, and Madrassa deletion
is blocked by candidates; these APIs never cascade child records or results.

Mutable tables have `created_at` / `updated_at` as `timestamptz`, initially `now()`.
03-C update triggers set `updated_at` using `clock_timestamp()`; callers should
omit these columns. Audit rows have only `created_at`. Competition status is
`draft`, `active`, or `archived`; multiple active competitions are allowed.
Archiving is reversible and does not delete data. Child configuration is edited
in place; deletion policies below protect existing references.

`event_results` has one row per event, with states `draft`, `reviewed`, `published`.
Drafts have no review/publication metadata; reviewed rows require reviewer/time;
published rows require both reviewer/time and publisher/time, in time order.
`reviewed_by`, `published_by`, and `audit_logs.actor_ref` are opaque, nonblank
identity references. TKT-04A supplies a verified Firebase UID for future writers;
there is no admin table. The database checks state shape, not the sequence of
transitions or actor authority.

## Points and derived standings

`competition_settings.position_points` is one JSONB object shared by every event
in a competition. Keys are canonical positive integer positions up to PostgreSQL
integer max; values must be JSON numbers. Arrays, strings, nulls, zero/negative
keys, leading-zero keys and oversized keys are rejected. `{}` is an unconfigured
object, not a scoring default. Missing settings are allowed before configuration.
No permanent 5/3/1 defaults, stored unit totals, or leaderboard tables exist.

Future queries join result entries to `event_results` with `status = 'published'`,
join candidates for unit grouping and look up each entry's position in the shared
settings. Sum **every** entry, including multiple winners from the same unit and
authorized ties. Never deduplicate by unit or count draft/reviewed results.

TKT-05A settles settings policy in the [competition API](competition-api.md):
API writes require non-negative safe whole-number points, and settings edits must
affect future published leaderboard calculations through current shared settings.
The original database constraint still accepts numeric values; legacy/direct SQL
data may need correction before scoring. No frozen snapshots or leaderboard
implementation are introduced. Empty/missing position configuration remains
allowed and requires explicit handling in future publication/scoring services.

Material business decisions still needed before scoring/publication services:

- Review invalidation, publication corrections, self-review and empty-result
  publication policy need service decisions. Metadata supports review but does
  not invent approval separation or lock results permanently.

## Enforced by PostgreSQL

- Primary keys, scoped names/candidate codes, mandatory fields and foreign keys.
- Candidates always have a unit/category. Optional madrasa must be in that unit
  and competition; units can have zero madrasas and any number of candidates.
- Event, result set and candidate scopes/categories agree. A candidate cannot
  appear twice in an event, regardless of position or override.
- Positive integer positions and one result set per event.
- Valid settings object and internally consistent review/publication metadata.
- Ordinary entries have unique `(event_id, position)` via a partial unique index.
  Each additional shared-position entry must carry `override_audit_id`. Its
  composite FK requires an audit row in the same competition/event with action
  `shared_position_override`, nonblank actor and reason. The generated
  `override_action` column is a constant FK discriminator, not client input.
  Every exceptional entry is audited; one ordinary winner may remain unaudited.
  Multiple exceptional entries may reference the same approval record.
- Referenced audit rows cannot be deleted or reassigned while entries use them.
- Indexes cover relationship lookups, deletion checks, published result selection,
  candidate results, ordinary position races, and audit timelines.

## Transaction-level service validation (future work)

Database clients are trusted migration/backend code; FK metadata does not
authenticate an admin. Future services must mount the TKT-04A authentication and
admin middleware, derive actor references from `request.auth.uid`, and atomically
write override audit + entries. Audit details should identify the position,
affected candidate IDs and approval context. Check that approval applies to the actual edit, including
when an entry references an existing approval; a FK alone cannot establish this.

Lock the parent `event_results` row (`SELECT ... FOR UPDATE`) for *all* entry,
review and publication edits, validate state transitions, invalidate a review when
entries change, and publish only the reviewed version. Use a consistent lock order
with the competition/settings row for points validation and settings edits. Every
awarded position must be configured before publication. Validate completeness,
eligibility and future participation limits there. Record changes in audit_logs;
restrict application database privileges to prevent audit updates/deletes during
normal operation. This ticket does not implement those services or grant scripts.

## Deletion

Every competition-owned table directly references competitions with `ON DELETE
CASCADE`. Deleting one competition removes all its owned data, including audit
records and settings, in one atomic statement. References to units, madrasas,
categories, candidates and override audits otherwise use `NO ACTION` (default),
preventing dangling or silently reassigned records. Migration 0005 changes the
event/result FK to `NO ACTION`: event deletion is blocked by any result set and
by event audit references. There are no foreign keys that cascade
from competition data into admin accounts. Integration tests include a populated
competition purge with an override and a second competition retained.

TKT-05C ordinary event DELETE additionally locks the event and rejects any result
set (draft/reviewed/published) before deleting. Migration 0005 adds the database
guard as well, so direct event DELETE cannot remove results either. Category
DELETE relies on existing event/candidate FKs. Full-competition cleanup remains
atomic: its direct competition FKs remove both events and results in the same
statement, even with the event/result `NO ACTION` check.

## Direct client database access (TKT-05D)

Migration 0006 enables RLS without client policies on all ten business tables and
`schema_migrations`, and revokes table privileges (including TRUNCATE) and owned
identity sequence privileges from PUBLIC and existing Supabase `anon` and
`authenticated` roles. It does not create or alter global roles or default
privileges. Plain PostgreSQL installations without those roles are supported.
Future application tables/sequences need equivalent protection in their own
migrations. The Firebase backend must connect with a trusted table-owner or
BYPASSRLS role; a new least-privilege backend role needs explicit server-only
policies/grants before use. Privileged database credentials remain server-only.

This closes the Supabase direct-write path around Firebase middleware and audit
logging. It also prevents unapproved reads of unpublished competition data.
Future public results require an intentionally limited read projection or policy;
no public read policy is introduced here. Tests use session-local role changes
only in temporary schemas and verify both grant denial and RLS behavior after
accidental DML grants. Normal Supabase permissions are not changed by tests.

Audit retention for a permanent competition purge is deliberately scoped to the
competition. A future service should archive/export audit evidence first if a
separate retention policy is adopted. No deletion API is included here.

## Local seed and repeatable verification

After migration, in PowerShell:

```powershell
$env:NODE_ENV = 'development'
$env:ALLOW_DEV_SEED = '1'
npm run db:seed
Remove-Item Env:ALLOW_DEV_SEED
Remove-Item Env:NODE_ENV
```

The CLI refuses non-loopback database hosts and requires both flags. Use only a
development/test database; flags cannot detect a production database on loopback.
It creates `local-demo`, one unit/madrasa/category/event, two caller-assigned example
codes `001`/`002` (one candidate without a madrasa), example settings and an empty
draft result. One atomic SQL statement; no deletes or updates. If `local-demo`
exists, the entire seed is a no-op, preserving edits. It never runs in migrations
or server startup. Remove the demo competition explicitly to reset that fixture.

`npm test` runs real PostgreSQL tests when the configured database is reachable.
Tests create a randomly named `tkt03_<hex>` schema, run actual migrations twice
(including concurrent runners and failing-DDL rollback), execute constraint,
workflow, JSON, override, scoped deletion and seed checks, then drop only that
schema. The database user needs CREATE SCHEMA rights. Normal database tables are
untouched. Each connection explicitly sets the search path and verifies its
current schema before test statements; rollback commands bypass this check so
expected constraint failures can recover. Startup connection options alone are
insufficient because some hosted connections ignore them. Use a direct or
session-pinned connection, not a transaction-mode pooler. Other connections must
not alter that test schema.

Set `TEST_DATABASE_URL` to a dedicated PostgreSQL database to override the normal
connection. This makes connection failures fatal; alternatively set
`TKT03_REQUIRE_POSTGRES=1` with normal PG configuration. Without either flag,
connection failure reports an explicit skip, never a claim that SQL was verified.
Permissions, migration or assertion failures after connection always fail tests.
Mock tests remain useful for runner error paths but do not replace these tests.

## Ticket verification (2026-10-24)

Verified using a separate temporary PostgreSQL 17.4 cluster on loopback: all 33
tests passed with zero skips; migration CLI applied 3 files, then 0 on rerun;
seed CLI ran twice and retained one demo competition and codes `001`/`002`.
`npm run lint`, `npm run typecheck`, and `npm run build` passed. The temporary
server was stopped and its files removed. At that initial verification the normal
database was not migrated because credentials were not configured. PostgreSQL 14–16, hosted TLS,
and future authentication/service validation remain unverified.

Follow-up with configured database credentials: all 33 tests passed with zero
skips, including real concurrent migrations, constraints, seed repeatability and
scoped deletion. Lint passed. Fixed a mock assertion that incorrectly assumed
which concurrent runner acquired the lock first. This connection ignored startup
search-path options; the initial follow-up run consequently applied the three
migrations in `public`. No existing tables were deleted, and fixture changes
were rolled back. The corrected harness explicitly sets and checks its schema.
Final read-only checks confirmed 3 public migration records, 0 competition rows,
and 0 leftover test schemas. The configured database schema is now migrated.
