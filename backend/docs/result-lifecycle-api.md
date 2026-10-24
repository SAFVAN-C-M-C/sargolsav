# Result review, publication and corrections (TKT-06C)

Apply migration `0007_result_publications_and_corrections.sql` with
`npm run db:migrate` before starting this backend version. No earlier migration
is changed. See the migration section below.

## Admin API

All paths below start at
`/api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result`.
Require `Authorization: Bearer <Firebase ID token>` with a verified boolean
`admin: true` claim. Responses are private with `Cache-Control: no-store`.

| Method | Suffix | Response |
| --- | --- | --- |
| GET | none | `{ "result": ... }` for any existing lifecycle state, including current entries and version |
| POST | `/review` | Review a complete draft; `{ "result": ... }` |
| POST | `/return-to-draft` | Clear an existing review; `{ "result": ... }` |
| POST | `/publish` | Publish a reviewed result; `{ "result": ... }` |
| POST | `/corrections` | Create a separate correction draft, 201 `{ "correction": ... }` |
| GET | `/corrections/:correctionId` | Read the scoped correction, including applied history |
| PUT | `/corrections/:correctionId` | Replace ordinary entries in a correction draft |
| PUT | `/corrections/:correctionId/shared-positions` | Explicit audited tie editing; see [TKT-06D](shared-position-api.md) |
| POST | `/corrections/:correctionId/review` | Review a complete correction draft |
| POST | `/corrections/:correctionId/return-to-draft` | Clear a correction review |
| POST | `/corrections/:correctionId/publish` | Apply the reviewed correction atomically |

Correction operations return `{ "correction": ... }`. Other than correction
creation (201), success returns 200. Admin GET of the main result includes
`active_correction_id` or null so a future interface can resume work. Lifecycle
responses include verified reviewer/publisher UIDs and timestamps. Correction
responses include base publication ID, reason, reviewer, application metadata,
entries and their own version. Stored review fingerprints are not returned.
Review and publication do not require different admins; both require admin access.

Use the existing [draft API](result-draft-api.md) to initialize/edit the original
draft. The new lifecycle operations accept exactly an echoed opaque version:

```http
POST /api/admin/competitions/1/categories/2/events/3/result/review
Authorization: Bearer <token>
Content-Type: application/json

{"version":"123:20261024000000.000000"}
```

Then send the **returned reviewed version** to `/publish`. All versions in
examples are illustrative. Obtain real versions from the corresponding resource;
never build them from its millisecond JSON timestamp. A publish response adds
`publication_id` and sets status `published`, `published_by`, and `published_at`.

## Lifecycle and review requirements

Original result transitions:

```text
draft -> reviewed -> published
           |
           +-> draft (clears reviewer, review timestamp and fingerprint)
```

Only drafts can be reviewed. Only reviewed results can be published or returned
to draft. Published originals cannot be returned to draft, re-reviewed, or
published again through ordinary endpoints. The existing draft endpoints continue
to reject reviewed and published results. Initialize/edit operations remain
incomplete-draft friendly; review and publication require completeness.

Completeness means at least one winner for **every key** in the competition's nonempty
`position_points` map. This avoids inventing a fixed top-three rule. Zero-point
positions are still configured positions and require winners. Empty/incomplete
results, extra/unconfigured positions, duplicate candidates and missing candidate
identity are rejected. Duplicate positions require explicit [TKT-06D approval](shared-position-api.md);
normal editing still rejects them. Ties never replace coverage of other positions.
Competition/category/unit/Madrassa relationships retain their composite FKs and
existing validation. No score calculation or leaderboard is implemented.

Review stores a fingerprint of the validated public winner metadata (including
unit/Madrassa names and event/category names) and the shared points configuration.
Publication validates completeness and relationships again and compares that
fingerprint with current data. A candidate/configuration/name change after review
blocks publication; return to draft and review again. Nothing silently refreshes
or reuses an outdated review. Review/publish transactions lock candidate rows and
configuration while validating. Ordinary draft/correction editing of reviewed
records is rejected until the explicit return-to-draft operation clears review.

