# TKT-08B — public event listings and published results

## Screens and routes

| Route | Behavior |
| --- | --- |
| `/competitions/:competitionId/results/categories/:categoryId` | Category event listing, ordered by event `sort_order` then ascending bigint ID, with Published/Awaiting Result labels |
| `/competitions/:competitionId/results/categories/:categoryId/events/:eventId` | Event details: latest published winners or verified awaiting-result state |

The existing home, competition selection, category cards, Results/Leaderboards
navigation and protected `/admin/*` routes remain. Event cards are real links;
direct URLs, Enter activation, browser back/forward and contextual **All events**
links preserve competition/category scope. Leaderboards remains the 08A placeholder.
Production hosting still needs the existing SPA history fallback and `/api` routing.

## API integration and visibility

### Added: `GET /api/competitions/:competitionId/categories/:categoryId/events`

```json
{
  "category": {"id":"2","name":"Junior"},
  "events": [
    {"id":"11","name":"Recitation","sort_order":0,"status":"published"},
    {"id":"12","name":"Storytelling","sort_order":5,"status":"unpublished"}
  ]
}
```

This single read-only endpoint extends the 08A public catalog service/router.
It lists **all configured events** in the selected category of an **active**
competition, including events with no result, draft results and reviewed results.
Those private states all map to `unpublished`, displayed as **Awaiting Result**.
`published` requires a published result header and an associated committed
publication. An `EXISTS` check reads no winner payload, correction workspace,
audit, publisher identity or private settings. The response projects explicit
metadata fields only. Ordering uses `sort_order ASC, id ASC`.

One SQL statement provides a consistent category/event/availability snapshot and
distinguishes empty events (`200`, `events: []`) from unavailable scope (`404`).
Competition and category IDs must be canonical positive bigint strings (`400`
otherwise). Cross-competition categories, missing parents and inactive
competitions return `404`. Unexpected failures use the existing sanitized `500`
handler. Responses use `Cache-Control: no-store`; no public writes are added.

### Reused: TKT-06C/06D public APIs

Under `/api/competitions/:competitionId/categories/:categoryId/events/:eventId`:

- `GET /result`: latest committed publication snapshot, including published
  corrections and all shared-position winners. The existing backend selects the
  latest publication ID; it does not read working winner entries or return history.
- `GET /result/status`: called when `/result` returns 404 to distinguish
  unpublished availability from missing scope. A result 404 alone never becomes
  an awaiting state. If availability is already `published`, the client rereads
  `/result` once to cover publication between the two requests.

The detail screen reads `/result` irrespective of the event card's earlier
availability. The result's scope must match all three URL IDs before rendering.
Other errors and malformed payloads are retryable errors. There is no fallback
to historical winners. No result, publication, scoring or lifecycle service changes
were needed. Existing result and availability API contracts remain unchanged.

## Components, data lifecycle and presentation

- `EventBrowser.tsx`: fresh category-event resource, ordered cards, public labels,
  empty/unavailable/error/loading states and event membership validation.
- `EventResult.tsx`: fresh result resource, awaiting state, published event/category
  labels, winner grouping and metadata display. Published names come from the
  publication snapshot so independent roster/name edits do not rewrite winners.
- `CategoryBrowser.tsx` now delegates category contents to `EventBrowser`.
  `PublicApp.tsx` adds the event route and contextual back link.
- `publicApi.ts` adds typed event/result/winner DTOs, runtime checks, fresh GET
  resources and a URL-keyed in-flight map. `publicPaths.ts` adds category/event URL
  builders. `PublicStates.tsx` permits screen-specific loading announcements.
- `styles.css` extends existing tokens/cards with availability badges and winner
  sections. Top three positions have different restrained tones and explicit
  ordinal labels, so color is never the only distinction. Other configured
  positions are supported without assuming a fixed top-three result shape.

Winners sort by ascending position, exact candidate-code string order, then name,
unit and Madrassa text for deterministic fallback when optional metadata is absent.
Shared positions retain all winners, explicitly label the shared group and never
shift places or calculate scores. Leading-zero candidate codes remain strings.
Missing candidate name/code/unit gets readable fallback text. Missing/null/blank
Madrassa information is omitted. Empty legacy winner arrays have a separate
published-details-unavailable state, not an invented awaiting state.

