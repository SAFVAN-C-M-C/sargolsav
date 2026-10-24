# TKT-08C — public leaderboard screens

## Routes and navigation

| Route | Screen |
| --- | --- |
| `/leaderboards` | Existing competition entry, redirecting to the newest active competition's overall units |
| `/competitions/:competitionId/leaderboards` | Overall unit rankings; default Leaderboards destination |
| `/competitions/:competitionId/leaderboards/categories/:categoryId/units` | Category unit rankings |
| `/competitions/:competitionId/leaderboards/categories/:categoryId/candidates` | Category candidate rankings |

Results/Leaderboards navigation, the public shell and admin authentication remain.
The category selector includes **Overall units · all categories** and the backend's
configured categories in their existing order. Choosing a category from overall
opens Units. Within a category, Units/Candidates links change only ranking type;
choosing another category preserves the type. Choosing Overall always opens units.
Changing competition returns to that competition's overall units so category IDs
are never reused across competitions.

Selections are URLs, not hidden local filters. Direct links and browser back and
forward restore the selection. Category views include an **Overall rankings**
back link. No overall candidate view is introduced. Unknown public paths retain
the existing not-found screen. Production still needs the established SPA history
fallback and same-origin `/api` routing.

## Existing API integration

All endpoints are reused unchanged, without Firebase authentication or query
parameters:

- `GET /api/competitions/:competitionId/leaderboard/units`
- `GET /api/competitions/:competitionId/categories/:categoryId/leaderboard/units`
- `GET /api/competitions/:competitionId/categories/:categoryId/leaderboard/candidates`

Contracts remain documented in the backend's [unit scoring guide](../backend/docs/scoring-api.md),
[candidate guide](../backend/docs/candidate-leaderboard-api.md), and
[overall unit guide](../backend/docs/overall-leaderboard-api.md).

The UI renders returned rows **in backend order**, including all zero-point
participants. It displays backend `rank` values unchanged, preserving ranks such
as `1, 1, 3`. A repeated rank receives an explicit Shared rank label. This is only
presentation of returned ranks; points and position-win counts never break ties.
No frontend score calculation, aggregation, reranking or name sorting occurs.

`total_points`, `rank`, `winning_entries` and position-win counts are validated as
decimal integer strings and displayed unchanged. Numeric JSON values are rejected
instead of converted after possible precision loss. Large values beyond
`Number.MAX_SAFE_INTEGER` remain exact. Candidate external codes likewise stay
strings, including leading zeros. Only informational position keys are sorted
using bigint comparison inside the optional achievement disclosure; ranking rows
retain their response order.

Competition/category metadata still comes from the existing 08A catalog. Invalid
or foreign category IDs get a recovery state before any leaderboard fetch.
Competition metadata failures retain the existing handling. A leaderboard 400/404
gets an unavailable state; other HTTP failures, network failures and malformed
responses use the shared safe error and retry state. No raw error text is shown.

## Components and UX

- `Leaderboards.tsx` owns category/type controls, headings, empty/unavailable states,
  snapshot loading and the connection to the shared API client.
- `RankingList.tsx` renders unit/candidate rows, raw ranks and totals, optional
  Madrassa, winning entries and expandable position wins. It has no fetching or
  scoring logic, keeping visual refinements independent of business logic.
- `publicApi.ts` adds leaderboard DTOs, runtime validators and one scoped resource
  method, reusing existing `freshGet`, in-flight deduplication and error handling.
- `publicPaths.ts` builds scoped frontend leaderboard paths.
- `PublicApp.tsx` replaces the placeholder and registers category/type routes,
  contextual back navigation and document titles.
- `styles.css` extends existing tokens with compact ranking cards, restrained
  leading-rank colors, a native category selector and touch-friendly type links.

Unit cards show rank, name, exact points and winning-entry count. Candidate cards
add name, external code, unit and optional Madrassa. Null/absent/blank Madrassa
names are omitted. Position wins are available through a keyboard-accessible
disclosure, avoiding excessive detail in the initial list.

Empty unit rosters and empty candidate categories have separate explanatory
states. Categories without published wins keep their returned zero-point rows;
when every returned winning-entry count is zero, a note explains that these
participants have no published wins yet. Zero points alone are never interpreted
as proof that there are no publications, since configured position points can
also be zero. Overall units work even when the competition has no categories.

Cards replace wide tables. Names, codes, ranks and scores can wrap without
horizontal scrolling. The native selector and ranking-type links are at least
48px tall; achievement disclosures are at least 44px tall. Active links announce
their current state, controls have visible focus, rank text includes a screen-reader
label, and loading skeletons use a screen-reader status. Existing skip links,
route focus and reduced-motion support remain.

