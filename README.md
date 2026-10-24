# sargolsav

Mobile-first Zonal Madrassa Cultural Competition Results application.
This foundation covers TKT-01 through TKT-04A, including PostgreSQL utilities,
versioned competition schema migrations, local development fixtures, and backend
Firebase admin authentication.

## Requirements and setup

- Node.js 22.13+ within version 22, or Node.js 24+; npm 10 or newer.
- From the repository root, run `npm install`.
- Copy `backend/.env.example` to `backend/.env` and
  `frontend/.env.example` to `frontend/.env.local` as needed. Public health routes
  work without Firebase configuration; admin requests require it.

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

Tests use Node's built-in test runner and exercise health endpoints, API 404
behavior, security headers, CORS, body parser limits, Firebase authorization
with mocked verification, claim provisioning, and PostgreSQL behavior.
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
- `backend/src/db`: shared PostgreSQL pool, query/transaction utilities, and migration runner.
- `backend/src/config/app.js`: Express app, independently importable for tests.
- `backend/src/index.js`: environment configuration and listener startup.

The backend uses JavaScript ES modules. Frontend login, competition management
services, and the remaining API data contract are deferred. PostgreSQL is
optional for application-only development and mock-based tests. Frontend
environment values are public; never put secrets in `VITE_*` variables. Local
environment files are ignored; commit only sanitized examples.

## Firebase Admin authentication (TKT-04A)

Create a Firebase project and enable a sign-in provider in Firebase Authentication.
Create users through Firebase Authentication before granting admin. The backend
accepts a Firebase **ID token** in `Authorization: Bearer <token>` for
`GET /api/admin/me`. A missing, invalid, expired, revoked, or disabled user's token
returns 401; a verified user without the boolean `admin: true` custom claim gets
403. A verified admin receives only `uid`, `email`, `emailVerified`, and `admin`.
Authentication responses are not cached. `/api/health` and `/api/health/db` stay
public. There is no HTTP signup or claim-grant endpoint.

The Admin SDK is initialized once per backend process using either Application
Default Credentials (ADC) or the configured service-account email and private key,
plus the required project ID. ID token verification checks
revocation on every admin request. For future audit writes, use `request.auth.uid`
from the authentication middleware for `reviewed_by`, `published_by`, and
`audit_logs.actor_ref`; ignore any UID supplied in a request body. No database
migration is needed for this ticket.

