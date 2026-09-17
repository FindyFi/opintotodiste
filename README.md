# opintotodiste

Issues Open Badges 3.0 credentials from Koski study records, with passkey-authenticated collections and sharing.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Features](#features)
- [Configuration](#configuration)
- [Tests](#tests)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Background

[Koski](https://opintopolku.fi/koski/) is Finland's national registry of study records. opintotodiste lets a person paste a link to their own Koski data, converts the eligible records into draft [Open Badges 3.0](https://www.imsglobal.org/spec/ob/v3p0) credentials via [`koski2openbadge`](https://github.com/FindyFi/koski2openbadge), and from there signs, delivers, or archives them.

Signing and wallet delivery are delegated to two companion services rather than implemented here:

- [`digitalcredentials/signing-service`](https://github.com/digitalcredentials/signing-service) turns a draft badge into a signed Verifiable Credential.
- [`FindyFi/oid4vci-issuer`](https://github.com/FindyFi/oid4vci-issuer) hands a signed credential to a wallet app over OID4VCI (pre-authorized-code flow, QR code + deep link).

opintotodiste itself owns the Koski import, the signing/delivery UI, and its own persistence layer: PostgreSQL for user accounts, [WebAuthn passkeys](https://simplewebauthn.dev/), and named, shareable collections of credentials.

## Install

Requires Node.js 20+, PostgreSQL, and reachable `signing-service`/`oid4vci-issuer` instances. The included `docker-compose.yml` provides all of these, and needs no sibling checkouts — a fresh clone is enough:

```sh
git clone https://github.com/FindyFi/opintotodiste.git
cd opintotodiste
docker compose up --build
```

To install and run without Docker instead:

```sh
npm install
cp .env.example .env   # then edit as needed
```

### The `koski2openbadge` dependency

`koski2openbadge` — the converter that turns Koski study records into Open Badges achievement data — is not published to npm. `package.json` depends on it straight from GitHub, and `package-lock.json` pins the exact commit that gets installed.

A few consequences worth knowing before deploying:

- **No git binary or SSH key is needed**, to install or to build the image. The `resolved` URL in `package-lock.json` reads `git+ssh://`, which looks alarming in a Dockerfile, but npm recognises GitHub specs and fetches them over HTTPS through the tarball endpoint. It does mean [the repository has to stay publicly readable](https://github.com/FindyFi/koski2openbadge) — if it is ever made private, every build breaks.
- **The lockfile is the pin.** `npm ci` installs exactly the commit recorded there, so builds are reproducible; `npm install` without a lockfile would silently take whatever the default branch points at. Run `npm update koski2openbadge` to move to a newer commit deliberately, and commit the result.
- **Prefer a tagged ref** in `package.json` (`github:FindyFi/koski2openbadge#v0.1.0`) over the bare `github:FindyFi/koski2openbadge`, so that what is being depended on is readable without decoding a commit hash.

It is a plain library with no runtime dependencies and no service of its own, so there is nothing to deploy for it separately — it ships inside this app's image.

## Usage

With Docker, the app is available at <http://localhost:3000> once `docker compose up` is running.

Without Docker (after `npm install`, with `.env` configured and Postgres/signing-service/oid4vci-issuer reachable):

```sh
npm start
```

## Features

- **Koski import** — fetches a person's study records from the Koski API and converts them into draft Open Badges.
- **Signing & wallet delivery** — signs a draft badge and/or pushes it to a wallet app, via the two companion services described in [Background](#background).
- **Collections** — signed-in users can save selected credentials into named collections and share them via a public, unauthenticated link.
- **Passkey authentication** — account registration and sign-in use WebAuthn passkeys, not passwords.
- **Bilingual UI** — Finnish/English, via [`translate-element`](https://github.com/samuelmr/translate-element).

## Configuration

All configuration is via environment variables — see [`.env.example`](.env.example) for the full list with explanations. In short:

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the app listens on |
| `SESSION_SECRET` | Express session signing secret |
| `DATABASE_URL` | Postgres connection string |
| `RP_ID`, `RP_NAME`, `ORIGIN` | WebAuthn relying-party config for passkey login |
| `ISSUER_ID`, `ISSUER_NAME` | Identity used as the issuer on issued credentials |
| `SIGNING_SERVICE_URL`, `SIGNING_SERVICE_INSTANCE_ID`, `SIGNING_SERVICE_SUITE` | Where/how to reach signing-service |
| `OID4VCI_ISSUER_URL`, `OID4VCI_ISSUER_INSTANCE`, `OID4VCI_ISSUER_TOKEN` | Where/how to reach oid4vci-issuer |

## Tests

```sh
npm test
```

Unit tests for the Koski import, credential building and the two service
clients run with no external dependencies. The tests that exercise the
running app need PostgreSQL, because `index.js` connects to it at import
time, and report themselves as skipped without it:

```sh
docker compose up -d db
npm test
```

Skipping is a convenience for a bare clone and a trap anywhere that is meant
to be testing something: node:test reports a skipped `describe` as zero tests
rather than as a skip, so an unreachable database would leave a green run
that exercised nothing. Set `REQUIRE_POSTGRES=1` to turn that into a failure:

```sh
REQUIRE_POSTGRES=1 npm test
```

CI sets it, and runs the suite on Node 20, 22 and 24 against a real
PostgreSQL service. It also builds the image on every pull request, since
that is what gets deployed.

## Deployment

This repository builds a container image from its [`Dockerfile`](Dockerfile)
and nothing more: it does not publish images to any registry, and it carries
no environment-specific or infrastructure configuration. Everything the app
needs at runtime comes from the environment variables listed under
[Configuration](#configuration).

Publishing is separate on purpose: the image is built from this
repository's `Dockerfile` and pushed to a registry elsewhere, and the
credentials for that live with it rather than here. Keeping registry access
out of a public repository is the point, so please do not add a push workflow
back into this one. Deploying a newly built tag — updating the
image reference for an environment and applying it — is a further step again,
and neither this repository nor the build does it.

Two things follow for anyone changing this repository:

- **The `Dockerfile` is the release artifact.** If it cannot build from a
  clean clone, no image can be published. `package-lock.json` is
  committed because `npm ci` requires it — and because it is what pins the
  exact `koski2openbadge` commit that goes into the image (see
  [Install](#install)).
- **Pin a tag, not a branch.** Both this repository and
  [`oid4vci-issuer`](https://github.com/FindyFi/oid4vci-issuer) should be
  consumed at a released tag, so a merge cannot silently change what the next
  build produces.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome at
[FindyFi/opintotodiste](https://github.com/FindyFi/opintotodiste/issues).
Security reports go through the process in [SECURITY.md](SECURITY.md) rather
than the issue tracker.

## License

[Apache-2.0](LICENSE) © FindyFi