## Correcting a published result

1. Read the published admin result and its version.
2. Start a correction, supplying exactly `version` and a nonblank `reason`:

```http
POST /api/admin/competitions/1/categories/2/events/3/result/corrections
Authorization: Bearer <token>
Content-Type: application/json

{"version":"125:20261024000100.000000","reason":"Replace the second winner after verifying the source sheet"}
```

3. Use the returned correction ID/version to GET or PUT its entries. PUT uses the
   same identity fields and complete-set editing semantics as TKT-06B:

```json
{
  "version":"126:20261024000200.000000",
  "entries":[
    {"candidate_code":"001","name":"Winner One","unit_id":"4","position":1},
    {"candidate_code":"003","name":"Corrected Winner","unit_id":"4","madrasa_id":"5","position":2}
  ]
}
```

4. POST `{ "version": "<latest correction version>" }` to the correction's
   `/review`, then POST the newly returned version to its `/publish`.
5. Correction status becomes `applied`. The original result remains `published`,
   gains the correction's review metadata and the new publishing UID/timestamp,
   and receives a new version. A new publication snapshot becomes visible.

Correction transitions are `draft -> reviewed -> applied`, with `reviewed -> draft`
allowed for further edits. Applied corrections cannot be edited or applied again.
Exactly one draft/reviewed correction per event result is allowed. Starting another
while one is active returns 409; retrieve the existing ID from the main admin
result. A new correction can be started after the previous one is applied.
There is no correction deletion/cancellation endpoint in this ticket.

Correction entries are in separate normalized tables with competition/category
FKs. Saving them calls TKT-06A candidate resolution in the same transaction;
external codes remain strings with leading zeros preserved, and identity or
unit/category/Madrassa conflicts are rejected. Omitted/null Madrassa means no
association. Empty/incomplete correction drafts are allowed, but cannot pass
review. Changes to existing candidate identity/affiliation are not guessed.
Use the candidate API for deliberate audited name corrections before re-review.

Until correction publication, the live `result_entries` and published header
remain untouched and public snapshots remain unchanged. Public snapshots also
freeze names/codes/unit/Madrassa display metadata: independent candidate-name
corrections do not silently alter an already published result. A correction must
be reviewed and published to update the public projection.

Applying a correction checks its base publication is still current, replaces live
entries, updates the published header, appends a publication snapshot, marks the
correction applied, and audits the change in **one transaction**. Any failure,
including an audit/SQL failure after replacement, rolls everything back. Earlier
publication snapshots and before/after audit records are retained.

## Public read-only API

No Firebase login is required. These routes do not examine Firebase credentials
and return `Cache-Control: no-store` so a correction is not served from an old cache.

Base: `/api/competitions/:competitionId`

| GET path | Response |
| --- | --- |
| `/results` | `{ "results": [...] }`, only current published snapshots |
| `/results?category_id=:categoryId` | Same, filtered to a validated category |
| `/categories/:categoryId/results` | Same category-scoped list |
| `/categories/:categoryId/events/:eventId/result` | `{ "result": ... }`, or 404 if unpublished |
| `/categories/:categoryId/events/:eventId/result/status` | `{ "availability": { "event_id":"3", "category_id":"2", "status":"published" } }` or status `unpublished` |

An event with no result, a draft, or a reviewed result has the same public
`unpublished` availability. Public responses never reveal private lifecycle states,
correction workspaces, reasons, actor UIDs, fingerprints, audit data or unpublished
winners. Empty published lists return `[]`; nonexistent scoped parents return 404.
Unknown/repeated filters and category filters combined with category paths return
400. There is no public mutation endpoint or polling mechanism.

Example public result:

