# Admin result entry and candidate selection (TKT-09E)

TKT-09F extends these components with [review, publication and private corrections](RESULT_LIFECYCLE.md).
The ordinary draft endpoint restrictions below remain in force.
TKT-09G adds [explicit shared-position editing and removal](SHARED_POSITIONS.md)
through separate audited endpoints; ordinary saves still reject duplicate positions.

## Screens and routes

`/admin/results` is a private, selected-competition results browser. It reads
categories in configured order and joins the authenticated competition result-status
list by category ID. Within each category it preserves the backend's event order.
Only `not_started` is labelled Awaiting; the other supported statuses are Draft,
Reviewed and Published. Missing/unknown status data is never fabricated as Awaiting.

| URL example | State |
| --- | --- |
| `/admin/results` | Competition selection required; no result requests |
| `/admin/results?competition=1` | All configured categories and their event statuses |
| `/admin/results?competition=1&category=11` | Events in one category |
| `/admin/results?competition=1&category=11&event=111` | Selected event's draft or protection panel |

IDs are illustrative. Category/event links, direct requests, reloads and browser
Back/Forward use the same URL context. Competition changes clear category/event
selection. Category changes clear event selection. Unknown or wrong-scope selections
show unavailable/error messages and do not expose unrelated drafts.

An event without a draft shows **Initialize draft**. Merely browsing does not
create records. The explicit POST initializes an empty draft or retrieves the
existing draft unchanged, including if another admin initialized it first. Reviewed
or published status rows now open the lifecycle workspace without calling ordinary draft endpoints.
A raced 409 from draft GET also locks entry. Drafts with override entries/shared
positions require explicit opt-in, a fresh reason and confirmation through the
shared-position endpoint for every edit or removal.

## Candidate lookup and winner entry

Each reusable winner row contains external candidate ID, name, unit, optional
Madrassa and configured position. External IDs are text and retain exact case,
spaces and leading zeros; `001` and `1` are distinct. Lookup encodes the exact code
in the existing `candidate_code` query parameter. Only the explicit candidate-not-
found 404 is treated as a new candidate; missing parents, malformed responses and
transport failures are errors, not permission to create an identity.

An existing same-category candidate populates name/unit/Madrassa and locks identity
and affiliations. Category context is displayed. Entered identity/affiliation
conflicts are shown without replacing inputs; **Use registered candidate** is an
explicit choice for the same category. A candidate in another category is blocked
and cannot be reassigned. Changing the external ID deliberately clears prior
identity/affiliations and requires a fresh lookup. Saved draft entries start as
existing candidates using the server snapshot, and can be rechecked by lookup.

New candidates collect name and a registered competition unit. Madrassas are loaded
only for that unit; none is permitted, and changing unit clears the old Madrassa.
Madrassa IDs are never generated. There is no separate candidate-registration page,
POST to the candidate creation endpoint, automatic Madrassa creation or transfer UI.
The backend resolver creates/reuses candidates transactionally only during draft PUT.
Concurrent identity conflicts remain backend-authoritative 409 errors.

Winning positions come from current shared settings, including configured positions
with zero points and nonconsecutive keys. No 1/2/3-only defaults exist. Added rows
must have complete required details and a resolved lookup. Duplicate exact candidate
codes and duplicate positions are rejected before transport. Incomplete drafts mean
some configured positions can be absent, not that a submitted row can omit required
identity fields. Empty drafts are supported even with no configured positions.

Rows can be added, removed or replaced. New rows focus the external ID; validation
focuses an alert summary. Lookup controllers are cancelled on code changes/removal.
Functional row patches preserve edits/positions in other rows when concurrent
lookups complete. Background auth checks and menu/status renders do not reset forms.

## Existing API integrations

All requests reuse the Firebase-authorized admin request utility and its no-store,
abort, 401-refresh-once and 403 behavior. No tokens are manually persisted/logged.

