# Firebase dependency security review

Reviewed on 2026-10-24 with Node.js 22.22.0 and npm 10.9.4.

## Findings

Both `npm audit` and `npm audit --omit=dev` initially reported four high-severity
package entries. These were two advisories in one vulnerable dependency, with
severity propagated to its three parents:

```text
firebase@12.19.0
  @firebase/firestore-compat@0.4.14
  @firebase/firestore@4.17.2
    @grpc/grpc-js@1.9.16
```

| Advisory | Upstream severity | Affected versions | Fix used |
| --- | --- | --- | --- |
| [GHSA-m9gg-hp2v-232j / CVE-2026-101916](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j) | High | `<1.13.6` or `>=1.14.0 <1.14.5` | `1.14.6` |
| [GHSA-f596-whhp-79r4 / CVE-2026-101915](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4) | Low | `<1.13.6` or `>=1.14.0 <1.14.5`, as published by upstream | `1.14.6` |

The first affects gRPC servers that use `getAuthContext()` for authentication
with optional client certificates. The second can expose handler error messages
from gRPC servers. Sargolsav runs an Express server and imports only
`firebase/app`, `firebase/auth`, `firebase-admin/app`, and `firebase-admin/auth`.
It has no Firestore calls or gRPC server. The vulnerable copy was installed as a
production dependency, but was not used by the authentication flow. The backend's
separate Google Cloud dependency chain already resolved to patched gRPC `1.14.6`.

## Resolution and compatibility

The root `package.json` overrides only `@firebase/firestore@4.17.2`'s
`@grpc/grpc-js` dependency to exact version `1.14.6`. The lockfile removes the
vulnerable nested copy and reuses the existing patched version. The Firebase
client stays at `12.19.0`; Firebase Auth and backend SDK versions are unchanged.
Both audits report zero vulnerabilities after the change.

This intentionally crosses Firestore's upstream `~1.9.0` constraint. It remains
within gRPC's major version 1, but Sargolsav's verification does **not** establish
Node Firestore compatibility. Before adding Firestore, review this override and
run Firestore integration tests. A browser build module check verifies that no
`@firebase/firestore`, `@firebase/firestore-compat`, or `@grpc/grpc-js` modules
enter the production frontend bundle.

Firebase's [upstream PR #10412](https://github.com/firebase/firebase-js-sdk/pull/10412)
proposes upgrading the same dependency to `~1.14.5`. We use `1.14.6` because it
includes the published fixes for both advisories. Remove the override when a
released Firebase SDK resolves a patched version normally; then regenerate the
lockfile and repeat the checks below. The exact Firestore version in the override
also requires revisiting it when Firebase is upgraded.

Alternatives checked:

- The current Firebase SDK `13.1.0` contains Firestore `4.19.0`, which still
  declares `@grpc/grpc-js: ~1.9.0`. It does not fix these advisories and its
  component packages require Node.js `>=24.12.0`.
- Firestore is a required dependency of the supported `firebase` package. npm
  cannot omit it independently while retaining that package's dependency contract.
- The individual `@firebase/app` and `@firebase/auth` READMEs explicitly say they
  are not intended for direct use. Switching to those imports would leave the
  officially supported installation path.
- No forced audit fix, SDK downgrade, global gRPC override, or manual removal of
  installed dependency files is used.

## Revalidation

```sh
npm ci
npm ls firebase @firebase/firestore @grpc/grpc-js
npm run lint
npm run typecheck
npm run build
npm test
npm audit --omit=dev
npm audit
```

The tree must resolve Firestore to gRPC `1.14.6` and contain no `1.9.16` copy.
Use a clean install to confirm the lockfile is reproducible. Existing locked
workspace entries can survive an override added by `npm install`; inspect both
the lockfile and installed tree rather than relying on the override declaration.

With npm `10.9.4` and `10.9.8`, `npm ls` reports `ELSPROBLEMS` against Firestore's
original `~1.9.0` constraint even though the override is installed and both audits
are clean. npm `11.14.1` recognizes the scoped override and lists the same tree
successfully. To check it without changing the global npm installation, run:

```sh
npm exec --yes --package=npm@11.14.1 -- npm ls firebase @firebase/firestore @grpc/grpc-js
```

Verification passed: a clean `npm ci` and subsequent normal lockfile install,
lint, typecheck, production build, all 46 backend and 14 frontend tests, and both
audits. The browser build contains 58 modules, including Firebase App and Auth,
with zero Firestore or gRPC modules. Firebase authorization tests use mocks;
the existing real PostgreSQL integration tests also passed.

The clean install also reports pre-existing Node engine warnings for the
backend's transitive `@firebase/app@0.16.4` and `@firebase/app-compat@0.5.20`
on Node 22. These versions were not changed by this fix. Node.js `>=24.12.0`
satisfies those engine declarations; the authentication checks pass on Node 22.
