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
- A new environment variable goes into `.env.example` with an `# @env required|optional [secret]` tag
  directly above it; `test/env-manifest.test.js` fails if a variable the code reads is untagged or missing
  from `APP_ENV_KEYS` in `test/helpers/app.js`. Deployment config (FindyFi/aws-environment, the image
  builder's integration compose) must follow.
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

## Spec and format changes

Open Badges 3.0, SD-JWT, OpenID for Verifiable Credential Issuance and the other formats and protocols
this repository relies on are versioned, and new versions keep arriving: 1.1, 2.0 and so on, not only
the step from draft to final. When a change touches the shape of a credential, the OID4VCI interaction
with `oid4vci-issuer`, or how a Koski record is interpreted, cite the version and section it follows in
the commit message or pull request description. Several details have changed between versions, and the
citation keeps the reasoning in review.

## Working on several changes at once

Some habits that help when several changes are in flight:

- **One change, one branch, one worktree**, as a hint rather than a rule. Start from an up-to-date
  `main`: `git fetch && git worktree add <worktree-root>/opintotodiste/<dev>-<topic> -b <dev>/<topic> main`.
  Keep worktrees outside the repository, so test globs and Docker build contexts never pick up another
  one. Run `npm install` in each.
- **Put your developer id in branch names** (`<dev>/<topic>`, any short stable id such as your
  initials). Branches pushed by different developers then never collide, even when two people number
  their tasks the same way.
- **Check before you start.** `git fetch`, then look at `git log origin/main -20`, the open branches
  and pull requests, and the issues for the area you are about to touch. Someone else may have changed
  it, or be changing it now. Notes and plans can go stale: trust the repository over them.
- **Shared agreements go in shared places.** Anything others depend on belongs in an issue, a pull
  request or a conversation with the team, not only in your own notes: a change to an interface between
  this repository and `oid4vci-issuer`, to the env manifest, to a release, or anything you want nobody
  to do (for example, which history must not be pushed). Open an issue before changing a shared contract.
- **One database per worktree** when tests run in parallel. They share one PostgreSQL otherwise:
  `docker compose exec db createdb -U opintotodiste opintotodiste_<name>`, then
  `TEST_DATABASE_URL=postgres://opintotodiste:opintotodiste@localhost:5432/opintotodiste_<name> REQUIRE_POSTGRES=1 npm test`.
- **Before integrating,** rebase on `main`, run the full suite, and integrate the way the team agreed
  (a pull request; CI runs on those). Don't push to a shared branch unless that was agreed, and never
  push a branch built on history that was rewritten on the remote.

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
