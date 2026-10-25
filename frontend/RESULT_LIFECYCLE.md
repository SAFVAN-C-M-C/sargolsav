# Admin result review, publication and corrections (TKT-09F)

TKT-09G adds [shared-position editing and removal](SHARED_POSITIONS.md) to these
workspaces. The TKT-09F verification results below describe its original delivery.

## Screens and routes

All screens remain under the Firebase-admin-protected `/admin/results` route.
The existing competition/category/event query parameters retain their meaning.

| Query parameters (after `/admin/results?`) | Screen |
| --- | --- |
| `competition=1&category=11&event=111` | Ordinary draft entry, or reviewed/published lifecycle workspace according to server status |
| `competition=1&category=11&event=111&resultView=review` | Saved draft verification and review |
| `competition=1&category=11&event=111&correction=7&resultView=correction` | Private correction editor; reviewed/applied corrections become read-only |
| `competition=1&category=11&event=111&correction=7&resultView=correction-review` | Saved correction verification, review, return-to-draft and confirmed publication |

IDs are illustrative. Direct links, refresh and browser history use the same state.
Competition/category/event changes clear correction and lifecycle view selection.
Wrong-scope or missing records show errors rather than editable defaults. Reads
are aborted/ignored on scope changes and mutation completions cannot update a new
competition's view. Awaiting Result, Draft, Reviewed and Published come from the
existing status API. The selected published result's detail GET discovers its
active correction and labels it **Correction in Progress**, with a Resume link;
the aggregate status endpoint does not provide every event's correction ID.

## Review and publication

Save ordinary draft changes, then choose **Review saved result**. Verification
shows the full saved winner list, event/category, exact external candidate code,
name, unit, optional Madrassa and configured position. All configured positions
are required, including nonconsecutive keys and keys worth zero points. Missing
positions and invalid entries disable review/publication; incomplete drafts remain
editable. No settings defaults or scoring calculations are introduced.

Review uses the current server version and exposes reviewer UID/time when supplied.
Reviewed results cannot use ordinary draft writes. **Return to draft** explicitly
unlocks editing. Only reviewed records expose publication. The confirmation dialog
repeats the exact saved winners and explains public visibility and leaderboard
impact. Cancel is initially focused, keyboard focus remains in the dialog, Escape
cancels when idle, and focus returns to the triggering control or a reload control.
Confirmation and pending writes are covered by the existing navigation guard.
Success is shown only after a validated backend response; relevant result data and
the frozen public projection are then reloaded.

## Corrections and public visibility

Published screens show winners from the existing **public frozen publication**
endpoint, not current candidate-registry names from the admin GET. A required
reason starts a separate private correction using the main result version. An
existing workspace is resumed rather than duplicated. A concurrent creation 409
retains the reason and requires an explicit reload to discover the workspace.

The editor reuses candidate lookup and winner rows from TKT-09E. Save sends the
complete correction entries with the correction's independent version. **Review
saved correction** rereads the server snapshot before verification. Corrections
can be reviewed, returned to draft, and published through their own endpoints.
The original public winners stay visible throughout private edits and review.
Only successful correction publication atomically replaces the public snapshot;
previous publication/audit history is preserved by the existing backend. Applied
workspaces are read-only. Leaving a correction does not cancel it: no cancellation
endpoint exists. No direct published-entry writes exist. Overrides use the explicit
TKT-09G editor workflow, never an ordinary save of approved entries.

## API dependencies

Let `R` be `/api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result`.
See the backend [lifecycle contract](../backend/docs/result-lifecycle-api.md).

| Method / path | Payload / purpose |
| --- | --- |
| `GET R` | Main result, complete verification entries, metadata, version and active correction ID |
| `POST R/review` | `{version}`; draft to reviewed |
| `POST R/return-to-draft` | `{version}`; reviewed to draft |
| `POST R/publish` | `{version}`; reviewed to published |
| `POST R/corrections` | `{version, reason}`; private correction creation |
| `GET R/corrections/:correctionId` | Separate scoped correction snapshot |
| `PUT R/corrections/:correctionId` | `{version, entries}`; complete private correction save |
| `POST R/corrections/:correctionId/review` | `{version}` |
| `POST R/corrections/:correctionId/return-to-draft` | `{version}` |
| `POST R/corrections/:correctionId/publish` | `{version}`; apply correction |
| `GET /api/competitions/:competitionId/categories/:categoryId/events/:eventId/result` | Frozen public winners/publication ID/time |

The workspace also reuses authenticated competition settings, category and event
detail, units, nested Madrassas, exact candidate lookup and result-status APIs.
Every admin request uses the existing Firebase token/refresh/access-denied utility.
The public projection uses a restricted public-result-only reader with no bearer
token. No token persistence or logging was added. Runtime validation checks scoped
IDs, envelopes, lifecycle status, versions and winner metadata before accepting data.

## Validation, concurrency and error handling

