# Exceptional shared positions (TKT-06D)

Shared positions are an explicit exception. The ordinary TKT-06B/C save endpoints
still reject duplicate positions and reject attempts to silently edit or clear an
existing override. There are only admin and public users: the same verified
Firebase `admin: true` authorization applies, with no additional role or claim.

## Explicit save endpoints

Both endpoints require a Firebase bearer token, return 200, and use
`Cache-Control: no-store`:

| PUT path | Response |
| --- | --- |
| `/api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result-draft/shared-positions` | `{ "draft": ... }` |
| `/api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result/corrections/:correctionId/shared-positions` | `{ "correction": ... }` |

Initialize the original draft or start a published-result correction using the
existing APIs first. Echo that resource's latest version. Both endpoints replace
the **complete desired entry set**, using this exact body shape:

```json
{
  "version":"123:20261024000000.000000",
  "shared_positions":true,
  "reason":"Judges confirmed equal marks on the signed result sheet",
  "entries":[
    {"candidate_code":"001","name":"Winner A","unit_id":"4","position":1},
    {"candidate_code":"002","name":"Winner B","unit_id":"4","madrasa_id":"5","position":1},
    {"candidate_code":"003","name":"Winner C","unit_id":"4","position":2}
  ]
}
```

The example is valid when positions 1 and 2 are configured. Codes remain exact
strings, preserving leading zeros. Names, positive bigint IDs, optional Madrassa,
competition/category isolation and candidate resolution retain TKT-06A/B rules.
The event path supplies competition/category; callers cannot supply candidate IDs,
audit IDs, actors, lifecycle fields or approval metadata.

`shared_positions` must be the JSON boolean `true` on every explicit save; strings,
false, numbers and omission are rejected. It is not a persistent switch. The
normal endpoints do not accept this flag/reason payload. Duplicate positions
never automatically enable an override.

An override reason must be NUL-free, contain at least two whitespace-separated
words containing letters/digits and at least ten Unicode letters/digits overall,
and be at most 1000 characters after trimming. It is stored trimmed. This ensures
a nontrivial explanatory entry; admins remain responsible for its accuracy.
Blank, punctuation-only, short, single-word and oversized reasons are rejected.
The correction-start reason remains distinct from this specific tie-approval
reason. A correction reason alone does not enable a new tie.

Each candidate code can appear only once, including across different positions.
Shared positions must be positive PostgreSQL integers present in the current
competition `position_points` map. Duplicate candidate protection and all scope
FKs remain active. No points are accepted in the payload.

## Editing, removing and inheriting ties

An explicit save issues fresh approval for the submitted tied groups and replaces
all entries in the same transaction. Every member of a tied position references
that approval; ordinary singleton positions have null `override_audit_id`.

Once entries contain an override, use the explicit endpoint for further saves,
including edits to other winners or removal of the tied winners. To remove all
ties, submit a unique-position set (or an incomplete/empty draft set) through the
explicit endpoint with a reason. The removal is audited with an empty new tied-
group set. Once all override references are cleared, ordinary saving works again
and continues rejecting duplicate positions. There is no sticky enabled state.
If neither the old nor new entry set contains an override/tie, use ordinary
editing; an unnecessary override request returns 400 and rolls back resolution.

A correction copies already-published entries and their audit provenance without
changing the live result. An unchanged published tie may retain its original
approval and be reviewed in the new workspace. No new tie is inferred or enabled.
The service verifies that inherited tied groups and audit IDs exactly match the
live published entries. This also supports approval originally issued by a
previous applied correction. Any explicit correction save issues fresh approval
scoped to that correction. Normal saving cannot replace or silently remove an
inherited override.

Legacy/operator-written tie rows with missing/mismatched approval details are not
newly authorized by their FK alone. Re-save through explicit editing with a valid
reason to establish current, scoped approval. Already-published snapshots remain
visible throughout correction preparation.

## Review, publication and concurrency

The TKT-06C lifecycle is unchanged: reviewed records cannot be edited. Return them
to draft first, which clears the old review. A shared-position save advances the
version; review again before publication. Stale edits/publishes return 409 without
candidate or approval side effects.

