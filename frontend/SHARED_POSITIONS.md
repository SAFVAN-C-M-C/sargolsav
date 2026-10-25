# Shared-position overrides and workflow verification (TKT-09G)

## UI and routes

The existing `/admin/results` draft and correction editors now include an
**Allow Shared Positions** checkbox under **Exceptional shared positions**. It is
off initially, including when reopening a saved or inherited override. No new role,
claim, route or persistent override preference exists. The same verified Firebase
admin authorization applies.

Examples retain the existing selected competition/category/event query parameters:

- `/admin/results?competition=1&category=11&event=111`: ordinary initial draft editor.
- Add `&resultView=review`: saved result verification, review and publication.
- Add `&correction=7&resultView=correction`: private correction editor.
- Add `&correction=7&resultView=correction-review`: saved correction verification.

IDs are illustrative. Existing direct links, refresh, Back/Forward, scope resets,
aborted reads and ignored late mutation completions remain in use. No published
entry is edited directly. A correction remains private until normal review and
confirmed publication succeed.

The checkbox enables extra winner rows without the ordinary one-row-per-position
limit. Group summaries identify the position and every sharing candidate's exact
code/name. A visually distinct shared-position notice also appears in lifecycle
verification and final publication confirmation. All configured positions must
still be represented for review, even zero-point or nonconsecutive positions.
Tying first place does not remove another configured winning position.

## Validation and confirmation

Ordinary entry still rejects duplicate positions. Opt-in only relaxes that check;
duplicate exact candidate codes, unresolved lookups, identity/category conflicts,
missing names, invalid units and unconfigured positions remain blocked. Exact code
strings retain leading zeros, case and spaces. Existing candidate lookup and
transactional backend candidate reuse/creation are unchanged.

Every explicit save requires a new reason satisfying the backend's existing rules:
NUL-free, at most 1000 characters after trimming, at least ten Unicode letters or
digits, and at least two whitespace-separated words containing letters/digits.
The correction-start reason is separate and never enables a tie. The backend
validates again and remains authoritative for identity, affiliation, scopes,
versions and approval provenance.

**Save shared-position override** first opens a confirmation dialog. It displays
the reason, exact sharing groups and complete desired winner list, including unit
name and optional Madrassa ID. It explains private replacement, audit attribution
and full configured points for each shared winner after publication. Removing
all winners/approvals is called out explicitly. No request is sent until **Confirm
override**. Cancel/Escape preserve all inputs. Cancel receives initial focus;
Tab/Shift+Tab stay inside the dialog; focus returns on closure. While saving,
controls are disabled and Escape cannot dismiss the pending write.

Opt-in, reason, winners, confirmation and pending writes participate in existing
unsaved-navigation, Back/Forward, logout and unload guards. Server validation and
network failures retain them. A synchronous mutation latch prevents duplicate writes.
No success or new baseline/version is accepted before the validated server response.
Version/lifecycle/override conflicts require deliberate reload; dirty reload asks
before discarding. Candidate identity conflicts can be reconciled using the existing
lookup UI. Errors never trigger ordinary-save fallback. Ambiguous network outcomes
should be reconciled by reload before a deliberate retry.

## Exact API integration and operation selection

See the [existing backend contract](../backend/docs/shared-position-api.md).

| Editor | Explicit endpoint |
| --- | --- |
| Initial draft | `PUT /api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result-draft/shared-positions` |
| Private correction | `PUT /api/admin/competitions/:competitionId/categories/:categoryId/events/:eventId/result/corrections/:correctionId/shared-positions` |

Both send exactly `{version, shared_positions: true, reason, entries}`. Entries
are the complete replacement set, containing `candidate_code`, `name`, `unit_id`,
nullable `madrasa_id` and `position`. The current opaque draft or correction version
is echoed verbatim. Actor, approval/audit IDs, candidate database IDs, points and
lifecycle fields are never supplied. Responses use the existing `{draft}` or
`{correction}` envelope and runtime scope/status/metadata validation.

| Saved state / desired change | Required action |
| --- | --- |
| Ordinary unique entries remain unique | Ordinary Save draft/correction |
| New duplicate positions | Explicit opt-in, reason, confirmation, shared endpoint |
| Any existing override references, including inherited ties | Shared endpoint for every edit, even an unrelated singleton edit |
| Add/remove a member of an existing tied group | Fresh explicit reason/confirmation and current version |
| Remove every tie, submit unique/incomplete/empty set | Shared endpoint audits removal and clears references |
| Subsequent edits after confirmed removal | Ordinary save; duplicate positions remain rejected |
| No old override and no desired duplicate positions | Explicit request prevented locally; turn opt-in off |
| Unchanged inherited correction approval | Normal review permitted; backend validates the inherited provenance |
| Reviewed or published result | Return reviewed result to draft, or start/resume a published correction |

After any successful save the checkbox and reason reset. The UI tracks actual
returned override references, rather than treating the checkbox as a stored state.
Clearing approvals is supported by the current backend, so no workaround or new
API was necessary. Prior approval and publication history are preserved. Reasons
and private audit data never enter public projections.

## Components and files

- `DraftEditor.tsx`: explicit opt-in/reason, correct API selection, confirmation
  snapshot, fresh version/baseline, retained failures and override-removal tracking.
- `SharedPositionConfirmation.tsx`: exact saved payload preview, exceptional impact,
  audit notice and keyboard-accessible dialog.
