# Category and event management APIs (TKT-05C)

All endpoints require a Firebase ID token in `Authorization: Bearer <ID_TOKEN>`
and the verified boolean custom claim `admin: true`. Existing revocation checks,
`Cache-Control: no-store`, security headers, request limits and safe error handling
apply. No public endpoints or frontend screens are added.

Before using these APIs, run `npm run db:migrate` explicitly. Migration
`0004_category_event_order.sql` adds `sort_order integer NOT NULL DEFAULT 0`
with a non-negative check to categories and events, plus scoped ordering indexes.
Existing records receive zero; names, IDs and relationships are preserved. Previous
migrations remain unchanged. The server never migrates the database on startup.

## Endpoints

Base path: `/api/admin/competitions/:competitionId/categories`.

| Method | Relative path | Request JSON | Success |
| --- | --- | --- | --- |
| POST | `/` | `{"name":"Open category","sort_order":10}` | 201 `{"category":{...}}` |
| GET | `/` | None | 200 `{"categories":[...]}` |
| GET | `/:categoryId` | None | 200 `{"category":{...}}` |
| PATCH | `/:categoryId` | `{"name":"Renamed category"}` and/or `sort_order` | 200 `{"category":{...}}` |
| DELETE | `/:categoryId` | None | 204, empty body |
| POST | `/:categoryId/events` | `{"name":"Recitation","sort_order":5}` | 201 `{"event":{...}}` |
| GET | `/:categoryId/events` | None | 200 `{"events":[...]}` |
| GET | `/:categoryId/events/:eventId` | None | 200 `{"event":{...}}` |
| PATCH | `/:categoryId/events/:eventId` | `{"sort_order":0}` and/or `name` | 200 `{"event":{...}}` |
| DELETE | `/:categoryId/events/:eventId` | None | 204, empty body |

Example category response for `POST /api/admin/competitions/12/categories`:

```json
{
  "category": {
    "id": "20",
    "competition_id": "12",
    "name": "Open category",
    "sort_order": 10,
    "created_at": "2026-10-24T10:00:00.000Z",
    "updated_at": "2026-10-24T10:00:00.000Z"
  }
}
```

Example event response for
`POST /api/admin/competitions/12/categories/20/events`:

```json
{
  "event": {
    "id": "30",
    "competition_id": "12",
    "category_id": "20",
    "name": "Recitation",
    "sort_order": 5,
    "created_at": "2026-10-24T10:05:00.000Z",
    "updated_at": "2026-10-24T10:05:00.000Z"
  }
}
```

Lists return these same objects in `sort_order ASC, id ASC` order. Equal order
values are allowed and are resolved by ascending ID. A valid empty parent returns
`{"categories":[]}` or `{"events":[]}`; missing parents return 404.

## Validation and relationships

POST requires `name`; `sort_order` is optional and defaults to zero. PATCH accepts
one or both fields and preserves omitted values. Empty updates and unsupported
fields are rejected. Names are configurable nonblank strings without null
characters; no predefined category/event names are embedded in business logic.
Exact case and whitespace are preserved, consistent with TKT-05A/B. The existing
100 KB request body limit applies.

`sort_order` must be a JSON number representing an integer in `0..2147483647`.
Negative/fractional values, strings, booleans and nulls return 400. Path IDs must
be canonical positive bigint strings, up to `9223372036854775807`; response IDs
remain strings to preserve precision.

PostgreSQL enforces case-sensitive category name uniqueness within a competition
and event name uniqueness within a category. Names may be reused in different
valid parent scopes. All detail and mutation queries include the complete path
scope. Mismatched competition/category IDs return 404 without exposing unrelated
records. The parent competition/category, IDs, timestamps and audit actors cannot
be supplied in the body or changed through ordinary updates. These operations
are available in all existing competition statuses, as with other configuration
management APIs.

## Deletion and audit safeguards

