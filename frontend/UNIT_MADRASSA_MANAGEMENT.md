# Unit and Madrassa management UI (TKT-09C)

## Routes and selection

The protected `/admin/units` screen manages participating units and optional
Madrassas for the dashboard's selected competition. The existing query parameter
`competition` remains authoritative; nothing is assumed when it is absent.

| Example | Screen state |
| --- | --- |
| `/admin/units?competition=1` | Units in competition 1 |
| `/admin/units?competition=1&unit=11` | Unit details and its Madrassas |
| `/admin/units?competition=1&unit=11&madrasa=111` | Madrassa details under that unit |
| `/admin/units?competition=1&participantForm=new-unit` | Create a unit, without requiring a Madrassa |
| `/admin/units?competition=1&unit=11&participantForm=unit` | Edit the unit name |
| `/admin/units?competition=1&unit=11&participantForm=new-madrasa` | Create an optional child Madrassa |
| `/admin/units?competition=1&unit=11&madrasa=111&participantForm=madrasa` | Edit the selected Madrassa name |

These IDs are examples, not seeded assumptions. Selection and form routes survive
a refresh and support browser Back/Forward. Links preserve the selected competition
and unrelated query parameters. Selecting another competition clears `unit`,
`madrasa` and `participantForm`, preventing an old unit selection from being reused
in the new competition. Back restores the previous complete URL and scoped state.

No competition selection means no participant API request or editable form. Empty
unit lists offer creation; a unit with zero Madrassas remains valid and manageable.
Madrassa counts are shown for the selected unit once its list has loaded, rather
than making one count request per unit or displaying unknown counts as zero.
Dashboard, competition management/settings, public routes and authentication behavior
remain intact. [Categories/events](CATEGORY_EVENT_MANAGEMENT.md) are implemented in
TKT-09D; [result draft entry](RESULT_ENTRY.md) is implemented in TKT-09E.

## Existing API integrations

All endpoints use the existing Firebase-authenticated request utility, relative to
`/api/admin/competitions/:competitionId/units`:

| Method | Relative path | Use |
| --- | --- | --- |
| GET | `/` | List units |
| POST | `/` | Create unit with `{name}` |
| GET | `/:unitId` | Read unit details |
| PATCH | `/:unitId` | Edit unit with `{name}` |
| DELETE | `/:unitId` | Confirmed unit deletion; 204 response |
| GET | `/:unitId/madrasas` | List Madrassas and obtain the selected unit's count |
| POST | `/:unitId/madrasas` | Create Madrassa with `{name}` |
| GET | `/:unitId/madrasas/:madrasaId` | Read Madrassa details |
| PATCH | `/:unitId/madrasas/:madrasaId` | Edit Madrassa with `{name}` |
| DELETE | `/:unitId/madrasas/:madrasaId` | Confirmed Madrassa deletion; 204 response |

The existing API spelling is `madrasas`; visible labels use Madrassas. The frontend
only sends name on creation/editing. Parent competition/unit IDs are exclusively
in request paths. There are no transfers, codes, new backend APIs or other fields.

`AuthProvider.request` now accepts bodyless DELETE requests and handles 204 without
parsing JSON. Firebase ID tokens continue to come directly from the SDK and are
never manually persisted or logged. Existing 401 token-refresh/retry and 403 access
removal also apply to deletes. The backend remains authoritative for authorization,
validation and dependencies.

## Components and files

- `pages/admin/AdminUnits.tsx`: competition context, navigation and deletion-rule
  explanation; mounts the workspace keyed by competition ID.
- `components/admin/participants/CompetitionUnits.tsx`: unit list, creation mode,
  selection, list refresh and successful mutation feedback.
- `components/admin/participants/UnitDetails.tsx`: scoped unit detail read, edit,
  delete actions and nested Madrassa workspace.
- `components/admin/participants/MadrassaWorkspace.tsx`: nested list, count, optional
  creation and scoped Madrassa details/edit/delete.
- `components/admin/participants/ParticipantNameForm.tsx`: shared accessible name
  form using existing mutation and unsaved-change hooks.
- `components/admin/participants/ParticipantActions.tsx`: shared edit navigation,
  explicit deletion confirmation, pending lock and error feedback.
- `api/participantsApi.ts`: scope-validated requests, required-name validation and
  deletion-conflict explanations.
- `types/adminParticipants.ts`: typed unit and Madrassa data projections.
- `utils/participantPaths.ts`: query changes that retain competition context.
- `App.tsx`, `AdminLayout.tsx`, `types/auth.ts`, `AuthProvider.tsx`, `global.css`:
  route integration, child-selection cleanup, DELETE support and responsive styles.
- `routes/UnitManagement.test.tsx`, `api/participantsApi.test.ts` and the existing
  dashboard route tests cover integration and regression behavior.

Existing design tokens, `DashboardStates`, `useAdminResource`, `useAdminMutation`
and `useUnsavedAdminForm` are reused. No architectural restructuring is required.

## Validation, deletion and request safety

Names must be nonblank and contain no null characters. Exact case and surrounding
spaces are preserved, matching backend rules. Only name is editable; duplicate-name
400/409 responses are displayed as text and preserve the entered name. Other server
failures use the established safe generic feedback. Forms use associated labels,
required/invalid state, described validation errors and alert/status feedback.