- `DraftManager.tsx`, `CorrectionWorkspace.tsx`: expose the existing reusable editor
  for saved/inherited overrides while preserving lifecycle locks.
- `WinnerSummary.tsx`: clear shared groups in review/publication confirmation.
- `api/resultsApi.ts`, `api/resultLifecycleApi.ts`: explicit scoped save operations.
- `utils/winnerEntry.ts`: explicit opt-in to shared-position validation only;
  `utils/sharedPositions.ts`: backend-aligned reason validation and grouped display.
- `styles/components.ts`: wrapping notices, touch-friendly opt-in and responsive reason field.
- API/utility tests, `ResultEntry.test.tsx` and `ResultLifecycle.test.tsx`: contract,
  editor, lifecycle, concurrency, navigation and authentication regressions.
- `backend/test/admin-shared-workflow.integration.test.js`: one new combined isolated
  PostgreSQL workflow test; no production backend code changes.

## Verification and limits

The new combined database test closes a specific integration gap: ordinary draft
publication followed by introducing a new shared group in a correction, with all
three public leaderboards and public winners checked in the same workflow. It
creates only a random isolated schema using the existing harness, applies existing
migrations there and drops that schema afterwards. It never modifies existing
competition data. It covers candidate reuse (`001`) versus a distinct code (`1`),
private correction persistence, unchanged public winners/unit/overall scores until
publication, stale saves, audit actor/reason/scope, authorization, isolation, history
and full points (5, 5, 3; unit total 13). Existing backend suites cover SQL rollback,
approval validation, concurrency, inherited approvals and removal.

The existing candidate leaderboard lists all registered candidates. Private entry
can therefore introduce a registry row with zero winning entries/points before
publication; this is existing behavior. Pending correction winners do not contribute
points or replace the frozen public result.

Verified on 2026-10-25:

- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing 503.04 kB main-chunk warning remains. Results
  remain in a separate lazy chunk (42.25 kB).
- `npm test --workspace frontend`: **303 passed across 19 files**, zero failures.
- Complete offline `npm test`: **82 backend passed, 17 PostgreSQL integration tests
  skipped, 303 frontend passed; zero failures**. This run deliberately used an
  unavailable loopback database via process-only environment overrides. Skips are
  not passes.
- Real PostgreSQL full backend run: **175 passed, 5 failed, zero skipped** out of
  180 reported tests (including nested tests). All failures were in the existing
  setup-workflow suite: a parallel structure read returned 500 under the overly
  short process-only `PGCONNECT_TIMEOUT_MS=1000`, causing four subtest failures and
  the parent failure. The root npm command stopped before its frontend stage.
- Targeted retry: `PGCONNECT_TIMEOUT_MS=15000 npm test --workspace backend --
  test/setup-workflow.integration.test.js` passed **10/10, zero skipped**, with no
  code changes. All 17 database integration suites were therefore exercised
  successfully across the initial run and this retry. The initial full live run
  is recorded as failed, not retroactively labelled green.
- The new combined TKT-09G PostgreSQL workflow test passed, as did the existing
  shared-position approval/rollback, lifecycle, public result and scoring suites.

Frontend tests use mocked Firebase/HTTP and jsdom. Real database tests still mock HTTP token
verification; they do not establish live Firebase authorization. Real-browser
history/unload, keyboard/assistive technology and visual mobile checks remain
separate manual verification items. No credentials, environment files, dependency,
production migration or infrastructure changes are required. Existing migration
0008 is a prerequisite for a deployment and was not newly introduced by TKT-09G.

## Manual verification

Use a development Firebase admin and an isolated/disposable competition. Do not
experiment on existing production-like competitions.

1. Select competition/category/event. Create/reuse candidates with exact codes,
   save a unique ordinary draft, review, confirm publication and inspect public
   winners plus unit/category-candidate/overall standings.
2. Start a correction. Confirm the sharing checkbox is off; ordinary duplicate
   positions fail. Enable it, add/reuse an additional sharing candidate, enter a
   meaningful reason, inspect groups and cancel confirmation. Inputs must remain.
3. Confirm the override once on a slow connection. Inspect the endpoint/body without
   copying tokens. The complete set and current correction version must be sent;
   no ordinary save should follow a failure. Verify audit attribution privately.
4. Before and after review, compare the public frozen winners and scores. They must
   remain at the prior publication. Confirm correction publication and verify every
   shared winner earns full configured points; prior publication history remains.
5. Reopen a shared draft/correction. Add a tied candidate, remove one, change a
   singleton, then remove all ties. Each edit needs a fresh explicit reason/save.
   After confirmed removal ordinary saving works and rejects new duplicates again.
6. With two admins, force stale saves/reviews/publications, lifecycle races, changed
   settings and candidate conflicts. Confirm input retention, no blind overwrite,
   explicit dirty reload, protected transitions and safe 400/401/403/404/network errors.
7. Check direct links, refresh, Back/Forward, competition/category/event switches,
   unsaved checkbox/reason/winners, logout and unload. A late response must not show
   another competition's winners or success message.
8. At 280/320/375/768 px and desktop widths, check long names/reasons, checkbox touch
   target, wrapping, no horizontal overflow, dialog scrolling, visible focus,
   keyboard Tab/Shift+Tab/Escape and focus restoration. Recheck all public and prior
   admin routes. Public pages must contain no private reason or audit metadata.

No roles, scoring formulas, leaderboard redesign, reset/export or later-phase work
was introduced.