External candidate codes stay strings, retaining leading zeros, case and spaces.
The reused editor checks required identity/affiliation fields, registered candidates,
duplicate exact codes and ordinary duplicate positions. Review requires every
configured position. Existing audited shared entries can be verified by the backend,
but ordinary saving is blocked; TKT-09G adds fresh explicit approval for edits/removal.

Opaque version tokens are echoed verbatim, never derived from dates. Main-result
and correction versions remain separate. Mutation latches and disabled controls
prevent duplicate submissions. Any lifecycle 409 blocks blind resubmission until
reload, including stale versions, invalid transitions and changed review fingerprints.
Dirty correction reloads explicitly confirm discarding edits. Server validation,
affiliation conflicts and transport errors retain entered data. Ambiguous network
writes should be reconciled by reload before retrying; the UI does not automatically
repeat writes. The backend remains authoritative for readiness, authorization,
review fingerprints and atomic publication.

Missing/scoped 404s and failed reads show retry states. Expired sessions refresh once;
unresolved 401/403 remove protected content through existing authentication handling.
Unsaved reasons/correction entries, confirmations and pending writes reuse internal
navigation, Back/Forward, logout and native unload safeguards. No routing refactor
or new dependency was needed for this ticket.

## Components and files

- `api/resultLifecycleApi.ts`, `types/resultLifecycle.ts`, `utils/resultReview.ts`:
  validated contracts, scoped requests and review readiness.
- `ResultLifecycleWorkspace`, `CorrectionWorkspace`: scoped resource loading,
  frozen public display, lifecycle routing and independent correction state.
- `LifecycleActions`, `PublishConfirmation`, `WinnerSummary`, `StartCorrectionForm`:
  read-only verification, metadata, status actions, accessible confirmation and reason.
- `DraftEditor`, `ResultsWorkspace`: correction reuse and selected-event status/navigation.
- `AuthProvider`, `types/auth.ts`: restricted public snapshot read using the injected fetcher.
- `AdminLayout`, `types/adminResults.ts`, `styles/global.css`: context reset, optional
  correction metadata, wrapping verification cards and scrollable mobile dialog.
- `routes/ResultLifecycle.test.tsx`, `api/resultLifecycleApi.test.ts`:
  workflow/concurrency/security and contract tests; `ResultEntry.test.tsx` retains
  ordinary-draft protections while checking the new lifecycle screens.

## Automated verification

Verified on 2026-10-25 from the repository root:

- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed. Existing main bundle warning remains (503.04 kB;
  lifecycle/results code is a separate lazy chunk).
- `npm test`: frontend **271 passed in 18 files**; backend **82 passed, 16 skipped,
  zero failed**. PostgreSQL was intentionally unavailable for this offline run
  (`DATABASE_URL` loopback port 1, `PGCONNECT_TIMEOUT_MS=1000`, process-only overrides).

Frontend tests use injected mocked HTTP responses and jsdom, including complete and
incomplete review, return-to-draft, confirmation/cancellation/focus, duplicate writes,
version reuse, creation/resume, correction save/review/apply, frozen public isolation,
stale versions/fingerprints, invalid transitions, retry, reason/entry retention,
scope isolation, unsaved navigation, unauthorized responses and route regressions.
These are not live Firebase/PostgreSQL or browser-layout integration tests. The 16
database tests were skipped, not passed. Live Firebase, PostgreSQL transaction behavior,
real browser history/unload and device layout remain unverified in this environment.

## Manual verification

Use a development Firebase admin and a disposable PostgreSQL competition with the
existing lifecycle migration 0007 already applied. No migration, environment file,
backend API or dependency was added/changed by TKT-09F.

1. Open a direct selected event URL and use category/event/competition links,
   refresh and Back/Forward. Check scopes, long names, unknown IDs and retry states.
2. Save an incomplete draft. Verify missing configured positions prevent review;
   complete it using exact candidate codes including leading zeros and optional
   Madrassas. Review, check metadata, return to draft and review again.
3. Open publication confirmation with keyboard only; inspect exact winners,
   Tab/Shift+Tab/Escape/Cancel and restored focus. Confirm once on a slow connection;
   verify duplicate writes are prevented and public winners appear only on success.
4. Start a correction with a reason, resume it after refresh, edit/save/review it,
   and inspect the public result in another session throughout. It must remain
   unchanged until confirmed correction publication. Verify replacement winners
   and retained backend publication/audit history afterwards.
5. Use two admin sessions for stale saves, reviews, publication and competing
   correction creation. Verify 409 blocks retries, dirty reload asks before discard,
   and changed settings/candidate metadata require return-to-draft and fresh review.
6. Exercise 400/401/403/404/network failures, lost responses, unsaved navigation,
   logout/unload, pending actions and a competition switch while a response is delayed.
7. At 280, 320, 375, 768 and desktop widths, verify long names wrap, no horizontal
   overflow, touch targets, visible focus, dialog scrolling and keyboard access.
   Check existing public results/leaderboards and all other admin routes.

TKT-09F introduced no scoring/leaderboard changes, reset/export, correction
cancellation or unrelated management features. Shared-position UI was added subsequently in TKT-09G.
