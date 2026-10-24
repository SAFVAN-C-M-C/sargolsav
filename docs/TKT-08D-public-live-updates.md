# TKT-08D — public live updates and mobile optimization

## Polling lifecycle

`frontend/src/public/publicResource.ts` provides the reusable resource and hooks.
`usePollingResource` acquires polling ownership; `usePublicResource` performs the
existing one-time metadata read. Resources retain one pending request, one timer
and one visibility handler regardless of how many React consumers acquire them.

- Default interval: **15 seconds after a request finishes**, using recursive
  timeouts. Slow requests never overlap a later scheduled or manual refresh.
- Only mounted polling consumers with a visible document schedule reads. Hidden
  tabs clear timers, including when mounted initially hidden. Returning to visible
  triggers one prompt refresh. If a request is already pending, one follow-up read
  runs after it settles. Repeated visible events do not create extra loops.
- Cleanup releases ownership, clears timers and removes visibility listeners.
  In-flight logical reads may finish; completions with no remaining consumers are
  ignored. Navigated resources have separate snapshots and cannot overwrite the
  new screen. StrictMode's acquire/release/acquire cycle shares the pending read
  instead of duplicating it or leaving another timer active.
- Network failures, HTTP 5xx, 408 and 429 retry with delays of **15, 30, then 60
  seconds**, capped at 60 seconds. Success resets the normal cadence. A visibility
  return or deliberate Refresh action can request a prompt retry.
- Other HTTP 4xx responses, including invalid IDs and missing resources, stop
  automatic retries and visibility refreshes. Validated response-schema failures
  also stop rather than repeatedly accepting invalid data. Manual Refresh may
  deliberately attempt recovery. Initial failures retain existing loading/error/
  retry UI; transient initial failures also retry automatically.

Background requests never replace ready data with skeletons. Failures retain the
last successful data with **Showing saved data. Retrying updates.** Terminal
failures instead show **Updates stopped. Showing saved data.** Recovery removes
the warning. The always-present Refresh button is keyboard accessible and shares
the same non-overlap guard. No raw network/server error details reach the UI.

Successful JSON payloads are fingerprinted locally. Unchanged responses preserve
the snapshot/data reference and notify no React subscribers. Changed responses
update existing keyed components, preserving open achievement disclosures and
focus. Refreshes never navigate, call scroll-to-top or rebuild the public shell.
No repeated healthy-refresh announcements or animations are introduced.

## Screens and request optimization

Existing URLs and APIs are unchanged. Polling applies to:

| Active screen | Polled public data |
| --- | --- |
| Category event listing | `/api/competitions/:competitionId/categories/:categoryId/events` |
| Event result | `/api/competitions/:competitionId/categories/:categoryId/events/:eventId/result`, or lightweight availability while awaiting |
| Overall units | `/api/competitions/:competitionId/leaderboard/units` |
| Category units | `/api/competitions/:competitionId/categories/:categoryId/leaderboard/units` |
| Category candidates | `/api/competitions/:competitionId/categories/:categoryId/leaderboard/candidates` |

Event details read their category's event metadata once for membership/name
validation; that parent listing does **not** poll while the detail is displayed.
Competition and category catalogs keep their existing session cache and are never
polled. Result, leaderboard and admin screens do not poll each other's resources.
Unchanged navigation retains the same resource. The API client continues sharing
concurrent requests by URL and uses browser `cache: no-store` for fresh reads.

An initial result 404 is verified through `/result/status`, as in 08B. Once the
event is known to be unpublished, subsequent cycles use only the status endpoint.
When it becomes published, the actual result is fetched. Published events then
poll the result body directly, so published corrections are detected even though
their availability remains Published. A status 404 is a terminal unavailable
resource; a verified `unpublished` status is a successful awaiting snapshot and
continues polling. The existing publication-race retry remains bounded to one
additional result read.

Healthy steady-state viewing therefore normally issues one public GET per
15-second cycle for the active screen, plus network duration. Initial details and
the transition to publication can need a result/status pair. No per-event status
requests are added to a category listing.

Conditional-request/change-token infrastructure was not added. Existing APIs use
`no-store` and expose no lightweight version token covering both publications and
scoring-setting changes. Availability alone cannot detect corrections. Manual
ETag management would still require backend computation and client payload state;
the current small, scoped responses plus visibility pausing and unchanged-payload
render suppression keep Phase 1 simple. No backend change, Redis, queue, WebSocket,
subscription, dependency or scoring/ranking rule is introduced.

All results and standings still use the existing public projections. Drafts,
reviews and pending correction workspaces remain private. Latest committed
publications replace prior winners; shared ranks and exact decimal-string scores
remain untouched by the frontend. Independent screens do not share a transactional
snapshot, so separate reads may straddle a publication commit.

## Focused mobile improvements

- `viewport-fit=cover` and safe-area inset padding protect the existing public
  header, content and footer on notched/edge-to-edge devices.
- `RefreshStatus.tsx` shares a reserved **80px** feedback area, so normal/error
  status changes do not move the result/ranking content at the tested widths.
  Refresh targets are at least 44px tall, with existing visible keyboard focus.