```json
{
  "result": {
    "competition_id":"1","event_id":"3","category_id":"2",
    "event_name":"Recitation","category_name":"Junior",
    "winners":[
      {"candidate_code":"001","name":"Winner One","position":1,
       "unit":{"id":"4","name":"Unit One"},"madrasa":null},
      {"candidate_code":"003","name":"Corrected Winner","position":2,
       "unit":{"id":"4","name":"Unit One"},"madrasa":{"id":"5","name":"Madrassa One"}}
    ],
    "publication_id":"9","published_at":"2026-10-24T00:03:00.000Z"
  }
}
```

Lists order by category ID, event display order, then event ID. Winners order by
position, then candidate code/ID for new publications. Migrated legacy snapshots
retain their stable original order. Lists are unpaginated.
A public read selects the latest committed snapshot in one SQL statement, so
correction publication exposes the complete old or complete new projection.
The shared points configuration remains authoritative for future scoring; these
endpoints return no calculated points or rankings.

## Concurrency, audit and errors

Mutations use the existing transaction helper and competition/category/event/
result lock order. Correction operations lock the live result before their own
workspace. Versions retain the TKT-06B `xmin` and full UTC microsecond timestamp
format, independently for the live result and each correction. All transitions,
correction starts and saves require the corresponding current token. Concurrent
publishes or edits using one version yield one success and one 409; duplicate
publication creates no additional snapshot or audit. A losing edit resolves no
candidates. Retrieve and deliberately reconcile after a 409.

Every administrative mutation uses the verified `request.auth.uid`; actor/status/
review/publish fields from bodies are rejected. Audit actions are `result_reviewed`,
`result_returned_to_draft`, `result_published`, `result_correction_started`,
`result_correction_updated`, `result_correction_reviewed`,
`result_correction_returned_to_draft`, and `result_correction_published`. Correction
reasons are retained across these actions, and before/after snapshots include
winner metadata and publication/base identifiers. Candidate creation audits share
the save transaction. Failed mutations produce no partial audit or data records.

IDs are canonical positive bigint strings; codes/names are nonblank NUL-free
strings, using existing exact-text rules. Positions are positive JSON integers
supported by current settings. Invalid input/incomplete results return 400; missing
parents/results/corrections return 404; stale versions, wrong lifecycle states,
identity conflicts, outdated reviews/bases and database reference/concurrency
conflicts return 409. Auth returns 401/403 or verification-unavailable 503.
Unexpected failures return sanitized 500 responses without SQL/credential details.

## Migration and operation

Migration 0007 adds:

- Nullable `event_results.review_snapshot` to support validation against review.
- `result_publications`: append-only through the API, versioned public projections
  plus private reviewer/publisher metadata. Existing published results are
  backfilled at migration time without retroactively changing their winners.
- `result_corrections`: one active workspace per result, base publication FK,
  reason, review/application state and metadata, review fingerprint and timestamp
  trigger. Applied workspaces retain their history.
- `correction_entries`: normalized candidate/position rows with composite scope
  FKs and uniqueness of candidate and position per correction.

New tables/sequences revoke PUBLIC/anon/authenticated access and enable RLS,
matching 0006. Public viewing uses the trusted backend's explicit projection,
not database client grants. Existing result/event deletion protections remain;
whole-competition cleanup still cascades intentionally. A trusted owner/BYPASSRLS
backend connection is required as before. No global roles/default privileges are
changed.

Run the normal versioned migration command explicitly against the intended
application environment before using these APIs. Tests apply 0007 only inside
isolated schemas; this ticket does not migrate or deploy normal application data.
Previously reviewed rows have no fingerprint and must return to draft and be
reviewed again before publication. Existing published snapshots are preserved even
if legacy data would not satisfy new review completeness requirements. Published
rows inserted manually after migration have no public snapshot until the controlled
workflow creates one; trusted SQL is not an alternative publication API.

Future writers must lock/update the result/workspace header when editing entries
and must not update/delete publication history. [TKT-06D](shared-position-api.md)
adds explicit shared-position approval and its review/publication validation.
No leaderboard, scoring API, frontend page, or configurable ranking algorithm is implemented.
