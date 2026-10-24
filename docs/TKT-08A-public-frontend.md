# TKT-08A — public frontend foundation and category browsing

This records the 08A delivery. [TKT-08B](TKT-08B-public-results.md) subsequently
replaces its category placeholder with event listings and published result screens.

## Routes and behavior

| Route | Screen |
| --- | --- |
| `/` | Public entry; opens the newest active competition with a history-replacing redirect, or shows loading, retry, or no-active-competition state |
| `/leaderboards` | Opens the newest active competition's leaderboard placeholder; same availability states as home |
| `/competitions/:competitionId/results` | Competition heading, competition picker, Results/Leaderboards tabs, ordered category cards |
| `/competitions/:competitionId/results/categories/:categoryId` | Category heading and event-results placeholder; validates category membership in the selected competition |
| `/competitions/:competitionId/leaderboards` | Leaderboard placeholder; no leaderboard data fetched |
| Other public paths | Page-not-found screen with public navigation |
| `/admin/login`, `/admin`, `/admin/*` | Existing login, backend-verified admin gate, and protected placeholder unchanged |

All active competitions remain selectable when there is more than one. The newest
ID is the deterministic default; selecting another competition preserves the
current Results/Leaderboards section. Category selection uses the API's names and
ordering, never a fixed list. Competitions with no categories get a distinct empty
state. Unavailable competitions and nonexistent/cross-competition categories get
useful recovery links. Direct links do not depend on first visiting home.

Browser back/forward uses React Router history. Category navigation pushes an
entry; only initial default selection replaces one. Route changes focus the main
landmark without scrolling the header out of view and return the viewport to the
top. Production hosting must return `index.html` for public and admin frontend
paths while routing `/api` to Express. Vite's existing `/api` proxy is unchanged;
`vite preview` alone does not proxy the API.

## Components and styling

- `frontend/src/App.tsx` retains the separate admin auth shell and delegates public routes.
- `frontend/src/public/PublicApp.tsx` owns the public shell, nested routes, home,
  competition scope, picker, navigation, and document title.
- `frontend/src/public/CategoryBrowser.tsx` renders category cards, empty categories,
  category membership validation, and the category placeholder.
- `frontend/src/public/PublicStates.tsx` shares loading skeletons, empty states,
  and retryable errors for future public screens.
- `frontend/src/public/publicPaths.ts` centralizes the results URL builder.
- `frontend/src/public/publicApi.ts` defines public DTOs, runtime response checks,
  typed GET requests, keyed request resources, and the React subscription hook.
- `frontend/src/styles.css` adds shared color/surface/radius tokens and scoped
  public styles, retaining existing admin styles. System fonts require no network
  font download. Green, cream, quiet geometry, generous spacing, and restrained
  branding suit the cultural setting without elaborate decoration.

Cards form a single column on phones and two columns from 680px. The constrained
desktop shell remains readable. Cards, tabs, competition choices and footer links
have at least 44px touch height. Semantic links and navigation landmarks, active
link announcements, a skip link, visible keyboard focus, loading status text,
error alerts, wrapping names and reduced-motion skeletons support accessibility.
At the smallest widths decorative tab icons are hidden to preserve readable text.

## Public API dependency and visibility

Existing metadata endpoints were admin-only. Two minimal unauthenticated GETs are
added, with no database migration or change to existing result/scoring endpoints:

### `GET /api/competitions`

```json
{"competitions":[{"id":"12","name":"Sargolsav 2026"}]}
```

Returns **active competitions only**, ordered by descending ID. No active
competition is `200 {"competitions":[]}`. Draft and archived metadata are excluded.
There is no separate public visibility flag in the current schema; activating a
competition makes its name and categories available to this frontend.

### `GET /api/competitions/:competitionId/categories`

```json
{
  "competition":{"id":"12","name":"Sargolsav 2026"},
  "categories":[{"id":"31","name":"Custom category","sort_order":2}]
}
```

One SQL statement joins the active competition to its categories, providing a
consistent snapshot and distinguishing an empty category list from an unavailable
competition. Categories are ordered by `sort_order ASC, id ASC`. Positive bigint
IDs stay strings. Invalid IDs return 400; missing, draft and archived competitions
return 404; unexpected failures return sanitized 500 responses. Responses use
`Cache-Control: no-store`. Public mutation routes are not added.

Both queries select explicit safe metadata columns. No competition code, admin
timestamps, private settings, audit information, candidate data, unpublished
results, or event/result payloads are returned or queried.

## Fetch lifecycle