Review and publication require **every configured position** to have at least one
winner. A tie at position 1 does not replace the requirement for position 2.
Additional winners are accepted only with matching approval. Empty/incomplete
drafts remain editable but cannot pass review. Extra/unconfigured positions,
duplicate candidates, dangling singleton override references or unapproved ties
are rejected.

At both review and publication, the service verifies:

- The existing audit FK/action/event/competition scope.
- A meaningful reason, nonblank actor and matching live result/workspace scope.
- Exact tied positions and their complete candidate-ID membership, with all tied
  members referencing the same submitted-set approval.
- For inherited approval, exact agreement with current live published tied groups.

The review fingerprint includes private approval identity, reason, timestamp and
details, as well as winner metadata and settings. Changed membership, position,
approval metadata or settings cannot use an old review. Reusing a valid FK for a
different tied group fails validation.

Existing competition/category/event/result/workspace lock order and optimistic
versions are retained. Concurrent same-version saves/publications yield one
success and one 409. Sorted candidate resolution avoids reverse lock order across
events. Approval, candidate creation, replacement entries, header/version change
and normal mutation audits commit or roll back together. Correction publication
also atomically replaces live entries and appends the public snapshot. A failed
save/publication leaves prior draft/correction/public state intact.

## Audit behavior

Each explicit save inserts one existing `shared_position_override` audit row:

- `actor_ref`: verified `request.auth.uid`, never a request-body value.
- `reason`: the validated explanatory reason.
- `created_at`: database timestamp.
- `competition_id` and `event_id`: scoped affected event.
- `details`: live `event_result_id`, nullable `correction_id`, the submitted prior
  version, new tied `positions` with sorted `candidate_ids`, and `previous_positions`.

All tied entries reference the new audit ID. A removal still leaves an audit row
with `positions: []`. Standard `result_draft_updated`/`result_correction_updated`
audits retain full before/after winners and approval references. The prior version
links the explicit approval to that update. Review, publish and correction audits
remain attributed as in TKT-06C. Historical approvals are retained; referenced
ones cannot be deleted because of FKs. Clients cannot submit/reuse audit IDs.

## Public results and future scoring

Existing public endpoints return all published winners, including multiple rows
at the same position. New publications order winners by position, then candidate
code, then candidate ID, without changing their winning positions. Draft displays
use position and database C-collated code/ID ordering. Existing stored publication
snapshots retain their stable original order. Display ordering does not break a
tie or assign different points.

No unpublished reasons, approval IDs, actor UIDs, fingerprints, correction drafts
or audit details are added to public projections. Public reads continue seeing
the old snapshot until correction publication commits.

Each winner keeps a separate result entry with their actual configured position.
A future scorer must award the full shared configuration value to **each entry**:
with position 1 worth 5 and position 2 worth 3, winners at positions `1,1,2` receive
`5,5,3`. Do not divide points, deduplicate by position/unit, or shift the second
winner to another rank. This ticket adds no scoring function, leaderboard,
ranking API, polling or frontend screen.

## Migration, errors and verification

Apply `0008_correction_shared_positions.sql` using `npm run db:migrate` before
using these APIs. It adds the existing-style audit FK/generated action column to
`correction_entries` and replaces unconditional position uniqueness with the same
partial ordinary-position unique index used by live entries. Candidate uniqueness,
competition/category FKs, RLS/grants and existing deletion protections remain.
Existing correction rows receive null override IDs and stay ordinary. No new
tables, sequences, roles, global privileges or dependencies are introduced.
Old migrations are unchanged. Tests migrate only isolated schemas; normal
application migration/deployment is not performed by this ticket.

Malformed payloads/flag/reasons, duplicate candidates and unsupported positions
return 400. Missing scoped parents/results/corrections return 404. Stale versions,
non-draft states, normal editing of overrides, invalid approval/review, identity
and FK/concurrency conflicts return 409. Auth remains 401/403 or verification-
unavailable 503. Unexpected errors use sanitized 500 responses.

`npm test` includes HTTP and real PostgreSQL coverage for the explicit endpoints,
normal rejection, validation, authorization, duplicate candidates, scope, complete
review/publication, inherited/new correction approvals, review invalidation,
concurrency, SQL/audit rollback, removal, public ordering/privacy and FK protection.
The existing isolated-schema harness and `TKT05B_REQUIRE_POSTGRES=1` flag require
PostgreSQL execution; `TEST_DATABASE_URL` may override the configured connection.
