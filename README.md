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

Two credential formats are in use, and each is signed by a different component:

| Use | Format | Signed by |
| --- | --- | --- |
| Download (JSON file, "Get credential") | `ldp_vc`: VCDM 1.1 with a Data Integrity proof | [`digitalcredentials/signing-service`](https://github.com/digitalcredentials/signing-service) |
| Add to wallet (OID4VCI offer, QR code + deep link) | `dc+sd-jwt`: an IETF SD-JWT VC with flat claims and a `vct`, bound to the wallet's key, with an ES256 signature. The `vct` is the shared [Open Badge type](https://openbadge.digicredential.eu/credentials/v1/OpenBadgeVCT) | [`FindyFi/oid4vci-issuer`](https://github.com/FindyFi/oid4vci-issuer), with its own key |

Downloads are never SD-JWTs, and wallets only ever receive SD-JWTs. In the wallet credential (`dc+sd-jwt`) only the holder's name (`identifier`) and oppijanumero (`sub`) are selectively disclosable, so the holder decides whether a presentation includes them; everything else is always disclosed. The issuer's public keys are published at `/.well-known/jwt-vc-issuer` on its origin. The wallet credential is bound to the key the wallet proved (a `cnf` claim), because several wallets refuse unbound credentials. So it can't be restored from a wallet backup onto a new device. Instead, the user sends it to the new wallet again from opintotodiste (from a collection, or by importing the Koski link again), which issues a fresh copy.

A VCDM 2.0 SD-JWT (`vc+sd-jwt`) is still available by leaving `OID4VCI_CREDENTIAL_VCT` unset, but the wallets we tested read `vc+sd-jwt` as the pre-1.0 name of SD-JWT VC and didn't accept it.

[`FindyFi/oid4vci-issuer`](https://github.com/FindyFi/oid4vci-issuer) runs the OID4VCI pre-authorized-code flow with the wallet app. The `ldp_vc` configuration still exists there, and is the only one that goes through signing-service.

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

### Running a local oid4vci-issuer checkout

The compose file builds `oid4vci-issuer` from GitHub `main`, so changes that are not pushed (or live only in a worktree) are not picked up. To build it from a local checkout, create a `docker-compose.override.yml` next to `docker-compose.yml`. Docker Compose reads it automatically, and it is gitignored:

```yaml
services:
  oid4vci-issuer:
    build:
      context: ../oid4vci-issuer
```

The path is relative to this repository. For a worktree, use its absolute path instead, for example `context: /Users/you/github/worktrees/oid4vci-issuer/B2`. Then rebuild with `docker compose up --build oid4vci-issuer`.

### Testing with a real wallet

A wallet app on a phone has to reach `oid4vci-issuer` over public HTTPS: it fetches the offer, the issuer metadata, `/token`, `/nonce` and `/credential` from `CREDENTIAL_ISSUER`. Only `oid4vci-issuer` needs to be public. The app stays on `localhost`, because your browser shows the QR code and the phone only talks to the issuer.

1. Start a tunnel to port 4007. A [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) needs no account:

   ```sh
   brew install cloudflared
   cloudflared tunnel --url http://localhost:4007
   ```

   It prints a URL like `https://random-words.trycloudflare.com`. Keep it running. The URL changes on every start.

2. Start the stack with that URL. `OID4VCI_PUBLIC_URL` sets the issuer's `CREDENTIAL_ISSUER`, and the app's `OID4VCI_CREDENTIAL_ISSUER_ID`, which must match:

   ```sh
   OID4VCI_PUBLIC_URL=https://random-words.trycloudflare.com docker compose up -d --build
   ```

   You can also put `OID4VCI_PUBLIC_URL=…` in `.env`, which Compose reads too. Use the origin only, with no path and no trailing slash. When the tunnel URL changes, run the command again so the issuer restarts with the new URL.

3. Check the tunnel from outside: `curl https://random-words.trycloudflare.com/.well-known/openid-credential-issuer` should return metadata whose `credential_issuer` is that same URL.

4. Open <http://localhost:3000>, import a credential, choose "Add to wallet", and scan the QR code with the wallet.

If you run the app with `npm start` instead of Compose, set `OID4VCI_CREDENTIAL_ISSUER_ID` to the tunnel URL yourself (it's used only for the VCDM 2.0 payload) and keep `OID4VCI_ISSUER_URL=http://localhost:4007`; the app creates offers over the private URL.

[ngrok](https://ngrok.com/) works too (`ngrok http 4007`) and gives a free account one fixed domain, so the URL survives restarts. Its free plan shows a warning page to browser user agents, which can break wallets that fetch with a browser-like client.

### Issuer and credential display

The compose file gives the issuer a `display` (`OID4VCI_ISSUER_METADATA`: the name "Opintotodiste" and the app's `icons/logo-512.png`, in Finnish and English), which wallets show as who issued the credential. Every credential configuration also has a `credential_metadata.display` with the same logo and the colours of the Open Badge card template (`#1f3a5f` background, white text). The logo URL points at the development deployment, because wallets need an https URL they can reach. To change the issuer display, make the JSON with `node "$OID4VCI_ISSUER_REPO/scripts/issuer-metadata.js" --json` (it asks for the languages first) and replace the value in `docker-compose.yml`. Federation's `display_name` and `logo_uri` default to it.

### OpenID Federation

`oid4vci-issuer` can publish an OpenID Federation Entity Configuration at `/.well-known/openid-federation` (for DIIP v5 and the OpenID Federation wallet architectures), and then adds a `fed` claim to the credentials it issues. It is off until `FEDERATION_ENTITY_METADATA` is set. Compose passes `FEDERATION_ENTITY_METADATA`, `FEDERATION_AUTHORITY_HINTS` and `FEDERATION_TRUST_MARKS` from your environment or `.env` to the issuer, so you only have to produce the values. You don't have to write the JSON: the script in a checkout of [oid4vci-issuer](https://github.com/FindyFi/oid4vci-issuer) asks for them and writes the lines into the `.env` in this repository's main checkout (Compose reads it from there; a worktree has no `.env`). It needs no `npm install`. Run it from this repository's root:

```sh
OID4VCI_ISSUER_REPO="<path to your oid4vci-issuer checkout>"
node "$OID4VCI_ISSUER_REPO/scripts/federation-metadata.js" --write .env
docker compose up -d --build oid4vci-issuer
curl -s http://localhost:4007/.well-known/openid-federation | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

(`OID4VCI_ISSUER_REPO` is only a shell variable for these commands; nothing reads it.) A 404 from the `curl` means the running issuer image doesn't have federation support yet, because Compose built it from GitHub `main`: build it from your checkout instead, as described above. A `FEDERATION_*` variable exported in your shell overrides `.env`.

The script prints the lines instead of writing them if you leave out `--write`; `--help` lists the options for non-interactive use. Compose builds the issuer from GitHub `main`, so until the federation support is pushed there, build it from your checkout (see "Running a local oid4vci-issuer checkout"). The app itself needs nothing: the Entity Identifier is the issuer's `CREDENTIAL_ISSUER`, which is `OID4VCI_PUBLIC_URL` when you set it (use a public HTTPS URL for anything a verifier or trust anchor will fetch). For the full list of `FEDERATION_*` variables and what the document contains, see the oid4vci-issuer README. Deployed environments set the same variables in the issuer's task definition (FindyFi/aws-environment).

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

All configuration is via environment variables — see [`.env.example`](.env.example) for the full list with explanations. Each variable carries an `# @env required|optional [secret]` tag
(machine-readable, see `src/env-manifest.js`): with `NODE_ENV=production` the app refuses to start and names every
missing `required` variable; `secret` ones belong in a secret store, not plain deployment config. In short:

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the app listens on |
| `SESSION_SECRET` | Express session signing secret |
| `DATABASE_URL` | Postgres connection string |
| `RP_ID`, `RP_NAME`, `ORIGIN` | WebAuthn relying-party config for passkey login |
| `ISSUER_ID`, `ISSUER_NAME` | Issuer of the credentials; signing-service replaces `ISSUER_ID` with its own DID (see [the `ldp_vc` issuer as a did:web](#the-ldp_vc-issuer-as-a-didweb)) |
| `SIGNING_SERVICE_URL`, `SIGNING_SERVICE_INSTANCE_ID`, `SIGNING_SERVICE_SUITE` | Where/how to reach signing-service |
| `OID4VCI_ISSUER_URL`, `OID4VCI_ISSUER_INSTANCE`, `OID4VCI_ISSUER_TOKEN` | Where/how to reach oid4vci-issuer |
| `OID4VCI_CREDENTIAL_CONFIGURATION_ID` | Credential configuration requested for wallet offers (default `OpenBadgeCredentialSdJwt`; Compose uses `OpenBadgeCredentialSdJwtVc`) |
| `OID4VCI_CREDENTIAL_VCT` | The `vct` of a `dc+sd-jwt` configuration. When set, wallet offers carry flat SD-JWT VC claims; when unset, a VCDM 2.0 VC |
| `OID4VCI_CREDENTIAL_ISSUER_ID` | Only without `OID4VCI_CREDENTIAL_VCT`: issuer URL written as `issuer.id` into VCDM 2.0 wallet credentials. Must equal the oid4vci-issuer's SD-JWT issuer URL (origin only) |

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

### The `ldp_vc` issuer as a did:web

Downloaded and collected credentials (`ldp_vc`) are signed by signing-service,
which names its tenant's DID as the issuer. By default that is a `did:key`.
Deployed environments sign as the site's own `did:web` instead (for example
`did:web:opinto.todiste.fi`) by giving the tenant two more variables next to its
seed:

```sh
TENANT_SEED_OPINTOTODISTE=<unchanged>
TENANT_DIDMETHOD_OPINTOTODISTE=web
TENANT_DID_URL_OPINTOTODISTE=https://opinto.todiste.fi   # = the app's ORIGIN
```

The key comes from the seed either way, so keep the seed: the did:web then
has the same key as the old `did:key`. The app needs no new configuration.
It learns the DID and key from a probe signature (as `/verify` already did),
and serves `/.well-known/did.json` when the DID is the did:web of its
`ORIGIN`; otherwise that path is a 404. `/verify` trusts both the did:web and
the `did:key` of the same key, so credentials issued before the switch still
verify. Deploy the app before switching the tenant, so that the first
did:web credentials can be resolved; the app rechecks the DID every ten
minutes, so it may take that long to notice the switch. Local development stays on `did:key`,
because did:web resolves over https only.

The trade-off: a `did:key` is self-contained, but a did:web credential
verifies only while this domain serves `did.json`. In return the issuer is
readable, the key can be rotated, and registries and the OpenID Federation can
name it. A rotation needs a new seed; `did.json` then lists only the new key,
so earlier credentials stop verifying. That is what a key compromise needs. A
planned rotation that keeps old credentials valid would need the old keys
listed too, which isn't built yet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome at
[FindyFi/opintotodiste](https://github.com/FindyFi/opintotodiste/issues).
Security reports go through the process in [SECURITY.md](SECURITY.md) rather
than the issue tracker.

## License

[Apache-2.0](LICENSE) © FindyFi
