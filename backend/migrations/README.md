# Database migrations

Run npm run db:migrate from the repository root. TKT-03 adds three business
schema migrations (03-A, 03-B, 03-C). See ../docs/schema.md for the ERD, integrity
boundaries, local seed, deletion behavior and real PostgreSQL tests. The TKT-02
runner also creates schema_migrations, even when this folder has no SQL files.

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
