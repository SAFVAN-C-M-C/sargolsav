# Category and event management UI (TKT-09D)

## Screens and URL state

`/admin/categories` manages categories and events in the competition selected in the
existing dashboard. No competition or predefined category name is assumed.

| Example | State |
| --- | --- |
| `/admin/categories?competition=1` | Ordered category list |
| `/admin/categories?competition=1&category=11` | Category details and ordered events |
| `/admin/categories?competition=1&category=11&event=111` | Selected event details |
| `/admin/categories?competition=1&catalogForm=new-category` | Create category |
| `/admin/categories?competition=1&category=11&catalogForm=category` | Edit category |
| `/admin/categories?competition=1&category=11&catalogForm=new-event` | Create event |
| `/admin/categories?competition=1&category=11&event=111&catalogForm=event` | Edit event |

IDs above are examples, not fixture assumptions. Direct links, reloads and browser
Back/Forward use the same query state. Navigation preserves the competition and
unrelated query parameters. Selecting a category clears the previous event/form;
changing competition clears `category`, `event` and `catalogForm` along with the
existing unit/Madrassa selections. There are no transfers between categories.

The screen offers creation in an empty competition and empty category. Missing
competition selection exposes no catalog form or catalog request. Unknown or
wrong-parent record IDs show a retryable error without exposing another scope.
Event counts appear for the selected category after its event list loads; no
per-category count fan-out or fabricated zero counts are used.

Public routes, admin login, dashboard, competitions/settings and units/Madrassas
remain intact. Results remain an explicit future-feature placeholder.

## Existing API dependencies

All requests reuse `AuthProvider.request`, with Firebase ID tokens obtained from
the SDK, no-store caching, abort signals and existing 401/403 handling. Tokens are
not manually stored or logged. Base path:
`/api/admin/competitions/:competitionId/categories`.

| Method | Relative path | Purpose |
| --- | --- | --- |
| GET | `/` | List categories |
| POST | `/` | Create category with name and display order |
| GET | `/:categoryId` | Read category details |
| PATCH | `/:categoryId` | Edit changed name and/or sort_order |
| DELETE | `/:categoryId` | Confirmed category deletion, 204 response |
| GET | `/:categoryId/events` | List events and obtain selected category event count |
| POST | `/:categoryId/events` | Create event with name and display order |
| GET | `/:categoryId/events/:eventId` | Read event details |
| PATCH | `/:categoryId/events/:eventId` | Edit changed name and/or sort_order |
| DELETE | `/:categoryId/events/:eventId` | Confirmed event deletion, 204 response |

The backend's `sort_order ASC, id ASC` list order is preserved. Lists and details
show the configured order. Lower orders appear first; equal orders are allowed,
with IDs compared by the backend as PostgreSQL bigint values. IDs remain strings
in the frontend and paths. No name-based or hardcoded-category ordering is added.
After a successful mutation, the affected list is fetched again, so order edits
reflect the server's current order. Edits also reread details. Creation selects the
returned ID; deletion clears only the deleted selection and retains its parent.

No backend changes or new migrations are introduced. Existing category/event APIs
require the already-established schema migrations, including 0004 for sort order
and 0005 for event/result deletion protection. This ticket does not run migrations
or alter deployment/environment configuration.

## Forms and validation

Both forms edit only `name` and `sort_order`. Names must be nonblank and contain no
null characters. Exact name text, case and surrounding spaces are preserved; no
category labels are hardcoded. Duplicate-name errors come from the authoritative
backend and leave form fields unchanged.

Display order uses a numeric-keyboard text field accepting whole decimal digits
in `0..2147483647`. Creation starts at zero, matching the API's default. Zero and
the upper bound are valid; blank, negative, fractional and oversized orders are
rejected. The request serializes display order as a JSON number. Leading zeros
are permitted for this numeric field and normalized on save. A formatting-only
edit never sends an empty PATCH. Edits send only changed fields, preserving other
fields during concurrent partial edits supported by the backend.

Validation messages are associated with labels/inputs and use alert feedback;
fields indicate invalid and required state. Server errors preserve name and order
edits. Safe API 400/404/409/413 messages are rendered as text; transport and other
server failures use the existing generic error behavior.

## Deletion and unsaved-change safeguards

Deletes require confirmation naming the record and parent, describing permanence
and explaining that related records are never cascaded or detached. Categories
with events or candidate references cannot be deleted. Events with **any** result
set, including an empty draft, reviewed or published set, or dependent audit
references cannot be deleted. Backend 409 responses show a friendly explanation
and retain the record. There is no dependency-bypass, cascade, transfer, candidate,
result-entry, review, publication, correction or shared-position override UI.

Deletion actions are available in read-only detail mode. Parent category deletion
is hidden while a child event form is open. Pending writes disable form fieldsets
or delete buttons, and the existing mutation latch rejects repeated submit events.
The existing request utility consumes successful 204 deletion responses without
trying to parse JSON. Failed deletes retain the record and provide retryable actions.

Dirty/pending forms reuse the established warnings for in-app links, selection,
Cancel, logout and native beforeunload behavior for refresh/tab close. **SPA browser
Back/Forward and external programmatic navigation remain unblocked** under the
existing BrowserRouter; unsaved edits may be lost on those paths. This ticket does
not restructure routing or add browser-history interception.

