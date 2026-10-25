# Admin dashboard foundation (TKT-09A)

TKT-09B now implements competition management and shared points settings. See
[Competition management and settings](COMPETITION_MANAGEMENT.md) for mutations,
validation, unsaved-change behavior and current verification. This guide documents
the original dashboard foundation and its read-only overview dependencies.
TKT-09C implements [unit and Madrassa management](UNIT_MADRASSA_MANAGEMENT.md).
TKT-09D implements [category and event management](CATEGORY_EVENT_MANAGEMENT.md).

## Routes and selection

- `/admin`: read-only dashboard and competition overview.
- `/admin/competitions`, `/admin/settings`: competition management and shared points
  configuration, implemented in TKT-09B.
- `/admin/units`: unit and optional Madrassa management, implemented in TKT-09C.
- `/admin/categories`: category/event management and ordering, implemented in TKT-09D.
- `/admin/results`: future-feature placeholder.
  Unknown admin paths show an admin page-not-found placeholder.
- `/admin/login`: existing Firebase sign-in flow.
- All workspace routes accept `?competition=<decimal-string-id>`. Selection is
  explicit, preserved by navigation, browser history, deep links and reloads.
  Other query parameters are retained. No active competition is assumed; every
  returned draft, active or archived competition can be selected independently.
- An unknown/deleted ID shows an unavailable-selection message and a picker;
  an empty list shows a dedicated empty state and makes no overview requests.
- Existing public routes and the public Firebase-independent shell are preserved.

## Components and request flow

`App.tsx` keeps `AuthProvider` scoped to admin routes. `RequireAdmin` protects the
entire `AdminLayout`, including its list request. `AdminLayout` owns the sidebar,
mobile menu, authenticated identity, logout, competition picker and nested outlet.
Navigation definitions live in `constants/adminNavigation.ts`.

`AdminDashboard` composes `CompetitionOverview`; `AdminPlaceholder` supplies future
screens with selected competition context via the layout outlet. `DashboardStates`
contains reusable loading/retry panels. Styles use existing brand tokens in
`styles/global.css`, with a distinct dark sidebar and responsive overview cards.

`useAdminResource` binds results to the loader and retry attempt. Cleanup aborts
requests; aborted results are ignored even when a transport ignores cancellation.
Changing selection hides previous overview data immediately. Competition selection
comes only from the URL, never from an asynchronous response.

`AuthProvider.request` obtains current ID tokens from Firebase for protected reads,
uses no-store caching and an abort signal, retries a 401 once with forced token
refresh, then removes access on persistent 401 or 403. Token retrieval failures for
invalid sessions also return to login. Requests are checked against the current
authentication sequence and user before sending and before handling a response.
Tokens are never stored by dashboard code or included in logs/error messages.
Logout invalidates pending work and relies on the existing provider's fail-closed
unavailable/retry state if sign-out fails.

## Existing API dependencies

All data requests are authenticated GETs, relative to the same origin:

| Endpoint | Use |
| --- | --- |
| `/api/admin/me` | Existing server-verified Firebase admin identity |
| `/api/admin/competitions` | Available competitions; selected name, code and status |
| `/api/admin/competitions/:id/units` | Unit count and parent IDs |
| `/api/admin/competitions/:id/units/:unitId/madrasas` | Sum Madrassa list lengths |
| `/api/admin/competitions/:id/categories` | Category count and parent IDs |
| `/api/admin/competitions/:id/categories/:categoryId/events` | Sum event list lengths |

The API retains the spelling `madrasas`; UI labels use Madrassas. IDs remain
strings, including PostgreSQL bigint values. Response lists and competition fields
are validated before use. Failed overview requests show a retry state, without
presenting partial counts as complete or converting errors to zeros.

The existing unpaginated endpoints make a summary endpoint unnecessary for this
foundation. An overview uses `2 + unitCount + categoryCount` requests, with at most
four nested reads per resource type in flight (eight combined). Navigation to a
placeholder does not fetch an overview. Returning to the dashboard fetches fresh
counts. Reads are not a database snapshot; concurrent administration can change
counts between requests. Reassess server-side summary needs if catalogs grow.
There is no leaderboard or scoring aggregation, polling, or management mutation.

The competition API has no year field. Display its exact code; do not infer a year
from a code, name or creation timestamp. No backend, migration, dependency or
environment changes are required. Existing Firebase/backend/database configuration
is still required for live verification. Production hosting must serve `index.html`
for direct admin route requests, as for existing public routes.

## Manual verification

1. Start the configured app with `npm run dev`. Visit `/` and existing competition,
   category, event and leaderboard public deep links without signing in.
2. Open `/admin/settings?competition=<id>` while signed out. Sign in as an admin;
   confirm the requested path/query survives. Check a non-admin gets access denied.
3. Visit `/admin` with no selection. Confirm no competition is assumed. Select each
   of two active competitions and an archived competition; compare all four counts
   against the source lists. Check a competition with zero children shows zeros.
4. Reload a selected URL, navigate through all six destinations, and use Back and
   Forward. Confirm selection persists and each management screen says it is not
   available yet. Try an unknown competition ID and an empty competition list.
5. With network throttling, change selection while the old overview is loading.
   Confirm old counts never appear under the new name. Simulate list/overview
   failures, restore connectivity and use Try again. No partial counts should show.
6. Check persistent API 401, API 403 and sign-out. Confirm protected content is
   removed. Check temporary access-check failure and failed sign-out recovery.
   Inspect HTTP status codes without copying bearer tokens.
7. At 320px and desktop widths, check long competition names and account IDs,
   open/close the mobile menu, and confirm no horizontal scrolling. Use keyboard
   Tab, Enter, native select keys and the skip link; check visible focus and labels.

## Automated verification

Run from the repository root:

```sh
npm run lint
npm run typecheck
npm run build
npm test
```

`routes/AdminDashboard.test.tsx` covers list loading, multiple active/historical
choices, zero counts, empty/missing selections, list/overview retries, malformed
responses, deep links, management placeholders, menu state, history, stale responses,
401 refresh/rejection, 403, token expiry and failed logout recovery. Existing
`App.test.tsx` retains public isolation, login, route guard, restoration and logout
coverage. `api/adminDashboardApi.test.ts` checks nested concurrent sums, request
bounds, bigint paths, malformed lists and cancellation.

Visual verification through the available browser was attempted, but the local
preview timed out. No live Firebase account checks or visual mobile checks are
claimed by automated DOM tests.

Verified on 2026-10-25: lint, typecheck, production build and all 77 frontend tests
passed. The complete `npm test` command also passed with 82 backend tests passing,
16 PostgreSQL integration tests explicitly skipped, and all 77 frontend tests
passing. That run used a process-only `DATABASE_URL` pointing to unavailable
`127.0.0.1:1` and `PGCONNECT_TIMEOUT_MS=1000`; it exercises the project's supported
no-PostgreSQL test mode without modifying environment files. The initial sandbox
run could not connect to test HTTP servers; the successful complete run allowed
loopback access. Live configured PostgreSQL integration verification is separate
from this offline result.
