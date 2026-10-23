# sargolsav

Mobile-first Zonal Madrassa Cultural Competition Results application.
This foundation covers TKT-01 only; database integration is deferred to TKT-02.

## Requirements and setup

- Node.js 22.13+ within version 22, or Node.js 24+; npm 10 or newer.
- From the repository root, run `npm install`.
- Optional: copy `backend/.env.example` to `backend/.env` and
  `frontend/.env.example` to `frontend/.env.local`. Defaults work without these files.

## Local development

Start both servers from the repository root with one command:

```sh
npm run dev
```

Output is labeled `backend` and `frontend`. Press Ctrl+C to stop both servers.
If either command exits, concurrently stops the other. To run a server separately,
use `npm run dev:backend` or `npm run dev:frontend`.

The backend uses nodemon to restart when JavaScript or JSON files in `backend/src`
change. Restart the development command after changing `backend/.env`.

Open http://localhost:5173. Vite proxies `/api` to the backend at
http://localhost:3001. If you change the backend port, also change
`API_PROXY_TARGET` in `frontend/.env.local`. The backend binds to loopback by
default; set `HOST` explicitly if access from another device is needed.

The backend uses Helmet security headers, CORS, and Express's built-in JSON and
URL-encoded body parsers with a 100 KB body limit. A separate `body-parser`
package is unnecessary. Set backend `CORS_ORIGIN` to a comma-separated list of
allowed browser origins (default `http://localhost:5173`, no trailing slashes).
Cross-origin credentials are disabled. The Vite proxy remains the default local
API access path. CORS controls browser access; it does not authenticate requests.

`GET http://localhost:3001/api/health` returns `{"status":"healthy"}`.
The same endpoint is available through http://localhost:5173/api/health in development.

## Checks and builds

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use Node's built-in test runner and exercise the health endpoint, API 404
behavior, security headers, CORS, and body parser errors and limits.
`npm run build` typechecks and builds the frontend into
`frontend/dist`. `npm run preview --workspace frontend` previews that build;
the preview server does not proxy API requests. `npm start --workspace backend`
runs the backend without watch mode. Deployment configuration is outside TKT-01.

## Structure and scope

- `frontend/src`: React and TypeScript entry point and mobile-first foundation styles.
- `backend/src/routes`: HTTP route registration.
- `backend/src/controllers`: HTTP request/response handling.
- `backend/src/middleware`: API 404 catcher and error handling.
- `backend/src/services`: application operations (currently health status only).
- `backend/src/db`: reserved database boundary; no driver, connections, or schema yet.
- `backend/src/config/app.js`: Express app, independently importable for tests.
- `backend/src/index.js`: environment configuration and listener startup.

The backend uses JavaScript ES modules. Production hosting, authentication,
competition rules, database schema, migrations, and the API data contract remain
unresolved and are intentionally deferred. No PostgreSQL installation is required
for TKT-01. Frontend environment values are public; never put secrets in `VITE_*`
variables. Local environment files are ignored; commit only sanitized examples.
