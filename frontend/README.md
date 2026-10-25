# Frontend structure

The React frontend groups files by responsibility, with related UI grouped by feature.

See [Admin dashboard foundation](ADMIN_DASHBOARD.md) for protected routes, selected
competition context, component structure, API dependencies and manual checks.

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
  styles/       Global application styles
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

Run checks from the repository root:

```sh
npm run lint
npm test --workspace frontend
npm run build
```
