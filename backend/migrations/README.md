# Database migrations

Run npm run db:migrate from the repository root. TKT-03 adds three business
schema migrations (03-A, 03-B, 03-C). TKT-05C adds `0004_category_event_order.sql`
for category/event display ordering; apply it before using those APIs.
TKT-05D adds `0005_protect_event_results.sql` (block standalone event/result
cascades) and `0006_restrict_client_database_access.sql` (RLS and client-role
privilege revocation). Apply both before proceeding to candidate/result work.
The backend connection must be a trusted table owner/BYPASSRLS role, or have
deliberately configured server-only policies/grants. Neither migration edits old
migrations, creates global roles, or changes global default privileges.
See ../docs/schema.md for the ERD, integrity
boundaries, local seed, deletion behavior and real PostgreSQL tests. The TKT-02
runner also creates schema_migrations, even when this folder has no SQL files.

TKT-06C adds `0007_result_publications_and_corrections.sql`: review fingerprints,
publication snapshots (including backfill of existing published results), and
separate correction workspaces/entries. New tables retain 0006's server-only
RLS/grant boundary. Apply it before using the lifecycle/public result APIs.
Previously reviewed records require a fresh review; published records remain
visible through backfilled snapshots. See `../docs/result-lifecycle-api.md`.

TKT-06D adds `0008_correction_shared_positions.sql`, mirroring live-entry override
audit FKs and partial ordinary-position uniqueness in `correction_entries`.
Candidate uniqueness, table RLS/grants and existing deletion protection remain.
Apply before explicit shared-position editing; see `../docs/shared-position-api.md`.

Add immutable UTF-8 NNNN_lowercase_name.sql files with unique four-digit prefixes.
They run in filename order, each in its own transaction, together with its history
record. Do not put BEGIN/COMMIT/ROLLBACK, nontransactional statements (such as
CREATE INDEX CONCURRENTLY), or session/advisory-lock commands in migration files.
SQL files are trusted source code, never user input. Fix an applied migration by
adding another migration; do not rename or edit applied files.

A session advisory lock serializes runners using this mechanism. A waiting runner
may time out; retry the command. Failed migrations roll back and remain pending;
previously committed migrations remain applied. Migration users need DDL rights
in the target schema. Run migrations explicitly before starting a new version.
