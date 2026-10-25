# Competition management and shared settings (TKT-09B)

## Screens and navigation

- `/admin/competitions`: list all returned competitions, create a draft, select a
  competition, load its details, edit its name/code and change its lifecycle status.
  The create form remains available when the list is empty.
- `/admin/competitions?competition=<id>`: directly load that selected competition's
  details. No competition is assumed by default. Unknown IDs retain the dashboard's
  unavailable-selection message and picker.
- `/admin/settings?competition=<id>`: load and replace the selected competition's
  complete shared position-to-points configuration. Without selection, explain how
  to select a competition and do not request settings or offer a save.
- Both screens link back to `/admin` and retain the selection query. List selection,
  sidebar navigation, reloads, and browser Back/Forward use the same URL context.
- Units/Madrassas, categories/events and results remain future-feature placeholders.
  Existing public and authentication routes are unchanged.

## Existing API dependencies

Every request uses the existing Firebase-authorized `AuthProvider.request` utility.
No new backend endpoint, scoring rule, dependency or migration is introduced.

| Method and endpoint | Purpose |
| --- | --- |
| `GET /api/admin/me` | Existing server-verified admin identity |
| `GET /api/admin/competitions` | Shared list and selected competition context |
| `POST /api/admin/competitions` | Create with exactly `{name, code}`; backend creates a draft |
| `GET /api/admin/competitions/:id` | Read competition details |
| `PATCH /api/admin/competitions/:id` | Send only changed name/code fields |
| `PATCH /api/admin/competitions/:id/status` | Send `{status}` for a supported transition |
| `GET /api/admin/competitions/:id/settings` | Read shared points; `settings: null` means unconfigured |
| `PUT /api/admin/competitions/:id/settings` | Replace the entire `{position_points}` map |

Mutation responses update both the form's saved baseline and the layout's list/
selected context, using the backend's returned competition values. Creation inserts
and selects the returned draft. Reload details explicitly fetches the current
server record after a conflict or external edit. Detail/settings responses validate
shape and competition identity; malformed responses do not become editable defaults.

The backend remains authoritative for authorization, uniqueness and lifecycle
validation. Only `draft -> active/archived`, `active -> archived` and
`archived -> active` are offered. All lifecycle changes require confirmation of the
competition name, previous/next status and public-availability impact. Multiple
active competitions are supported. No return-to-draft action is offered.

## Form validation and behavior

- Name and code must be nonblank strings without null characters. Values retain
  exact entered text, including spaces and leading zeros. There is no invented year
  field, maximum name length or automatic code normalization.
- Position keys must be canonical positive integers in `1..2147483647`, with no
  leading zeros, duplicate positions, fractions, exponent notation or signs.
- Points must be whole decimal digits representing a number in
  `0..9007199254740991`. Zero is valid; negatives, fractions, blanks, exponent
  notation and unsafe integers are rejected. JSON values are sent as numbers.
- Add/remove rows edits the entire configuration. Empty rows must be filled or
  removed. Removing all rows explicitly saves `{}` after confirmation; no default
  points or event-specific settings are invented. Legacy numeric settings are
  displayed for repair, but all replacement values must pass current validation.
- Every points save requires confirmation that it affects **all published
  leaderboards** and removes omitted positions. Cancellation preserves the form.
- Fieldsets lock during writes, and a synchronous mutation latch rejects duplicate
  submits even before React rerenders. Lifecycle actions are disabled while details
  are dirty or a write is pending. Other competitions can still be selected after
  confirming that a pending write may complete on the server.
- Validation and HTTP errors preserve entered values. API 400/404/409/413 messages
  are displayed as text; other failures use generic feedback and do not expose raw
  transport errors. Network-ambiguous writes are not automatically repeated. Check
  current data before retrying, especially after creating a competition.
- Successful writes display explicit feedback and reset the saved baseline.

## Component structure and safety

`pages/admin/AdminCompetitions.tsx` composes the list, `CreateCompetitionForm` and
`CompetitionDetails`. `CompetitionDetails` loads before mounting its editor.
`pages/admin/AdminSettings.tsx` composes `CompetitionPoints` and its row editor.
These forms live under `components/admin/competitions/`.

`api/competitionApi.ts` owns typed request/response handling and validation;
`api/adminErrors.ts` owns safe API error messages. `useAdminMutation` owns request
cancellation, the duplicate-submit latch and mutation feedback. `useAdminResource`
continues to prevent stale reads and now allows updating loaded list data without
unmounting the active form. The shared outlet contract is `types/adminWorkspace.ts`.