Competition/category/event components are keyed by their scoped selections.
Returned list/detail/mutation records are checked for expected competition, parent
category and detail ID, as well as valid display-order and bigint-ID fields. Nested
requests begin only after the parent category loads within the selected competition.
Abort-aware resource/mutation hooks ignore late responses even if a transport
ignores cancellation, preventing old reads/writes from overwriting new selections.
Cancellation does not undo a write already accepted by the server.

The existing APIs have no optimistic version token. Concurrent edits to the same
field follow backend last-writer behavior. Ambiguous network writes are not
repeated automatically; inspect current server data before retrying a creation.

## Components and files

- `pages/admin/AdminCategories.tsx`: competition context, dashboard navigation and
  deletion rules.
- `components/admin/catalog/CompetitionCategories.tsx`: category list, create mode,
  selection and mutation-triggered list refresh.
- `components/admin/catalog/CategoryDetails.tsx`: scoped category details/edit and
  nested events workspace.
- `components/admin/catalog/EventWorkspace.tsx`: event list/count and event
  details/create/edit/delete.
- `components/admin/catalog/CatalogForm.tsx`: shared name/order form, validation,
  pending locking and unsaved-change registration.
- `components/admin/catalog/CatalogActions.tsx`: confirmed deletion and edit links.
- `api/catalogApi.ts`: authenticated typed operations, scope/shape validation and
  dependency conflict feedback.
- `types/adminCatalog.ts`: category/event projections and partial change contract.
- `App.tsx`, `AdminLayout.tsx`, `styles/global.css`: route registration, child-state
  cleanup and wrapping order badges using existing admin design tokens.
- `routes/CategoryManagement.test.tsx`, `api/catalogApi.test.ts` and existing
  dashboard route tests: feature and regression coverage.
- `vitest.config.ts`: caps concurrent jsdom workers at four after a timing failure
  in the growing integration suite; no assertions or timeouts are relaxed.

Existing authenticated requests, loading/error panels, resource/mutation hooks,
unsaved-form hooks, query utility and participant list/action styles are reused.
There are no new dependencies, animations or unrelated architectural refactors.

## Manual verification

1. Start the configured application with `npm run dev`, sign in as an admin and
   open `/admin/categories` without a competition. Confirm selection is required.
2. Select a competition without categories. Create any custom-named category and
   verify name, order zero, selection URL, details and zero-event state after reload.
3. Create several categories/events with different orders and equal orders. Check
   ascending order and ascending ID ties. Edit only name, only order, then both;
   verify list reordering and persistence without touching the other field.
4. Try blank names, duplicate names, blank/negative/fractional/oversized orders,
   order zero and 2147483647. Confirm errors preserve all values and rejected input
   makes no request. Throttle requests and try repeated saves/deletes.
5. Cancel both deletion confirmations and verify no DELETE request. Confirm deletion
   of unused records; verify refreshed lists/counts and empty 204 handling.
6. Try deleting a category with events/candidates and an event with an empty draft,
   reviewed/published result or audit dependency. Confirm backend 409 protection and
   no related data removal. Do not alter dependencies to bypass restrictions.
7. Open category/event detail and edit URLs directly, refresh, then use Back/Forward.
   Switch categories and competitions, including during delayed reads/writes; verify
   selections clear appropriately and old data never replaces the new scope.
8. Exercise list/detail loading, empty, API/network errors and retry. Try a child ID
   belonging to another category and verify it is not exposed in the current scope.
9. Edit without saving, then cancel link, Cancel, selection, logout and unload
   warnings. Check the documented SPA Back/Forward limitation.
10. Check signed-out, non-admin and expired/revoked sessions. Verify protected forms
    disappear; inspect status codes without copying bearer tokens to logs.
11. At 320px and desktop widths, inspect long names/order badges, stacked forms,
    focus, labels, keyboard use and touch targets without horizontal overflow.
    Recheck public screens and all existing admin navigation.

Live Firebase/PostgreSQL and visual mobile/desktop checks are separate manual work;
automated DOM tests do not establish live-service or visual-layout behavior.

## Automated verification (2026-10-25)

Run from the repository root:

```sh
npm run lint
npm run typecheck
npm run build
npm test
```

The frontend tests use mocked Firebase and HTTP. The complete suite is also run in
the supported no-PostgreSQL mode with loopback HTTP access, process-only
`DATABASE_URL` pointing to unavailable `127.0.0.1:1` and
`PGCONNECT_TIMEOUT_MS=1000`. No environment files are changed. PostgreSQL integration
skips are reported separately and are not counted as passed. Live PostgreSQL and
Firebase behavior is not claimed by these runs.

Verified results for TKT-09D:

- Lint, typecheck and production build: **passed**.
- Frontend: **196 passed** across 14 test files, including all existing public,
  authentication, competition/settings and unit/Madrassa tests.
- Complete offline-mode suite: **82 backend passed, 16 PostgreSQL integration tests
  explicitly skipped, 196 frontend passed, zero failures**.
- Live PostgreSQL, live Firebase and visual desktop/mobile checks: **unverified**.

New coverage includes category/event CRUD and partial edits, configured ordering
and bigint ties, numeric limits, duplicates, protected deletion including empty
drafts, 204 handling, submit locks, URL/history context, unsaved warnings, all
list/detail loading/retry paths, wrong-parent payloads and links, stale reads and
writes, and read/write authorization failures. The test worker limit is four to
bound jsdom resource use without changing assertions or timeouts.
