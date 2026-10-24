# Unit and Madrassa management APIs (TKT-05B)

All routes require `Authorization: Bearer <FIREBASE_ID_TOKEN>` and the verified
boolean custom claim `admin: true`. The existing authentication middleware checks
revocation. Responses have `Cache-Control: no-store`. No public routes or frontend
screens are added. Database and API paths use the existing spelling `madrasas`.

## Endpoints

Use `/api/admin/competitions/:competitionId/units` as the base path below.

| Method | Relative path | Request JSON | Success |
| --- | --- | --- | --- |
| POST | `/` | `{"name":"North Unit"}` | 201 `{"unit":{...}}` |
| GET | `/` | None | 200 `{"units":[...]}` |
| GET | `/:unitId` | None | 200 `{"unit":{...}}` |
| PATCH | `/:unitId` | `{"name":"Renamed Unit"}` | 200 `{"unit":{...}}` |
| DELETE | `/:unitId` | None | 204, empty body |
| POST | `/:unitId/madrasas` | `{"name":"Central Madrassa"}` | 201 `{"madrasa":{...}}` |
| GET | `/:unitId/madrasas` | None | 200 `{"madrasas":[...]}` |
| GET | `/:unitId/madrasas/:madrasaId` | None | 200 `{"madrasa":{...}}` |
| PATCH | `/:unitId/madrasas/:madrasaId` | `{"name":"Renamed Madrassa"}` | 200 `{"madrasa":{...}}` |
| DELETE | `/:unitId/madrasas/:madrasaId` | None | 204, empty body |

Example: `POST /api/admin/competitions/12/units` with
`{"name":"North Unit"}` returns:

```json
{
  "unit": {
    "id": "20",
    "competition_id": "12",
    "name": "North Unit",
    "created_at": "2026-10-24T09:00:00.000Z",
    "updated_at": "2026-10-24T09:00:00.000Z"
  }
}
```

Example: `POST /api/admin/competitions/12/units/20/madrasas` with
`{"name":"Central Madrassa"}` returns:

```json
{
  "madrasa": {
    "id": "30",
    "competition_id": "12",
    "unit_id": "20",
    "name": "Central Madrassa",
    "created_at": "2026-10-24T09:05:00.000Z",
    "updated_at": "2026-10-24T09:05:00.000Z"
  }
}
```

Lists return these same objects, ordered by descending ID. A valid empty
competition returns `{"units":[]}`; a valid unit without Madrassas returns
`{"madrasas":[]}`. Lists are currently unpaginated.

## Validation and relationships

- Every path ID is a canonical positive decimal bigint string, maximum
  `9223372036854775807`. Responses keep IDs as strings to preserve precision.
- POST/PATCH require exactly one field, `name`: a nonblank string without null
  characters. Empty bodies, arrays, null, numeric names and unknown fields return
  400. The app's existing 100 KB body limit applies.
- Names retain exact text, including case and surrounding spaces, following
  TKT-05A conventions. PostgreSQL enforces case-sensitive unit name uniqueness
  within each competition and Madrassa name uniqueness within each unit.
  Identical names in different valid parent scopes are allowed.
- The competition must exist. For every nested Madrassa operation, the unit must
  belong to that competition. Detail/update/delete queries include all path
  parents. Mismatched scopes return 404 and expose no out-of-scope record.
- Parents come exclusively from the path. `competition_id`, `unit_id`, `id`,
  timestamps and actor fields cannot be supplied in POST/PATCH. Ordinary updates
  cannot move units or Madrassas between parents.
- Units can have zero Madrassas; candidates without Madrassas remain supported by
  the unchanged schema. No new candidate, category, event or result operations
  are implemented here.
- Like existing competition information/settings edits, these operations are
  available for existing draft, active and archived competitions.

## Deletion and transactions

DELETE removes only the named unit or Madrassa. A unit with any Madrassas or
candidates returns 409. A Madrassa referenced by any candidate returns 409.
Existing `NO ACTION` foreign keys prevent deleting those dependencies, including
concurrent references. No child records, candidates or associated results are
cascaded, detached or reassigned by these APIs. A repeated DELETE after successful
removal returns 404. A unit becomes deletable after all dependencies have been
removed through appropriate authorized workflows; this ticket adds no candidate
removal or reset API.

All mutations run through the existing transaction utility and atomically append
an audit row using `request.auth.uid`. Audit actions are `unit_created`,
`unit_updated`, `unit_deleted`, `madrasa_created`, `madrasa_updated`, and
`madrasa_deleted`. Details retain entity IDs and before/after snapshots; deleted
entities use `after: null`. Audit rows remain competition-owned and survive unit
and Madrassa deletion. Clients cannot override audit actors or reasons.

Writes lock the competition first, then the parent unit for Madrassa operations,
then the target entity. This follows TKT-05A's competition-first lock order and
serializes writes per competition. Reads use transactions with key-share locks
on parents to prevent parent removal between validation and retrieval. Names
and all IDs are bound SQL parameters; only fixed internal table configurations
supply SQL identifiers. Any data or audit failure rolls back the complete write.

## Errors

All errors use `{"error":"message"}` and omit SQL, credentials and stack traces.

| Status | Examples / meaning |
| --- | --- |
| 400 | `{"error":"Only name is required and allowed"}`, invalid name or bigint ID |
| 401 | `{"error":"Authentication required"}` or `{"error":"Invalid or expired token"}` |
| 403 | `{"error":"Admin access required"}` |
| 404 | `{"error":"Competition not found"}`, `{"error":"Unit not found"}`, or `{"error":"Madrassa not found"}` |
| 409 | `{"error":"Unit name already exists in this parent"}` or corresponding Madrassa message |
| 409 | `{"error":"Unit is referenced by dependent records"}` or corresponding Madrassa message for blocked DELETE |
| 409 | `{"error":"Related records changed; retry with valid parent IDs"}` for other foreign-key conflicts |
| 413 | `{"error":"Request body too large"}` |
| 500 | `{"error":"Internal server error"}` for unexpected/database failures |
| 503 | `{"error":"Authentication unavailable"}` for authentication infrastructure failures |

Missing URL segments and unsupported routes return the existing 404
`{"error":"Not found"}`. Malformed JSON returns the existing 400
`{"error":"Invalid request body"}`. Failed mutations do not leave audit rows.

## Tests

`backend/test/participants.test.js` covers service input validation before database
work, authorization on all ten routes, actual production route mounting, safe
database/constraint errors and immutable parent fields.

`backend/test/participants.integration.test.js` tests CRUD through HTTP with real
PostgreSQL, optional Madrassas, exact text, scoped duplicates (including concurrent
inserts), cross-competition and wrong-unit paths, missing records, referenced
deletion with published result fixtures, verified audit attribution and rollback
of creates/updates/deletes after actual SQL errors. Candidate/result records are
SQL test fixtures only; no candidate/result API is introduced.

The new test helpers live in `backend/test-support`. PostgreSQL tests create and
drop only a random `tkt05b_<hex>` schema and explicitly set and check search path
on each checkout and before statements. Normal tables are untouched. Use a direct
or session-pinned connection with CREATE SCHEMA rights. `TEST_DATABASE_URL` can
select a dedicated test database; it makes connectivity failures fatal.
Alternatively set `TKT05B_REQUIRE_POSTGRES=1`. Without either setting, unavailable
PostgreSQL causes an explicit integration skip. Existing test suites retain their
own required-PostgreSQL flags.

Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` at the
repository root. See [TKT-05B report](TKT-05B-report.md) for verification results.
