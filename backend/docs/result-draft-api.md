# Event result draft APIs (TKT-06B)

All endpoints require a Firebase ID token whose verified custom claim is
`admin: true`. Send `Authorization: Bearer <token>`. All responses through these
routes use `Cache-Control: no-store`. No public result draft endpoint exists.

Base: `/api/admin/competitions/:competitionId`

| Method | Path relative to base | Behavior |
| --- | --- | --- |
| POST | `/categories/:categoryId/events/:eventId/result-draft` | Initialize an empty draft (201), or retrieve the existing draft unchanged (200) |
| GET | `/categories/:categoryId/events/:eventId/result-draft` | Retrieve existing draft and entries (200); absent draft returns 404 |
| PUT | `/categories/:categoryId/events/:eventId/result-draft` | Atomically replace the complete winner list using the current version (200) |
| GET | `/result-statuses` | List all events and result statuses in the competition |
| GET | `/categories/:categoryId/result-statuses` | List all events and statuses in this category |

The competition status list also supports optional `?category_id=...`. Do not
combine a category query filter with a category in the path. Unknown/repeated
query filters are rejected. Events without a result record are included with
`status: "not_started"`, null result ID and null result timestamp. Status listings
include identifiers, event name, status and timestamp, without winner details.
Empty categories/competitions return an empty `results` array. Lists are not
paginated. All parent IDs are scoped and validated, including category filters.

## Initialize and retrieve

Initialize with an absent body or `{}`. POST does not accept entries, lifecycle
fields, or actor identity. Repeated/concurrent initialization reuses the one
existing result row and does not reset entries, advance its version or emit a
second creation audit. Initialize before the first PUT.

```http
POST /api/admin/competitions/1/categories/2/events/3/result-draft
Authorization: Bearer <token>
Content-Type: application/json

{}
```

Example response (IDs, version and timestamps are illustrative):

```json
{
  "draft": {
    "id": "7",
    "competition_id": "1",
    "event_id": "3",
    "category_id": "2",
    "status": "draft",
    "created_at": "2026-10-24T00:00:00.000Z",
    "updated_at": "2026-10-24T00:00:00.000Z",
    "version": "123:20261024000000.000000",
    "entries": []
  }
}
```

GET and successful PUT return the same `draft` envelope. Each entry contains
`id` (result entry ID), `candidate_id`, `position`, `override_audit_id` (null for
ordinary entries), `candidate_code`, `name`, `unit_id` and nullable `madrasa_id`.
Entries are returned in ascending position order. All bigint identifiers are
strings. The external candidate code remains distinct from the internal ID.

## Save, replace and remove winners

PUT requires exactly `version` and `entries`. Echo the opaque `version` from the
latest GET/POST/PUT response verbatim; do not construct it from `updated_at`.
Supply the complete desired winner list each time. Omitting a previous winner
removes their result entry. Changing an entry's code replaces that winner through
candidate resolution. To move a winner, supply their same identity and a new
position. `entries: []` clears the draft. It does not delete candidate records.

```http
PUT /api/admin/competitions/1/categories/2/events/3/result-draft
Authorization: Bearer <token>
Content-Type: application/json

{
  "version": "123:20261024000000.000000",
  "entries": [
    {"candidate_code":"001","name":"Winner One","unit_id":"4","position":1},
    {"candidate_code":"002","name":"Winner Two","unit_id":"4","madrasa_id":"5","position":3}
  ]
}
```

This example is valid when positions 1 and 3 are configured in the competition's
`position_points` map. Missing positions are allowed; drafts need not be complete.
No points are calculated or stored by this API. A configured position with zero
points is still a supported position. Without configured positions only empty
drafts can be saved.

Entries accept exactly `candidate_code`, `name`, `unit_id`, `position` and optional
`madrasa_id`. Category and competition derive from the scoped event path. Do not
send candidate IDs, status, review/publish fields, points, override fields or
administrator identity.

Validation rules:

- IDs must be canonical positive PostgreSQL bigint strings, up to
  9223372036854775807.