Unused categories/events can be deleted. Category deletion is blocked by existing
events or candidates through the existing `NO ACTION` foreign keys. Event deletion
is explicitly blocked by **any** `event_results` row, including empty draft,
reviewed and published result sets. This API guard is necessary because the
original event-to-result FK has `ON DELETE CASCADE`; that existing schema policy
is unchanged. An event `FOR UPDATE` lock is held before checking dependencies
and until commit, excluding concurrent FK references that could bypass the guard.
Existing event-specific audit references also block deletion through their FK.
No candidates, result sets, entries or audit evidence are detached or cascaded by
these APIs. Repeated DELETE after successful removal returns 404.

Every mutation and its audit row commit in one transaction. Writes lock competition
first, then category for nested operations, then the target record, following
existing service conventions. Reads retain parent key-share locks while validating
and fetching. Values are bound SQL parameters; SQL table identifiers come only
from fixed internal configurations.

Audit actors always come from `request.auth.uid`. Actions are `category_created`,
`category_updated`, `category_deleted`, `event_created`, `event_updated`, and
`event_deleted`. Details contain IDs and before/after snapshots, including order.
Management audit rows are competition-owned with entity IDs in JSON details, so
they remain after deletion and do not make every otherwise-unused event
undeletable. Historical audit records with an actual `event_id` FK still protect
that event. No mutation succeeds if its audit write fails.

## Error responses

Errors use `{"error":"message"}` without SQL, credentials or stack traces.

| Status | Examples / meaning |
| --- | --- |
| 400 | `{"error":"Invalid request fields"}`, invalid names/IDs, or `{"error":"sort_order must be an integer between 0 and 2147483647"}` |
| 401 | `{"error":"Authentication required"}` or `{"error":"Invalid or expired token"}` |
| 403 | `{"error":"Admin access required"}` |
| 404 | `{"error":"Competition not found"}`, `{"error":"Category not found"}`, or `{"error":"Event not found"}` |
| 409 | `{"error":"Category name already exists in this parent"}` or corresponding event message |
| 409 | `{"error":"Event is referenced by dependent records"}` or corresponding category message |
| 409 | `{"error":"Related records changed; retry with valid parent IDs"}` for other FK conflicts |
| 413 | `{"error":"Request body too large"}` |
| 500 | `{"error":"Internal server error"}` for unexpected/database failures |
| 503 | `{"error":"Authentication unavailable"}` |

Malformed JSON and missing URL segments use existing 400/404 API conventions.
Failed validation, duplicate conflicts, blocked deletion and database/audit
failures leave no partial mutation or successful-mutation audit record.

## Testing and limitations

HTTP/service tests cover all ten routes, Firebase admin authorization, unsupported
fields, immutable parents, IDs, names, sort-order validation and safe failures.
Real PostgreSQL tests cover incremental migration on existing records, CRUD,
partial edits, ordering ties, scoped duplicates and concurrent inserts, isolation,
missing records, candidate/result/audit deletion protection, trusted attribution,
SQL-failure rollback, and concurrent direct result creation versus event deletion.
Candidate/result rows are SQL test fixtures only; those APIs are not implemented.

The new integration harness uses a random `tkt05c_<hex>` schema, explicitly sets
and verifies search path and removes only that schema afterward. Use a direct or
session-pinned connection with CREATE SCHEMA permission. `TEST_DATABASE_URL`
overrides the configured database and requires connectivity; alternatively use
`TKT05C_REQUIRE_POSTGRES=1` to prohibit skips. Without either flag, unavailable
PostgreSQL produces an explicit skip. Existing suites keep their own flags.

Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` at the
repository root. Lists remain unpaginated, moves between parents are unsupported,
and sort order is edited per record without a bulk reorder endpoint. Trusted
direct SQL event deletion still follows the original cascade policy; use these
guarded APIs for ordinary management. See [verification report](TKT-05C-report.md).
