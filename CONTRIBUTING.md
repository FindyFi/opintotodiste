# Contributing

## Getting set up

```sh
git clone https://github.com/FindyFi/opintotodiste.git
cd opintotodiste
npm install
npm test
```

Node 20 or newer is required (`.nvmrc` pins the version used for development). CI runs the suite on
Node 20, 22 and 24, so please keep the code working across that range.

Most of the suite — the Koski import, credential building, and the signing-service and
oid4vci-issuer clients — needs nothing running beforehand. The tests that drive the app itself need
PostgreSQL, because `index.js` connects to it at import time:

```sh
docker compose up -d db
npm test
```

Without a database those tests skip themselves, which is a convenience for a bare clone and a trap
anywhere else: node:test reports a skipped `describe` as zero tests, not as a skip. Set
`REQUIRE_POSTGRES=1` to turn an unreachable database into a failure instead. CI sets it.

To exercise the whole system rather than the app alone, `docker compose up --build` brings up
PostgreSQL, a `signing-service` and an `oid4vci-issuer` alongside it, with no sibling checkouts
required.

## Making a change

- Add or update tests alongside behaviour changes. The app-level tests boot `index.js` in a child
  process and drive it over HTTP rather than importing handlers, so a change to the env-var wiring
  is covered too.
- Passkey flows are testable: `test/helpers/authenticator.js` is a virtual WebAuthn authenticator
  that answers both ceremonies, and `createClient` in `test/helpers/app.js` keeps cookies so a
  sequence of requests shares one session.
- Koski is served from `test/fixtures/koski-sample.json` through an `--import` hook, enabled with
  `startApp({ koskiFixture })`. Please keep that interception in the harness: `src/koski.js` is
  hard-restricted to opintopolku.fi on purpose, and a configurable base URL would put a hole in the
  app's SSRF boundary for the sake of tests.
- Keep credential *conversion* in [`koski2openbadge`](https://github.com/FindyFi/koski2openbadge) and
  credential *signing* and *delivery* in the two companion services. This repository owns the import,
  the UI and its own persistence; logic that belongs to one of the others is worth moving rather
  than duplicating.
- Match the surrounding style: two-space indentation, single quotes, no semicolons.
- Update `CHANGELOG.md` under `## [Unreleased]`.

## Database schema

`src/schema.sql` is applied at startup and is expected to be idempotent — it runs against an
existing database on every boot, not just a fresh one. A change that cannot be expressed that way
needs a migration story before it lands.

## Keeping the image buildable

The image that gets deployed is built from this repository's `Dockerfile`, outside this repository.
`package-lock.json` is committed and `npm ci` depends on it, so a change that touches dependencies
must commit the updated lockfile. It is also what pins the exact `koski2openbadge` commit that goes
into the image. CI builds the image on every pull request to catch both.

## Releasing

Bump `version` in `package.json`, move the `CHANGELOG.md` entries out of `## [Unreleased]`, and tag
the commit, so deployments have something readable to pin.
