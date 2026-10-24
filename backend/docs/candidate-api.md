# Candidate management and resolution (TKT-06A)

All endpoints require `Authorization: Bearer <Firebase ID token>` with the verified
boolean `admin: true` claim. Responses use `Cache-Control: no-store`. There is no
public registration, deletion, result projection, or candidate-resolution HTTP API.
The database and JSON spelling is `madrasa_id`, matching the existing Madrassa API.

Base: `/api/admin/competitions/:competitionId/candidates`

| Method | Path | Behavior |
| --- | --- | --- |
| POST | base | Create; 201 `{ "candidate": ... }`; duplicate code returns 409 |
| GET | base | 200 `{ "candidates": [...] }`, newest internal ID first |
| GET | base + `/lookup?candidate_code=001` | Exact external code lookup; 200 `{ "candidate": ... }` |
| GET | base + `/:candidateId` | Internal database ID lookup; 200 `{ "candidate": ... }` |
| PATCH | base + `/:candidateId` | Audited name correction; 200 `{ "candidate": ... }` |

List supports optional `unit_id` and `category_id` query parameters together or
separately. Foreign or nonexistent filter IDs produce an empty list, never data
from another competition. Unknown or repeated query fields are rejected.

Create example:

```http
POST /api/admin/competitions/1/candidates
Authorization: Bearer <token>
Content-Type: application/json

{"candidate_code":"001","name":"Candidate Name","unit_id":"2","category_id":"3","madrasa_id":"4"}
```

Example response (timestamps abbreviated here):

```json
{"candidate":{"id":"5","competition_id":"1","candidate_code":"001","name":"Candidate Name","unit_id":"2","category_id":"3","madrasa_id":"4","created_at":"2026-10-24T00:00:00.000Z","updated_at":"2026-10-24T00:00:00.000Z"}}
```

`madrasa_id` may be omitted or null. For a correction send only
`{"name":"Corrected Name"}` to PATCH. Codes, competition and affiliations are
immutable through management APIs, including for candidates without results.
Name corrections retain the internal ID and all existing result references;
operators must use corrections only for the same person. Audits store before and
after values. No candidate deletion endpoint is provided.

IDs must be canonical positive PostgreSQL bigint strings (up to
9223372036854775807). Codes and names must be nonblank strings without NUL.
Their exact text is preserved: codes are never generated, trimmed, case-folded or
converted to numbers; `001` and `1` are different codes. Codes are unique per
competition, and may repeat across competitions. Candidate names are not unique;
multiple candidates in the same unit may have the same name and distinct codes.
Unit/category must belong to the competition. A supplied Madrassa must belong to
both the competition and the selected unit. Unknown body fields, including actor
identity, are rejected. HTTP mutation audit attribution uses `request.auth.uid`.

Invalid input/relationships return 400, missing competition/candidate returns
404, duplicates/conflicting identities or changed FK references return 409.
Authentication returns 401/403 or 503 for verification unavailability. Unexpected
failures return sanitized 500 responses without SQL or credential details.

## Reusing the resolver in a future transaction

`backend/src/services/candidates.js` exports `resolveCandidate(query, input, actor)`.
`input` has `competition_id`, `candidate_code`, `name`, `unit_id`, `category_id`,
and optional `madrasa_id`; all IDs and codes are strings. `actor` must come from
the verified Firebase UID at the trusted caller boundary, never from a request body.

```js
await db.transaction(async (query) => {
  const candidate = await resolveCandidate(query, {
    competition_id: competitionId,
    candidate_code: '001',
    name: 'Candidate Name',
    unit_id: unitId,
    category_id: categoryId,
    madrasa_id: madrasaId,
  }, request.auth.uid);
  // Future result persistence must use this same query and candidate.id.
  // Propagate failures out of this callback so everything rolls back.
  return candidate;
});
```

The resolver validates relationships and inserts with `ON CONFLICT
(competition_id, candidate_code) DO NOTHING`. A successful insert writes an audit
in the same transaction. A conflict loads and locks the existing candidate and
reuses it only if name, unit, category and nullable Madrassa exactly match.
Omitting Madrassa means null, not permission to ignore an existing association.
A mismatch returns a `CandidateError` with status 409 without updating anything.
Reuse creates no mutation audit. Concurrent attempts rely on the existing unique
constraint; one insert wins and others read its committed row. Parent key-share
locks protect validation against concurrent deletion or reassignment.

Use the existing `db.transaction` default READ COMMITTED isolation, await each
query, and propagate all failures. The resolver starts no transaction, opens no
connection and performs no commit. An outer failure rolls back both newly created
candidates and their audit rows. Callers choosing stronger isolation must handle
PostgreSQL serialization retries for the entire transaction.

No migration, dependency, frontend, scoring or result-entry changes are required.
Lists follow existing unpaginated conventions. Names and codes use exact,
case-sensitive text comparison.

## Verification

`npm test` includes HTTP authentication/validation/mounting/error tests and real
PostgreSQL HTTP/service tests for creation, lookups, filters, optional Madrassas,
relationships, cross-competition isolation, duplicate/concurrent creation, reuse,
conflicts, result reference preservation, audit attribution and SQL rollback.
The PostgreSQL suite reuses `withParticipantDatabase`: an isolated random schema
is migrated and dropped, leaving normal tables untouched. Set `TEST_DATABASE_URL`
to override the configured connection. Set `TKT05B_REQUIRE_POSTGRES=1` to require
execution rather than skip on unavailable PostgreSQL. Run from `backend` (or use
root `npm test`) so the existing backend `.env` is loaded.