Event screens use mount-scoped resources. Changing the event or returning to its
listing creates a fresh resource; reopening details fetches the current snapshot.
Only concurrent requests share a promise, avoiding StrictMode duplication without
retaining historical winners between screen visits. Event/result/status requests
use browser `cache: no-store`. Resources own separate snapshots, so late responses
cannot overwrite another event's screen. The existing competition/category
metadata cache retains its 08A lifetime. No data library, timer or polling was added.

The current screen is a snapshot as of its request. A correction published while
it remains open appears after leaving and reopening or reloading; automatic
refresh remains 08D. Network/server errors hide winners and offer explicit retry.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Complete `npm test` backend | 179 passed, zero failures/skips |
| Complete `npm test` frontend | 33 passed across four files |

New frontend tests cover event order and status labels, links and keyboard
activation, direct URLs/back navigation, winner metadata, optional Madrassa,
shared positions, arbitrary positions, missing metadata, empty events, malformed
event IDs, network/HTTP/payload failures, loading and retry, publication races,
fresh published corrections on reopen, late response isolation and public access
without Firebase subscription. Existing 08A and admin authentication tests remain.

New HTTP and real PostgreSQL tests cover ID validation, authentication boundaries,
rejected writes, error sanitization, deterministic ordering, empty events,
competition/category isolation, no-result/draft/review privacy, published
availability, unpublished correction isolation, latest published corrections with
ties, safe response fields and inactive competitions.

Browser checks used synthetic local data at 280px and 1280px. Verified event
statuses, keyboard activation, shared places, optional Madrassa, awaiting results,
contextual back links, main focus, and long event/candidate/code/unit/Madrassa
wrapping. At 280px the document and winner-card scroll widths matched their
client widths; no horizontal overflow. Event cards were at least 112px tall.

## Manual testing

1. Run `npm run dev` with an existing migrated local database. Through existing
   admin APIs/fixtures, prepare an active competition/category containing ordered
   events: no result, draft, reviewed, published, and published with shared places.
   Include an empty category, tied display orders and optional Madrassa data.
2. Browse from `/` into a category without signing in. Confirm all events appear
   in configured order; only committed publications say Published.
3. Open unpublished events. Confirm Awaiting Result with no candidate data.
   Open published events and verify positions, all tied winners, external codes
   with leading zeros, units and optional Madrassa names.
4. Reload a copied event URL. Use **All events**, browser back/forward, Results
   and Leaderboards tabs. Confirm category and competition context remain in URLs.
5. Prepare/review a correction. Reopen details and confirm the original publication
   remains visible. Publish the correction, then reopen details; confirm only the
   new winners display. No historical snapshot should be offered as current.
6. Test nonexistent/malformed IDs and cross-category event IDs. Confirm unavailable
   states and recovery links, with no foreign winners.
7. Block the API, reload and retry after restoring it. Throttle requests and
   navigate between events quickly; late responses must not replace the selected
   event. Errors must not silently become Awaiting Result.
8. At 280px, phone/tablet and desktop widths, check long metadata, readable ordinal
   labels, focus visibility, Enter activation and screen-reader status labels.
9. Recheck `/admin/login` and protected `/admin/*` routes; admin verification remains
   required. No public request should send a Firebase token.

## Files and environment

Created: `frontend/src/public/EventBrowser.tsx`,
`frontend/src/public/EventResult.tsx`, `frontend/src/public/Events.test.tsx`,
`backend/test/public-events.test.js`, `backend/test/public-events.integration.test.js`,
and this guide.

Modified: `frontend/src/public/CategoryBrowser.tsx`, `PublicApp.tsx`,
`PublicApp.test.tsx`, `PublicStates.tsx`, `publicApi.ts`, `publicPaths.ts`,
`frontend/src/styles.css`, `backend/src/routes/publicCatalog.js`,
`backend/src/services/publicCatalog.js`, `backend/test-support/public-catalog-http.js`,
`README.md`, and the historical 08A guide's follow-up link.

No migrations, dependencies, credentials, environment files, permanent settings,
or configured application database changes. Tests used installed PostgreSQL 17
in a disposable loopback-only cluster on port 55438 and isolated migrated schemas.
Synthetic browser fixtures and their published corrections existed only in that
cluster. Temporary preview servers and cluster were stopped and removed after
verification. Ignored logs and generated builds are not committed.

Only 08B is implemented. Leaderboard screens, polling, admin management,
registration and scoring changes remain deferred. Local commits group backend,
frontend and documentation changes; hashes and final working-tree status appear
in the delivery response. No push, merge, rebase or deployment is performed.
