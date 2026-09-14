# opintotodiste

Issues Open Badges 3.0 credentials from Koski study records, with passkey-authenticated collections and sharing.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Features](#features)
- [Configuration](#configuration)
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

Requires Node.js 20+, PostgreSQL, and reachable `signing-service`/`oid4vci-issuer` instances. The included `docker-compose.yml` provides all of these:

```sh
docker compose up --build
```

To install and run without Docker instead:

```sh
npm install
cp .env.example .env   # then edit as needed
```

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

## Deployment

Terraform configuration for deploying opintotodiste, oid4vci-issuer, and signing-service to AWS (dev/staging/prod) lives in the separate [`FindyFi/aws-environment`](https://github.com/FindyFi/aws-environment) repository, under `tf/applications/opintotodiste/` and `tf/applications/oid4vci-issuer/`.

## Contributing

Issues and pull requests are welcome at [FindyFi/opintotodiste](https://github.com/FindyFi/opintotodiste/issues).

## License

[Apache-2.0](LICENSE) © FindyFi