Each mounted standings screen owns a fresh resource, keyed by competition,
category and type. In-flight reads for the same URL share one promise, including
React StrictMode effects. A selection change immediately displays its own loading
state; an older response cannot overwrite it. Reopening a screen requests a fresh
snapshot with browser `cache: no-store`. Successful leaderboard snapshots are not
retained between visits. No timers, polling, subscriptions or new data library
were added. Competition/category metadata retains its existing 08A session cache.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Complete `npm test`, backend | 179 passed, zero failures/skips |
| Complete `npm test`, frontend | 45 passed across five files |

Twelve new leaderboard tests cover default overall rendering, backend order,
shared ranks, exact large totals/counts, zero-point units/candidates, category unit
and candidate direct links, names/codes/unit/Madrassa metadata, category/type and
competition switching, back/forward URLs, keyboard activation, empty rosters,
loading/failure/retry, malformed numeric payloads, invalid/unavailable scope, late
response isolation, fresh snapshots on reopen, request deduplication and public
access without Firebase subscription. Existing result, category and admin tests
remain and pass; 08A placeholder expectations were updated to the implemented screen.
No backend code or tests changed because no API change was required.

Browser verification used the actual existing APIs with synthetic data in a
disposable local PostgreSQL cluster. It covered overall and category units,
candidate details with/without Madrassa, shared ranks, zero-point categories,
long names, keyboard type switching and 17-digit unit totals. At 280px, document
and row scroll widths matched client widths. A total of `18014398509481982`
remained intact and fit on one line after the narrow-layout adjustment. Desktop
layout was also inspected at 1280px.

## Manual verification

1. Start `npm run dev` with the existing migrated local database. Prepare an active
   competition with multiple categories, units and candidates through existing
   APIs/fixtures. Include published results, shared scores, zero-point participants,
   candidates with/without Madrassa, and a category with no published wins.
2. Without logging in, choose Leaderboards. Confirm overall units is the default,
   zero-point units appear and row order/ranks match the Network response exactly.
3. Select a category and switch Units/Candidates. Verify points, exact external
   codes, optional Madrassa, win counts and expandable position achievements.
   Choose another category while on Candidates; confirm the type is retained and
   candidates from the previous category disappear immediately.
4. Select Overall; confirm units across the competition. Switch competition and
   confirm its overall route. Open/reload copied category/type URLs and exercise
   browser back/forward and the contextual Overall rankings link.
5. Verify an empty roster, a category with no published wins, malformed/nonexistent
   IDs and a cross-competition category ID. Errors must not become empty rosters,
   and zero-point participants must remain visible.
6. Block/throttle the API, switch categories quickly, then retry after restoring
   the connection. Confirm loading/error feedback and that late responses cannot
   replace the current selection. Test very large decimal-string totals and counts;
   compare the displayed digits with the API response, without numeric conversion.
7. Check 280px, phone/tablet and desktop layouts, long metadata, focus visibility,
   native selector keyboard use, Enter on type links and achievement disclosures.
8. Recheck public category/event/result routes and protected `/admin/*` routes.
   Existing admin login/authorization must remain required only for admin screens.

## Files, environment and limits

Created: `frontend/src/public/Leaderboards.tsx`,
`frontend/src/public/RankingList.tsx`, `frontend/src/public/Leaderboards.test.tsx`,
and this guide.

Modified: `frontend/src/public/PublicApp.tsx`, `publicApi.ts`, `publicPaths.ts`,
`PublicApp.test.tsx`, `frontend/src/styles.css`, `README.md`, and the historical
08B guide's follow-up link.

No backend endpoints, scoring logic, migrations, dependencies, credentials or
environment files changed. The complete existing PostgreSQL suite ran against a
temporary loopback-only PostgreSQL 17 cluster on port 55438 with process-scoped
database URLs. Isolated schemas and synthetic preview fixtures did not touch the
configured database. Temporary servers and cluster were stopped and removed.
Ignored logs and generated builds are not committed.

Only 08C is implemented. Open pages remain request-time snapshots; revisit or
reload to see later publications/configuration changes. Automatic updates remain
08D. Existing APIs return whole rosters without pagination. No reset/export,
registration, admin management, new ranking rules or frontend scoring is added.
Local implementation/test and documentation commits are reported in the delivery
message along with final working-tree status. No push, merge, rebase or deployment
is performed.
