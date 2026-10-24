# TKT-06A implementation report

Implemented the five Firebase-admin candidate endpoints documented in
[candidate-api.md](candidate-api.md), following the existing router/controller/
service and transaction architecture. The external candidate code is stored
verbatim and remains unique within its competition. The internal database ID is
only a relational key and never substitutes for the external code.

`resolveCandidate(query, input, actor)` creates or reuses candidates within the
caller's transaction, validates all parent relationships, rejects exact-name or
affiliation conflicts, and creates audit records only for mutations. The existing
unique constraint serializes concurrent attempts. There are no independent
commits. Management PATCH permits name correction only; identity and affiliation
fields cannot be reassigned, and no candidate deletion API exists.

## Files

Created:

- `backend/src/services/candidates.js`
- `backend/src/controllers/candidates.js`
- `backend/src/routes/candidates.js`
- `backend/test-support/candidates-http.js`
- `backend/test/candidates.test.js`
- `backend/test/candidates.integration.test.js`
- `backend/docs/candidate-api.md`
- `backend/docs/TKT-06A-report.md`

Modified:

- `backend/src/config/app.js` (mount candidate router)
- `README.md` (link candidate API documentation)

## Database and environment

No migrations, dependency changes, persistent environment changes, or normal
application-table writes. Existing uniqueness, composite foreign keys, timestamp
triggers and audit tables are reused. The PostgreSQL harness creates, migrates and
drops a random isolated schema using the configured trusted backend connection.
Tests need local HTTP and PostgreSQL network access outside the restricted sandbox.
The initial direct root-directory smoke test skipped PostgreSQL because the
backend `.env` was not loaded. Final verification uses root `npm test`, whose
backend workspace loads the existing environment correctly. Credentials are never
printed or committed.

For the complete suite, test-process-only `TKT03_REQUIRE_POSTGRES` and
`TKT05A_REQUIRE_POSTGRES` through `TKT05D_REQUIRE_POSTGRES` flags are set to `1`.
The candidate suite reuses the TKT05B harness and its required-PostgreSQL flag.
Statement/query timeouts are 60000/75000 ms for concurrent migration locks across
test schemas. No environment files are edited.

## Limitations

Lists remain unpaginated, matching current APIs. Names/codes retain exact,
case-sensitive text; resolution rejects name differences rather than guessing
identity. Name corrections require a deliberate audited PATCH. Unit, category,
Madrassa and code correction/reassignment are intentionally unsupported.
Future result writers must pass their transaction query and verified UID, await
all operations, and propagate failures. The default isolation is READ COMMITTED;
stronger isolation requires whole-transaction serialization retries. Firebase
verification is exercised with injected tokens and existing SDK-boundary tests;
no live user provisioning is performed. No result entry, publishing, scoring,
leaderboards, frontend screens, push, merge, rebase or deployment is included.

## Verification results and commits

- `npm run lint`: passed (zero warnings).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed, 111 backend tests and 14 frontend tests, zero failures and
  zero skips. All PostgreSQL suites executed against real PostgreSQL.
- `git diff --cached --check`: passed after removing an extra trailing blank line
  in the new HTTP helper.

Implementation/tests and documentation are committed in separate local commits.
Exact commit hashes and the final clean working-tree status are supplied in the
final chat report (avoiding a self-referencing documentation commit hash).
