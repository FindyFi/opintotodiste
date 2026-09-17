# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Images are built from tagged commits outside this repository, so deployments have a readable
version to pin.

## [Unreleased]

### Added

- Test suite (`node --test`) covering the Koski import and its URL restrictions, credential
  building, the signing-service and oid4vci-issuer clients, and the running app driven over HTTP:
  passkey registration and login, collection CRUD, and share-link access.
- `REQUIRE_POSTGRES=1`, which turns an unreachable database into a failure instead of silently
  skipping the database-backed tests. CI sets it, because node:test reports a skipped `describe` as
  zero tests rather than as a skip — without it a Postgres service that failed to start would leave
  a green build that had tested nothing.
- GitHub Actions workflow running the suite on Node 20, 22 and 24 against a real PostgreSQL service,
  and building the image, so a `Dockerfile` that cannot build from a clean clone fails the pull
  request.
- `docker-compose.yml` bringing up PostgreSQL, a `signing-service` and an `oid4vci-issuer` alongside
  the app, with no sibling checkouts required.
- `HEALTHCHECK` and a `GET /healthz` endpoint for it and for compose's `service_healthy` condition.
- `package-lock.json`, which `npm ci` in the `Dockerfile` requires, and which pins the exact
  `koski2openbadge` commit built into the image.
- `CONTRIBUTING.md`, `SECURITY.md`, `.nvmrc`, `.editorconfig` and a Dependabot configuration.

### Changed

- `koski2openbadge` is depended on from GitHub rather than by relative path (`file:../`), so a clone
  of this repository alone is enough to install, test and build an image.
- The container runs as the `node` user.
- README documents the companion services, the `koski2openbadge` dependency, and what deploying
  involves.

### Removed

- The build-and-push workflow. Images are built and published outside this repository instead, so
  that registry credentials — and the cloud account identifiers that come with them — are not
  configured from a public one.

## [0.0.1]

- Initial release: Koski import, Open Badge issuance, passkey authentication and collections.