| Backend environment variable | Where to obtain / configure it | Safe for frontend exposure? |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` (required for admin requests) | Firebase console → Project settings → General → Project ID. Set explicitly for the target Firebase project. | The project ID itself is public, but keep this backend setting separate from frontend config. |
| `GOOGLE_APPLICATION_CREDENTIALS` (local/on-premises ADC) | Firebase console → Project settings → Service accounts → Generate new private key; store the downloaded JSON **outside the repository** and set this variable to its absolute file path. On Google hosting, prefer the platform's attached service identity and leave it unset. | **No.** The service-account key is secret; do not place its path or contents in frontend variables. |
| `FIREBASE_CLIENT_EMAIL` (alternative to ADC) | `client_email` in the downloaded service-account JSON; set together with `FIREBASE_PRIVATE_KEY` in the backend secret store. | Keep backend-only; it identifies a privileged service account. |
| `FIREBASE_PRIVATE_KEY` (alternative to ADC) | `private_key` in the downloaded service-account JSON; preserve PEM newlines or encode them as `\n`. | **No.** This is a secret private key. |

The backend uses the email/key pair when both are set; otherwise it uses ADC.
If either email or key is set alone or empty, admin requests fail closed. For local
development, put the project ID and both service-account values in the ignored
`backend/.env`; encode private-key newlines as `\n` inside a quoted value. Use a
development Firebase project and a service account with Firebase Authentication
permissions. As an alternative, omit both fields and set
`GOOGLE_APPLICATION_CREDENTIALS` to an external service-account JSON path.
In production, inject the email/key pair through a secret manager, or prefer an
attached Google service identity with ADC. Never bake credentials into images or
frontend builds. Keep the project ID explicit so token verification targets the
intended project.

Give the runtime identity permission to use Firebase Authentication. Never commit
`backend/.env` or a key file, or expose private-key material through `VITE_*`.
Keep local credentials readable only by the backend operator. The frontend
Firebase web config and login flow are outside this ticket.

To grant or revoke admin on an **existing** Firebase user, run the backend-only
CLI manually with the exact project ID in `FIREBASE_PROJECT_ID`:

```sh
npm run admin:claim --workspace backend -- grant --uid EXISTING_FIREBASE_UID --project YOUR_PROJECT_ID
npm run admin:claim --workspace backend -- revoke --uid EXISTING_FIREBASE_UID --project YOUR_PROJECT_ID
```

The script checks that `--project` matches the configured project, preserves
other custom claims, and revokes refresh tokens when removing admin. A newly
granted user must refresh their ID token to receive the claim. A revoked user's
existing ID token is rejected by the backend's revocation check. Script and HTTP
errors omit credential, token, and SDK details.

To verify authentication, obtain a current Firebase ID token from a signed-in
Firebase client for the configured project, then call `GET /api/admin/me` with
`Authorization: Bearer <ID_TOKEN>`. A valid admin gets 200 with the four safe
identity fields; a signed-in non-admin gets 403, and a missing or invalid token
gets 401. For a newly granted admin, force an ID-token refresh first. Treat ID
tokens as secrets: do not paste them into logs, source files, or bug reports.
`GET /api/health` and `GET /api/health/db` require no token. The provisioning CLI
is a write operation; validate its argument guard with an intentionally mismatched
`--project` rather than running `grant` or `revoke` during routine checks.

## PostgreSQL foundation (TKT-02)

Install PostgreSQL locally using its platform installer, start its service, then
connect using `psql -U postgres -h localhost`. Create an empty development database:

```sql
CREATE DATABASE sargolsav;
```

Copy `backend/.env.example` to `backend/.env` and set your local password there.
From the repository root, run:

```sh
npm run db:migrate
npm run dev
```

The migration command runs in the backend workspace and loads `backend/.env`.
It applies the TKT-03 competition schema and records migration history.
See `backend/migrations/README.md` for SQL naming, ordering, locking and retry rules.
Migrations are explicit; the HTTP server never applies them on startup.

`GET /api/health` remains an application-only liveness check.
`GET /api/health/db` executes `SELECT 1` and returns `200 {"status":"healthy"}`
or `503 {"status":"unhealthy","error":"Database unavailable"}`. Connection is
lazy: an unavailable PostgreSQL service does not prevent the application starting.

Configuration (all backend-only):

| Variable | Default / meaning |
| --- | --- |
| `DATABASE_URL` | Optional postgres/postgresql URL; overrides host/port/database/user/password fields |
| `PGHOST`, `PGPORT` | `localhost`, `5432` |
| `PGDATABASE`, `PGUSER`, `PGPASSWORD` | `sargolsav`, `postgres`, empty password |
| `PGSSLMODE` | `disable` locally; `verify-full` enables TLS certificate verification for hosting |
| `PGPOOL_MAX` | 5 connections per backend process (valid 1–100) |
| `PGCONNECT_TIMEOUT_MS` | 5000; bounds connection acquisition |
| `PGIDLE_TIMEOUT_MS` | 30000; closes idle pooled connections |
| `PGSTATEMENT_TIMEOUT_MS` | 10000; server statement timeout, including lock waits |
| `PGQUERY_TIMEOUT_MS` | 15000; client query timeout |
| `PGTRANSACTION_IDLE_TIMEOUT_MS` | 15000; server idle transaction timeout |

Numeric settings must be positive integers; port is at most 65535 and timeout
values are at most 2147483647. Invalid configuration fails early with sanitized
messages. URL TLS parameters are rejected; configure TLS through `PGSSLMODE`.
Hosted databases must use trusted certificates (configure Node's trusted CA if
necessary); certificate verification is never disabled when TLS is enabled.
Keep the pool small and account for all application replicas within the host's
connection limit. Keep transactions short. SIGINT/SIGTERM drains the HTTP server
and closes the shared pool. Never put database secrets in frontend variables.

Use `runQuery('SELECT $1::text AS value', [value])` from `backend/src/db/index.js`.
Use `transaction(async query => { ... })` with only the supplied query function
for all transaction statements. Errors propagate to callers; return sanitized
errors at HTTP boundaries. Never build SQL from untrusted strings.

`npm test` includes mock-based database configuration, query, transaction,
migration sequencing/cleanup and HTTP health checks; it requires no PostgreSQL
server. TKT-03 also includes real PostgreSQL integration tests which explicitly
skip when no database is reachable (or fail if a test database is explicitly
required). See [database schema documentation](backend/docs/schema.md) for the ERD,
03-A/03-B/03-C review groups, service validation boundaries, test configuration,
and the opt-in `npm run db:seed` local fixture.