Each selected form is keyed by competition ID. Cleanup aborts its requests, and
late responses (even from a transport ignoring abort) cannot overwrite another
selected competition or show stale success feedback. Cancellation does not undo a
write already accepted by the backend.

Unsaved forms register with `AdminLayout`. The layout confirms before in-app links,
competition selection or logout discard edits, and installs a native beforeunload
warning for reload/tab close. Same-page skip links are exempt. Browser-managed
warnings depend on browser interaction rules. **SPA browser Back/Forward and
external programmatic navigation are not blocked** by the existing BrowserRouter;
unsaved drafts can be lost on those paths. No browser-history interception or
router restructuring is introduced in this ticket.

Background Firebase access checks keep the current authorized form mounted while
verification is pending, then remove it on authorization failure. Read/write
requests use a separate session generation from access-check sequencing, allowing
Firebase's token-change callback and successful periodic checks to occur during a
write without invalidating it. Account changes, logout and denied/expired access
still invalidate old work. Firebase ID tokens are obtained from the SDK for each
request, never manually persisted or logged. A 401 retries once with a refreshed
token; persistent 401/403 removes protected content as before.

## Limits

The existing API has no optimistic-concurrency version for competition details or
shared points. Details PATCH sends changed fields only, but concurrent edits to the
same field or complete points map follow backend last-writer behavior. Coordinate
shared points changes between admins and reload before editing if data may have
changed. This ticket does not add backend locking/version rules or new scoring.

Responsive form grids, stacked mobile controls, native labels, visible focus styles,
status/alert feedback and existing touch-target conventions are used. Visual Chrome
verification was attempted using synthetic data only; computer-use refused to act
because it could not confidently establish the current browser URL. In-app preview
navigation also timed out. Temporary preview files/server were removed/stopped.
No visual desktop/mobile or live Firebase verification is claimed.

## Manual verification

1. Start the configured app with `npm run dev`, sign in as a Firebase admin and open
   `/admin/competitions`. With an empty database, confirm creation is still available.
2. Create a draft with a unique code. Check exact name/code text, status, list entry,
   selector and URL. Use a duplicate code and blank inputs; verify feedback and
   preservation of entered values. Throttle the network and try repeated submits.
3. Select a competition, reload the URL and edit name/code separately. Confirm only
   changed fields are sent and the returned name/code appears in the list/picker.
4. Cancel then confirm activation and archiving. Check the documented transitions,
   public availability, and that other active competitions are unchanged. Simulate
   a stale transition/409, then use Reload details to recover current server state.
5. Open Settings. Edit points, add/remove positions, save after confirmation, then
   reload and verify persistence. Try zero points and the upper limits. Try `0`,
   `01`, duplicate/oversized positions, negative/fractional/unsafe points and blanks.
   Confirm invalid values remain editable and do not submit. Clear all rows and
   confirm that no defaults are supplied.
6. Edit without saving. Cancel selection, link navigation, logout and tab-close/
   reload prompts. Confirm fields survive cancelled prompts. Exercise the documented
   Back/Forward limitation. Check that a background focus access check retains edits.
7. Simulate list/detail/settings load failures and retry. Delay a response, switch
   competitions and confirm old reads/writes cannot replace the new selection.
8. Exercise revoked/expired tokens and non-admin access. Confirm protected forms
   disappear. Verify headers/status without copying bearer tokens into logs.
9. At 320px and desktop widths, test long names, field labels, row removal, keyboard
   navigation, visible focus and no horizontal overflow. Recheck public home,
   category/event and leaderboard routes without Firebase initialization.

## Automated verification (2026-10-25)

- `npm run lint`, `npm run typecheck`, `npm run build`: **passed**, run at the repository root.
- `npm test --workspace frontend`: **114 passed**, using mocked Firebase and HTTP.
- Complete `npm test` in the supported no-PostgreSQL mode: **82 backend passed,
  16 PostgreSQL integration tests skipped, 114 frontend passed; no failures**.
  The process-only overrides were an unavailable loopback `DATABASE_URL` at
  `127.0.0.1:1` and `PGCONNECT_TIMEOUT_MS=1000`. Loopback HTTP access was allowed.
  No environment files were edited. Skipped tests are not reported as passed.
- No live PostgreSQL or live Firebase tests were run for TKT-09B. Offline coverage
  does not establish live database or Firebase behavior.

`routes/CompetitionManagement.test.tsx` covers creation/editing, exact request fields,
empty state, transitions and conflicts, confirmations, points replacement and
validation, server errors, duplicate submits, URL/history context, unsaved warnings,
stale responses, background verification/token-change races and authorization.
Existing dashboard, auth and public test suites remain included.