- Name and candidate code must be nonblank strings without NUL. Text is preserved
  exactly, including case, spaces and leading zeros; numeric codes are rejected.
- Positions must be JSON integers from 1 to 2147483647 and keys in the current
  competition's scoring-position map. Gaps are allowed.
- Duplicate candidate codes and duplicate positions are rejected before database
  work. Shared positions cannot be requested through these endpoints.
- Units must belong to the competition; a Madrassa, when supplied, must belong to
  that unit and competition. Omitted/null Madrassa means no Madrassa.
- Existing codes are reused only when name, unit, category and nullable Madrassa
  match exactly. Identity/affiliation conflicts return 409, without reassignment.
  Use the existing candidate API for deliberate audited name corrections first.
- Candidate resolution uses TKT-06A `resolveCandidate` on the same transaction query
  as all result changes and audits. A failure rolls everything back, including
  candidates newly created earlier in that save. Existing candidates are retained
  when a winner is removed; reuse itself emits no candidate mutation audit.

## Lifecycle, authorization and errors

New records start in `draft`. Every save retains `draft`, null review/publish
fields, and no leaderboard contribution. POST, GET and PUT on an existing
`reviewed` or `published` result return 409. These endpoints never transition,
reset, publish or correct results. Ordinary saves also reject drafts containing
exceptional override entries. Use the explicit [shared-position API](shared-position-api.md)
to assign, change or remove ties with an audited reason.

Verified `request.auth.uid` supplies the audit actor. Creation writes
`result_draft_created`; each successful PUT writes `result_draft_updated` with
before/after header and entries. New candidates have their existing
`candidate_created` audit in the same transaction. Any audit failure rolls back
the complete mutation. Unknown request fields, including actor fields, return 400.

Malformed/invalid payloads and unsupported relationships/positions return 400;
missing scoped parents/drafts return 404; stale versions, identity conflicts,
non-draft states or database concurrency/reference conflicts return 409.
Authentication returns 401/403, or 503 if verification is unavailable. Unexpected
errors return sanitized 500 responses without SQL, stack or credential details.

## Concurrency

Saves lock parents in competition/category/event order and lock the result row.
After waiting for a competing editor, the save compares its version with the
locked current row. Only one of two saves with the same version succeeds. The
loser receives 409 before candidate resolution or entry deletion and must fetch
the latest draft and deliberately reconcile edits. Replaying a successful PUT
with its old version also returns 409. Even an empty/no-op PUT advances version
and creates an update audit.

The version combines PostgreSQL row `xmin` with the full microsecond UTC
`updated_at` value; clients must treat it as opaque. This reuses the existing
schema without losing timestamp precision to JavaScript Date conversion.
Future result writers must lock/update the same result row when editing entries
so they advance this version. Current direct SQL writers are trusted operators.

A parent competition share lock excludes existing administrative parent/settings
mutations during validation and save. Settings also receive a share lock. Candidate
resolution uses sorted candidate-code order to avoid inverse lock ordering across
events. Reads hold a shared result lock while loading header and entries so a
concurrent ordinary save cannot return a mixed header/entry set. The existing
unique event/result/candidate/ordinary-position constraints remain authoritative.
Initialization also locks the event, including when no result row exists yet.

## Tests and scope

Run `npm test` from the repository root. The new HTTP tests cover authorization,
validation, sanitization and production mounting. Real PostgreSQL tests exercise
initialization/reuse, replacement/removal, empty/incomplete drafts, candidate
resolution and conflicts, scope, concurrency, rollback, audit attribution and
non-draft protection using isolated migrated schemas.

The PostgreSQL suite reuses `withParticipantDatabase`; set
`TKT05B_REQUIRE_POSTGRES=1` to require execution rather than skip. Set
`TEST_DATABASE_URL` to use a dedicated configured database. The harness drops its
own random schema and never writes normal application tables.

No migration, dependency change, review/publish/correction workflow, scoring API,
shared-position override, leaderboard or frontend screen is included.
