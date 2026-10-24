# Competition management API (TKT-05A)

All endpoints use `/api/admin/competitions` and require a Firebase ID token in
`Authorization: Bearer <ID_TOKEN>`, verified by the existing revocation-aware
middleware, with the boolean custom claim `admin: true`. Responses have
`Cache-Control: no-store`. There are no public competition/settings routes yet;
future public result viewing should expose only its required read projection.

## Endpoints

| Method | Path relative to base | Request JSON | Success |
| --- | --- | --- | --- |
| POST | `/` | `{"code":"2026","name":"Sargolsav 2026"}` | 201 `{"competition":{...}}` |
| GET | `/` | None | 200 `{"competitions":[...]}` ordered by descending ID |
| GET | `/:id` | None | 200 `{"competition":{...}}` |
| PATCH | `/:id` | `{"name":"Updated name"}` and/or `code` | 200 `{"competition":{...}}` |
| PATCH | `/:id/status` | `{"status":"active"}` | 200 `{"competition":{...}}` |
| GET | `/:id/settings` | None | 200 `{"settings":{...}}` |
| PUT | `/:id/settings` | `{"position_points":{"1":5,"2":3,"3":1}}` | 200 `{"settings":{...}}` |

An example competition response:

```json
{
  "competition": {
    "id": "12",
    "code": "2026",
    "name": "Sargolsav 2026",
    "status": "draft",
    "created_at": "2026-10-24T08:00:00.000Z",
    "updated_at": "2026-10-24T08:00:00.000Z"
  }
}
```

An example settings response:

```json
{
  "settings": {
    "competition_id": "12",
    "position_points": { "1": 5, "2": 3, "3": 1 },
    "created_at": "2026-10-24T08:00:00.000Z",
    "updated_at": "2026-10-24T08:10:00.000Z"
  }
}
```

IDs are decimal strings to preserve PostgreSQL bigint precision. Path IDs must
be canonical positive bigint values (maximum `9223372036854775807`). Names and
codes are nonblank strings without null characters. They retain exact text,
including leading zeros, case and surrounding spaces; code uniqueness follows
the existing case-sensitive PostgreSQL constraint. Unknown fields, missing
required fields and empty update bodies return 400. Creation accepts only code
and name; it always creates a draft with empty shared settings. Edit code/name
separately from lifecycle status. Timestamps and IDs cannot be supplied by clients.

## Lifecycle and transactions

| Current status | Allowed different status |
| --- | --- |
| draft | active, archived |
| active | archived |
| archived | active |

Same-status requests return the existing competition without changing timestamps
or adding audit rows. Returning to draft after activation/archiving returns 409.
Archiving is reversible and preserves data. Code/name and settings remain editable
in every status. Multiple active competitions are explicitly allowed by the
existing [schema requirements](schema.md#conventions-and-lifecycle); this ticket
preserves that exception to the single-active rule.

Creation atomically writes the competition, empty settings and audit record.
All subsequent writes lock the competition row first and commit the change and
audit record together. Concurrent partial edits cannot overwrite an unrelated
field read before locking. Settings use an upsert for legacy competitions without
a settings row. Audit actors always come from the verified Firebase UID; clients
cannot set actor fields. Audit actions are `competition_created`,
`competition_updated`, `competition_status_updated`, and
`competition_settings_updated`, with relevant before/after details.
Updates and reads use the explicit path competition ID, never an implicit active
competition. There is no deletion or reset API.

## Shared points contract

`position_points` is the single configuration shared by all events in a competition.
PUT replaces the entire object; omitted position keys are removed. `{}` explicitly
means unconfigured, with no default scoring values. GET on a legacy competition
without a settings row returns `{"settings":null}` without creating one. A missing
competition returns 404 for both settings operations.

Keys must be canonical positive integer strings in the PostgreSQL position range
`1..2147483647`; `0`, `01`, negative, fractional and oversized keys are invalid.
Values must be JSON numbers that are non-negative whole numbers in JavaScript's
safe integer range `0..9007199254740991`. Strings, nulls, booleans, negative and
fractional numbers are invalid. The HTTP body limit remains 100 KB.

TKT-05A settles the earlier open policy questions: points are non-negative whole
numbers, and edits to current shared settings must rescore published leaderboards.
There are no stored totals, frozen points snapshots or leaderboard calculations
in this ticket. Future scoring must read current `competition_settings` at query
time, include published entries only, and invalidate any caches when settings
change. Future publication/scoring must explicitly handle unconfigured positions;
this API permits incomplete maps and clearing configuration. No score calculation
should silently supply default points. Legacy settings can still contain values
accepted by the original broader database constraint; API updates must replace
them with a fully valid map. Direct SQL writers remain trusted backend operators.

## Error responses

Errors consistently return `{"error":"message"}` with no SQL, credentials or
stack traces. Examples:

| Status | Example response / meaning |
| --- | --- |
| 400 | `{"error":"Invalid request fields"}`; invalid IDs, text, status or points also return specific safe validation messages |
| 401 | `{"error":"Authentication required"}` or `{"error":"Invalid or expired token"}` |
| 403 | `{"error":"Admin access required"}` |
| 404 | `{"error":"Competition not found"}`; unsupported API routes return `{"error":"Not found"}` |
| 409 | `{"error":"Competition code already exists"}` or `{"error":"Invalid competition status transition"}` |
| 413 | `{"error":"Request body too large"}` |
| 500 | `{"error":"Internal server error"}` for database/unexpected failures; write transactions roll back |
| 503 | `{"error":"Authentication unavailable"}` for Firebase infrastructure failures |

Malformed JSON returns 400 `{"error":"Invalid request body"}`. Unexpected errors
are logged with a fixed message rather than driver details. Existing security
headers, CORS configuration and request size limits apply unchanged.

## Verification

`npm test` preserves the existing tests and adds HTTP authorization/validation/error
tests and real PostgreSQL API integration tests. Integration coverage includes
atomic creation, retrieval, duplicate handling, concurrent partial edits, settings
replacement, legacy missing settings, competition isolation, every lifecycle pair,
the existing multiple-active policy, missing records, trusted audit attribution,
and rollback after real SQL failures.

The integration harness creates a random `tkt05a_<hex>` schema, explicitly sets and
verifies search path on each connection, runs existing migrations there, and drops
only that schema afterward. The user needs CREATE SCHEMA permission and a direct
or session-pinned PostgreSQL connection. It never migrates the normal schema.
Set `TEST_DATABASE_URL` to a dedicated test database, or
`TKT05A_REQUIRE_POSTGRES=1` to make a connection failure fatal. Without those flags,
an unavailable database produces an explicit integration skip. The TKT-03 suite
has its own `TKT03_REQUIRE_POSTGRES=1` flag.

Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` from the
repository root. No environment variables, dependencies or migrations are added.
Frontend competition screens and TKT-05B/later services remain out of scope.