- Existing wrapping cards and exact-string score presentation are retained.
  Long candidate, unit, Madrassa and event names remain readable without wide
  tables or horizontal scrolling. No redesign or decorative animation was added.
- Initial skeletons remain; background loads keep content visible. Slower requests
  delay the next cycle instead of increasing request concurrency or blocking
  navigation. Unchanged payloads avoid unnecessary list rendering on slower devices.

Browser review covered **280, 320, 375, 430 and 1280px**. Document scroll widths
matched client widths on result and leaderboard screens; ranking rows also fit.
Long metadata and large string totals were present in synthetic fixtures. The
feedback region stayed 80px and Refresh stayed 44px at every width. A temporary
preview wrapper added two-second latency and 503 failures: existing winners stayed
visible, error feedback fit at 280px, and automatic recovery restored healthy text.

The open browser result changed from Awaiting Result to Published after a real
local publication, then replaced winners after a published correction without
navigation. A live leaderboard updated after a local scoring-settings change,
with an open achievement disclosure, focus and scroll position preserved.
Physical device safe-area behavior is implemented through standard CSS insets;
the width checks are browser viewport checks, not physical-device certification.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Complete `npm test`, backend | 179 passed, zero failures/skips |
| Complete `npm test`, frontend | 61 passed across seven files |

Eleven new resource tests cover initial/scheduled reads, unchanged snapshots,
StrictMode and multiple-consumer ownership, hidden-tab pause/restore, pending
requests on restore, slow request non-overlap, initial/transient failures, bounded
backoff/reset, terminal errors, deliberate recovery, unmount listener/timer cleanup
and stale completions after resource changes. Five new screen tests cover automatic
event availability, publications/corrections, status-request optimization, all
three leaderboard types, exact scores/shared ranks, retained disclosure/focus/
scroll, background errors/recovery, static metadata request counts, public access
and stopping unrelated screens. Existing navigation, result and admin tests pass.

The unchanged backend suite ran with real PostgreSQL in isolated migrated schemas.
Preview publications, corrections and settings changes used only synthetic data
in a disposable loopback-only PostgreSQL 17 cluster on port 55438. Process-scoped
database URLs selected it; the configured application database was untouched.
Temporary servers, wrapper flags/fixtures and cluster were stopped and removed.
No environment files, credentials, permanent settings, dependencies or migrations
changed. Generated builds and ignored verification logs are not committed.

## Manual verification

1. Start the normal local app against an existing migrated development database.
   Open a category with awaiting events. Publish through existing admin APIs and
   confirm its card updates automatically; no login is needed for public viewing.
2. Keep an awaiting event open. Publish it and confirm winners appear. Prepare a
   correction and confirm unpublished changes stay private. Publish the correction;
   confirm only the current winners appear on the next completed cycle.
3. Open overall units, category units and category candidates. Change publications
   or position settings through the existing workflow. Verify ranks/row ordering,
   exact large score strings and zero-point participants against API responses.
4. Expand Position wins and keep keyboard focus within the screen. Confirm refreshes
   preserve the disclosure, selected category/type, URL and scroll position.
5. Hide the browser tab for at least 30 seconds. Confirm no new cycles in Network.
   Return to it and confirm a prompt refresh. A logical read already in progress
   may finish, but further cycles wait until visible.
6. Throttle requests below a 15-second throughput or temporarily block the API.
   Confirm non-overlap, retained data and saved-data warning. Restore connectivity
   and observe automatic recovery. Check retry spacing increases to 30/60 seconds.
7. Simulate a missing/invalid resource. Confirm automatic requests stop, including
   after hide/show; initial views show unavailable, and background failures label
   the retained data as saved. Explicit Refresh can retry deliberately.
8. Navigate away during a slow response; confirm it cannot overwrite the new screen
   and the former screen stops scheduling. Unmount public viewing by visiting
   `/admin/login`; confirm no public polling remains. Existing admin gating stays.
9. Check all five widths above, long metadata, visible focus, safe-area padding,
   44px targets and no horizontal overflow. Inspect Network: no repeated catalog
   metadata, no parent event polling on details, and only the current leaderboard.

## Files and limitations

Created: `frontend/src/public/publicResource.ts`, `publicErrors.ts`,
`RefreshStatus.tsx`, `publicResource.test.tsx`, `LiveUpdates.test.tsx`, and this guide.
Modified: `frontend/src/public/publicApi.ts`, `EventBrowser.tsx`, `EventResult.tsx`,
`Leaderboards.tsx`, `frontend/src/styles.css`, `frontend/index.html`, `README.md`,
and the historical 08C guide's follow-up link.

Only 08D is implemented. Detection is eventually consistent, normally the next
15-second cycle plus request duration; failures/backoff can delay it. Static
competition/category metadata still refreshes on page reload or a new public
session. No cross-tab coordination is introduced: separate visible windows may
each poll. API responses remain whole lists, without new pagination/cache systems.
Local implementation/test and documentation commit hashes and final working-tree
status are reported in the delivery message. No push, merge, rebase or deployment
is performed.