| Method / path | Use |
| --- | --- |
| `GET /api/admin/competitions` | Existing competition selection |
| `GET /api/admin/competitions/:competitionId/categories` | Configured category order and names |
| `GET /api/admin/competitions/:competitionId/result-statuses` | All event names/statuses, grouped in category order by the frontend |
| `GET /api/admin/competitions/:competitionId/settings` | Configured winning-position keys |
| `GET /api/admin/competitions/:competitionId/units` | Registered units |
| `GET /api/admin/competitions/:competitionId/units/:unitId/madrasas` | Registered optional Madrassas |
| `GET /api/admin/competitions/:competitionId/candidates/lookup?candidate_code=...` | Exact external candidate lookup |
| `GET .../categories/:categoryId/events/:eventId/result-draft` | Existing draft snapshot or explicit absent/protected state |
| `POST .../categories/:categoryId/events/:eventId/result-draft` | Explicit initialization with `{}` |
| `PUT .../categories/:categoryId/events/:eventId/result-draft` | Complete `{version, entries}` replacement |

The last three paths use base `/api/admin/competitions/:competitionId`. Status lists
return `{results:[...]}`, lookups `{candidate:...}`, and draft operations
`{draft:...}`. Runtime validation checks envelopes, identifiers, statuses, expected
competition/category/event, candidate code and nullable Madrassa/override references.
IDs remain bigint strings. A missing scoped parent does not become an empty draft.

## Versions, saving and protected states

Draft versions are opaque server-provided strings. The editor echoes the last
confirmed POST/GET/PUT token verbatim and never reconstructs it from timestamps.
PUT sends the complete desired entry list with only `candidate_code`, `name`,
`unit_id`, nullable `madrasa_id`, and integer `position`. Candidate/internal entry
IDs, category, points, lifecycle and override fields are not sent.

Save/Saving/Saved/error feedback is explicit. A synchronous mutation latch and
pending fieldset prevent duplicate writes. Saved is shown only after a validated
server response; then entries/version/baseline and the event status are updated
from that response. Empty and no-op saves legitimately advance the backend version.
No candidate registration calls or independent partial writes are performed.

Validation, identity conflicts and network failures preserve entries. A stale
version, non-draft or shared-position 409 prevents blind resubmission. **Reload
draft** deliberately fetches the latest snapshot/options and confirms before
throwing away dirty entries. There is no automatic fetch-new-version-and-overwrite,
force-save. Shared-position overrides now use the separate TKT-09G workflow.
Review, publication and correction
actions use the separate lifecycle APIs documented in the TKT-09F guide.
A concurrent lifecycle transition remains protected by the backend even if status
metadata was stale. Ambiguous network writes are not automatically repeated; reload
and reconcile deliberately before retrying if the server may have committed.

## Navigation protection

The production entry point now creates the existing React Router data router around
the unchanged JSX route tree. `AdminNavigationBlocker` uses `useBlocker` to guard
internal links, programmatic category/event/competition changes and SPA Back/Forward
while any registered admin form is dirty or a write is pending. Cancel resets the
blocker, retaining the URL and entries; approval proceeds once. Logout retains the
existing explicit check and page unload retains the native beforeunload warning.
Successful saves clear dirty registration before accepting confirmed changes.
Authorization failures still unmount protected content and are not held by a dirty
form. No raw popstate interception or new routing dependency is introduced.

This resolves the prior **production** Back/Forward gap for existing management
forms as well as winner entry. Isolated consumers mounting `AppRoutes` inside a
declarative MemoryRouter/BrowserRouter retain the prior link/unload fallback; they
need a data router to obtain Back/Forward blocking. New tests use RouterProvider
and createMemoryRouter to exercise the production guard semantics. Real browser
history/unload behavior still requires manual integration verification.

## Components and changed files

- `pages/admin/AdminResults.tsx`: selected competition and result workspace.
- `components/admin/results/ResultsWorkspace.tsx`: ordered category/status browser,
  URL selection and reviewed/published protection panels.
- `components/admin/results/DraftManager.tsx`: scoped draft/options reads,
  explicit initialization and shared-position/lifecycle guards.
- `components/admin/results/DraftEditor.tsx`: rows, validation, versioned saves,
  deliberate reload, feedback and sticky mobile Save actions.
- `components/admin/results/WinnerEntry.tsx`: reusable lookup/affiliation/position row.
- `api/resultsApi.ts`, `types/adminResults.ts`, `utils/winnerEntry.ts`: typed and
  runtime-checked API contracts and payload validation.
- `components/admin/AdminNavigationBlocker.tsx`, `main.tsx`, `App.tsx`,
  `layouts/AdminLayout.tsx`: data-router guard integration and results route.
- `hooks/useAdminMutation.ts`: exposes safe HTTP error status for conflict handling;
  existing form behavior is retained.
