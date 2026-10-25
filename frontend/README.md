# Frontend structure

The React frontend groups files by responsibility, with related UI grouped by feature.

See [Admin dashboard foundation](ADMIN_DASHBOARD.md) for protected routes, selected
competition context, component structure, API dependencies and manual checks.
See [Competition management and settings](COMPETITION_MANAGEMENT.md) for creation,
editing, lifecycle transitions, shared points forms, validation and verification.
See [Unit and Madrassa management](UNIT_MADRASSA_MANAGEMENT.md) for scoped CRUD,
deletion safeguards, selection URLs, API dependencies and manual verification.
See [Category and event management](CATEGORY_EVENT_MANAGEMENT.md) for configured
ordering, scoped forms, deletion protection, APIs and manual checks.
See [Result draft entry](RESULT_ENTRY.md) for exact candidate lookup, versioned
drafts, production navigation blocking, API integration and manual verification.
See [Result review, publication and corrections](RESULT_LIFECYCLE.md) for lifecycle
screens, frozen public winners, private correction workspaces and conflict handling.
See [Shared-position overrides](SHARED_POSITIONS.md) for exceptional tie entry,
audited editing/removal, validation and end-to-end workflow verification.

```text
src/
  api/          Backend requests, response validation, and API errors
  components/
    admin/      Route protection, dashboard overview and reusable status panels
    common/     Shared loading, empty, error, and refresh states
    public/
      leaderboards/  Standings and ranking lists
      navigation/    Public navigation and competition selection
      results/       Category, event, and winner displays
  constants/    Authentication and polling configuration
  contexts/     React context definitions
  hooks/        Authentication and resource subscription hooks
  layouts/      Shared page shells
  lib/          Firebase client integration
  pages/
    admin/      Admin login and dashboard
    public/     Home, competition, and missing-page screens
  providers/    Context providers and authentication lifecycle
  routes/       Public route composition and route integration tests
  styles/       MUI theme, document baseline, and reusable styled components
  types/        Shared domain, authentication, and resource contracts
  utils/        URL builders, error messages, and resource scheduling
  App.tsx       Root router and admin route composition
  main.tsx      Application entry point
```

Import shared types from `types`, hooks from `hooks`, and API functions from
`api` directly. Keep component-specific props and helpers beside their component.
Use nested component folders when several components serve the same feature.
API and hook tests live beside their modules; public navigation and screen
integration tests live in `routes/__tests__`. Root routing and admin authentication
tests remain in `App.test.tsx`.

Styling uses Material UI with its default Emotion engine. `AppThemeProvider`
provides the shared palette, typography, component defaults, and `CssBaseline`.
Use MUI components and `sx` for local adjustments; use MUI's `styled()` API for
reusable custom components in `styles/components.ts`. Use typed styling props
for dynamic states and variants; filter them with `shouldForwardProp` so they
do not reach the DOM. Components manage their own styles without manual
`className` hooks. MUI and Emotion generate their internal classes. Keep document defaults
in `styles/baseline.ts` and brand tokens in `styles/theme.ts`; do not add standalone
CSS stylesheets.

Run checks from the repository root:

```sh
npm run lint
npm test --workspace frontend
npm run build
```