Every delete requires explicit confirmation naming the record and its parent,
explaining permanence and that related records will not be removed. Units with
Madrassas or candidates, and Madrassas referenced by candidates/results, cannot be
deleted through normal management APIs. A backend 409 becomes a friendly dependency
message; the record stays visible and no optimistic removal occurs. Failed requests
keep form values. Deletion is offered on the read-only detail view, not alongside
its own unsaved name editor. Parent deletion is hidden while a child form is open.
There is no cascade, detach, reset, candidate-management or transfer UI.

Fieldsets and delete buttons lock while pending. The existing synchronous mutation
latch also rejects repeated submit events. Each success rereads the relevant list;
edits reread details too, and create selects the returned ID. Successful deletion
clears the deleted selection while retaining its competition/parent context. A
post-write refresh failure remains retryable and does not reinterpret the write as
failed. A transport-ambiguous write is not automatically retried; check current
server data before retrying, especially after creation.

Every returned participant, including each list item, is checked against its
expected competition and optional unit. Detail responses also match the requested
record ID. IDs remain canonical positive bigint strings, without numeric rounding.
Nested APIs are only used after the scoped parent detail loads successfully.
Wrong-parent direct links show an error without exposing another unit's Madrassa.

Competition/unit/Madrassa component keys and the existing abort-aware resource and
mutation hooks prevent stale results from replacing new selections, even if a
transport ignores cancellation. Aborting a request does not undo a server-accepted
write. Successful checks from the existing auth provider do not unmount dirty forms;
authorization failures still remove protected content.

Dirty forms and pending writes use the established layout warnings for links,
competition selection, Cancel and logout, plus the native beforeunload warning for
reload/tab close. TKT-09E's production data-router guard now covers SPA Back/Forward
and programmatic navigation too; see [result entry](RESULT_ENTRY.md). Standalone
declarative-router embeddings retain the earlier fallback. Name edits still follow
the existing backend's last-writer behavior without version checking.

## Mobile and manual verification

Participant lists wrap long names; forms remain stacked. Edit/create links and
buttons use at least 44px targets under the existing styles. No dependencies,
unnecessary animation or horizontal-scroll tables are introduced.

1. Start the configured app with `npm run dev` and sign in as an admin. Visit
   `/admin/units` without a selection, then select a competition. Verify no data is
   requested or shown from another competition. Check draft/active/archived choices.
2. Create the first unit with no Madrassa. Verify exact name text, new URL, list,
   detail and zero-Madrassa state. Edit its name and check persistence after reload.
3. Add two Madrassas under one unit, rename one, and use links to switch units and
   Madrassas. Confirm the selected unit's count changes after creation/deletion.
4. Try blank names, scoped duplicate names and server errors for both record types.
   Check entered values remain, only `{name}` is sent and duplicate submits are
   blocked under network throttling.
5. Cancel each deletion confirmation and verify no DELETE request. Confirm deleting
   unreferenced records and check selection/list updates and empty 204 handling.
6. Try deleting a unit with Madrassas/candidates and a Madrassa referenced by a
   candidate/result. Confirm backend 409 shows friendly protection feedback and no
   related records disappear. Do not alter dependencies to force deletion.
7. Open unit/Madrassa deep links directly, refresh, then use Back/Forward. Change
   competition while viewing a child; verify old child parameters clear. Try a
   wrong-parent child ID and verify no foreign detail is shown.
8. Delay reads/writes and switch competition/unit after confirming navigation.
   Confirm late responses never replace new data or change its selected URL.
9. Check loading, empty, network/server failures and retry for every list/detail.
   Edit without saving and cancel link/selection/Cancel/logout/unload prompts.
   Exercise the production browser-history protection added in TKT-09E.
10. Verify signed-out, non-admin, expired and revoked sessions remove protected
    access. Check status codes and headers without copying ID tokens into logs.
11. At 320px and desktop widths, inspect long names, form and list wrapping, keyboard
    focus, labels and touch targets. Recheck existing public and admin screens.

Live Firebase, live PostgreSQL and visual desktop/mobile manual verification were
not performed for this ticket. Automated DOM tests do not establish visual layout
or live service behavior.

## Automated verification (2026-10-25)

Run from the repository root:

```sh
npm run lint
npm run typecheck
npm run build
npm test
```

- Lint, typecheck and production build: **passed**.
- Frontend suite: **150 passed**, including existing public/auth/competition suites.
- Complete suite in supported offline database mode: **82 backend passed,
  16 PostgreSQL integration tests explicitly skipped, 150 frontend passed,
  zero failures**. Skipped integration tests are not counted as passed.
- That run allowed loopback HTTP access and used process-only `DATABASE_URL` pointing
  to unavailable `127.0.0.1:1` and `PGCONNECT_TIMEOUT_MS=1000`. No environment files
  were changed. The frontend uses mocked Firebase and HTTP; backend HTTP/unit tests
  do not establish live PostgreSQL behavior.

Coverage includes both CRUD workflows, optional Madrassas, exact name-only bodies,
validation/duplicate/server errors, confirmed and protected deletion, 204 responses,
loading/retry/empty states, duplicate-submit locks, URL/history state, unsaved-change
warnings, stale reads/writes, returned-parent validation, bigint IDs and authorization.
No backend, database migration, environment, dependency or scoring changes are made.