- `styles/global.css`: wrapping rows, labelled inputs/selects and sticky Save bar.
- `routes/ResultEntry.test.tsx`, `api/resultsApi.test.ts`, and existing dashboard
  navigation tests: feature and regression coverage.

Forms reuse existing tokens, resource/mutation hooks, panels and unsaved-change
registration. The Results route is lazy-loaded to keep the winner editor out of
the initial public bundle. Responsive layouts target 280px, 320px, 375px and 430px with no tables,
min-width constraints on controls, wrapping buttons and long-name handling. No new
animation/dependency/backend/scoring/migration/environment-file change is introduced.

## Manual verification

1. Start the configured app with `npm run dev`, sign in as an admin and visit
   `/admin/results`. Select a competition; check category/event order and all four
   status labels. Exercise empty categories/competitions and load errors/retry.
2. Open an event via a deep link. For Awaiting, initialize explicitly; verify no
   record was created just by browsing and repeated initialization does not reset it.
3. Look up an existing external ID with leading zeros. Check name, category, unit
   and optional Madrassa. Try conflicting entered identity/affiliation and a code
   in another category; confirm no silent reassignment is possible.
4. Enter a new code, name, unit and optional Madrassa. Change units and confirm the
   child selection clears. Save and verify candidate creation only through the
   transactional draft PUT. Check no standalone registration endpoint is called.
5. Configure nonconsecutive winning positions, including zero-point positions, in
   Settings. Confirm those exact positions are offered. Add/remove/replace winners;
   save a subset of positions and an empty draft. Reject duplicate codes/positions
   and partially filled rows without losing edits.
6. Load/save twice and verify exact opaque version round-trip. Edit the same draft
   in two sessions; confirm the stale save returns 409, preserves entries and cannot
   blindly overwrite. Cancel then confirm Reload draft and reconcile deliberately.
7. Verify reviewed/published events and pre-existing shared-position drafts cannot
   be edited. Simulate a lifecycle change between status read and save; check 409
   protection. Do not transition/publish/correct results as part of this ticket.
8. Delay lookup/save/status requests and change codes, rows or selection. Check old
   responses do not replace a new code, another row, event or competition. Focus the
   window and open the menu while editing; confirm entries remain.
9. With dirty entries, cancel internal links, competition/category/event switches,
   logout, Back, Forward and page unload. Confirm the URL/form survive. Approve and
   verify one navigation. Test browser buttons and history beyond app entries too.
10. Throttle saves and try repeated submits. Exercise validation/network failures,
    lookup-not-found versus missing-parent failures, and 401/403 expiry/revocation.
    Verify safe errors, no false Saved feedback and protected content removal.
11. At **280px, 320px, 375px and 430px**, inspect long names/IDs, native selectors,
    sticky Save controls, focus/labels/keyboard interaction and horizontal overflow.
    Recheck public and all prior admin screens through the production data router.

Live Firebase/PostgreSQL and real browser/mobile checks are not established by
mocked DOM tests and are reported separately from automated verification.

## Verification results (2026-10-25)

- `npm run lint`: **passed**.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**. The Results feature is a separate lazy chunk. Vite
  still reports a non-fatal initial-chunk warning at approximately 503 kB after
  the data-router integration; broader existing admin-route splitting is outside
  this ticket. The warning threshold was not raised or suppressed.
- `npm test --workspace frontend`: **238 passed** across 16 test files.
- Complete `npm test`, supported offline database mode: **82 backend passed,
  16 PostgreSQL integration tests explicitly skipped, 238 frontend passed,
  zero failures**. Skips are not counted as passes.
- The full run allowed loopback HTTP and used process-only `DATABASE_URL` pointing
  to unavailable `127.0.0.1:1` and `PGCONNECT_TIMEOUT_MS=1000`. No environment file
  changed. Frontend tests use mocked Firebase/HTTP; backend HTTP/unit tests do not
  establish live database behavior.
- Live PostgreSQL, live Firebase, real browser history/unload behavior and visual
  viewport checks at 280/320/375/430 px remain **unverified**.

New tests cover status/category/event navigation, candidate lookup/new resolution,
exact external IDs, conflicts, optional Madrassas, configured positions, winner
replacement/removal, empty/subset drafts, complete versioned saves, stale versions,
protected lifecycle/shared drafts, duplicate submits, identity/position duplicates,
Back and Forward cancellation, unload/logout/internal guards, focus, late async
results, background renders, API failures and authorization. Prior public/admin
suites remain included.