The API client belongs to the mounted public shell and sends relative `/api` GETs
with `Accept: application/json`, without Firebase tokens. In-flight requests and
successful responses are shared by URL across screens and React StrictMode
effects. Different competition resources have separate snapshots and subscribers,
so out-of-order responses cannot overwrite the current screen. Navigation does
not have to cancel another consumer's shared request. A failed resource offers an
explicit retry; no timers, polling, persistence, or state library are introduced.
Successes last for the public shell's lifetime. Reloading the browser (or leaving
and re-entering the public shell) refreshes the data; freshness automation is 08D.

## Automated verification

- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: 175 backend tests and 22 frontend tests passed, zero failures/skips.
- New frontend coverage includes home loading, custom categories and order,
  no competitions, no categories, HTTP/network/malformed responses, retry,
  multiple competitions, direct category and leaderboard links, unknown scope,
  history navigation, shared requests under StrictMode and late response isolation.
- Existing admin login, protected routes, return destination, sign out, claim
  failures and restoration tests remain passing. Public access starts no Firebase
  subscription and sends no authorization header.
- New HTTP tests verify unauthenticated reads, ID validation, safe errors,
  cache policy, no writes and production mounting alongside protected admin routes.
- New real PostgreSQL/HTTP tests verify active-only visibility, missing scope,
  empty competitions, arbitrary category names, display-order ties, isolation,
  exact returned fields, and disappearance after archiving.

Verification used PostgreSQL 17 in a temporary loopback-only cluster on port
55438. Process-only database URLs selected that cluster; the configured database
was untouched. The existing isolated-schema harness applied migrations and
removed test schemas. Synthetic preview data was created only in the disposable
cluster for browser checks. No dependencies, environment files, credentials,
permanent environment settings, or application schema changed. The temporary
servers and cluster were stopped and temporary cluster files removed afterward.
Generated builds and ignored test logs are not committed.

## Manual verification

1. Start the backend and frontend with `npm run dev`. Configure a local development
   PostgreSQL database and apply the existing migrations as described in README.
2. Using the existing admin API/fixtures, supply an active competition and custom
   categories with different `sort_order` values, plus a second active competition
   without categories. This ticket adds no admin management screens.
3. Open `/` without signing in. Confirm default selection, configured category
   names/order, competition switching, and the empty-category state.
4. Open a category, switch tabs, and use browser back/forward. Copy and reload the
   category URL. Confirm the competition remains in the URL throughout.
5. Visit an invalid category in a valid competition and a missing/draft/archived
   competition. Confirm explanatory states and recovery links. With no active
   competitions, confirm the public empty state and navigation remain usable.
6. Stop the API (or use browser network blocking), reload, then restore it and
   retry. Confirm readable errors with no raw server details. Throttle category
   requests, switch competitions quickly, and confirm the newer selection stays.
7. Test at 280/320px, phone, tablet, and desktop widths, including long category
   and competition names. Confirm no horizontal overflow and comfortable targets.
8. Tab through the skip link, competition links, tabs and cards; use Enter to
   navigate. Confirm visible focus and selected-tab announcements.
9. Visit `/admin/login` and refresh a protected `/admin/*` route. Existing Firebase
   login/authorization remains required for admin access only.

Browser verification during delivery used synthetic local data at 280px, 320px
and 1280px. Checks covered category navigation, tab navigation, main focus, card
touch heights (104px), responsive layout, and no horizontal overflow at 280px.

## Files and scope

Modified: `README.md`, `backend/src/config/app.js`, `frontend/src/App.tsx`,
`frontend/src/App.test.tsx`, `frontend/src/styles.css`.

Added: `backend/src/routes/publicCatalog.js`,
`backend/src/services/publicCatalog.js`,
`backend/test-support/public-catalog-http.js`,
`backend/test/public-catalog.test.js`,
`backend/test/public-catalog.integration.test.js`,
`frontend/src/public/PublicApp.tsx`, `frontend/src/public/CategoryBrowser.tsx`,
`frontend/src/public/PublicStates.tsx`, `frontend/src/public/publicApi.ts`,
`frontend/src/public/publicPaths.ts`, `frontend/src/public/PublicApp.test.tsx`,
and this document.

Only 08A is implemented. Event result details, leaderboard data, automatic
refresh/polling, registration and admin management screens remain deferred.
Archived competition browsing is deliberately unavailable through these new
metadata endpoints. Cached metadata can remain visible until the public shell
is refreshed. No push, merge, rebase or deployment is performed. Local commit
hashes and final working-tree status are reported in the final delivery message.
