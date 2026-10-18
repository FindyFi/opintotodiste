# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Images are built from tagged commits outside this repository, so deployments have a readable
version to pin.

## [Unreleased]

### Added

- Credentials name their holder: `credentialSubject.identifier` carries the name from Koski as a
  plain-text Open Badges `IdentityObject` (`identityType: name`), in downloads, collections and wallet
  offers (the SD-JWT VC gets it as an `identifier` claim). The name is the
  call name or all first names, then the surname. The credential detail dialog and the shared item
  page show it as "Haltija" / "Holder"; link previews don't. Needs koski2openbadge 0.2.0, which also
  accepts a Koski export without an oid.
- Accounts whose passkeys have not been used for 6 months are deleted, with their collections,
  checked at startup and daily.
- In the wallet credential (SD-JWT VC) the holder's name (`identifier`) and oppijanumero (`sub`) are
  selectively disclosable: the app sends them as `disclosable` in the offer, and the wallet asks the
  holder before presenting them. Needs an oid4vci-issuer with `disclosable` support; an older one
  ignores the field and keeps them always disclosed.

### Changed

- One list of credentials (U18). A signed-in user's Koski data is kept in their account (new
  table `koski_imports`), not in the session: the list is there the next day, in whichever
  language the page is in. Later imports are merged in by study right; another person's data
  replaces it. Signing in keeps what was imported before it. Credentials are signed only when one
  is needed (download, share, collection, wallet), once, and that copy is reused
  (`saved_credentials.record_ref`). Records are addressed by a ref derived from the achievement
  instead of a list position (`/credentials/:ref/...`, `refs` in request bodies). There is no
  "save" step. The detail dialog has Lataa, Jaa, Lisää lompakkoon and Poista, on the main page and
  on /my/collections. Poista takes a record off the list until an import brings it back, and
  deletes its signed copy, links included. /my/collections lists "Jaetut todisteet" (each shared credential or collection
  with its recipients) instead of "Tallennetut todisteet". Anonymous use is unchanged, apart from
  Lataa in the dialog. /policy says when a badge is stored and where to delete one.

### Fixed

- Creating a share link and naming a new collection (in the "Lisää kokoelmaan" dialog and on
  /my/collections) works again. translate-element cloned the inputs to translate their
  placeholders, and the hidden, empty copy blocked the form or was the one the page read. The
  inputs now have labels and no `lang` of their own; a test keeps it that way.

### Security

- Application hardening (H3, see docs/threat-analysis.md). Koski fetches refuse redirects, time
  out after 15 s and stop at 5 MB. A new session id on registration and sign-in; over HTTPS the
  cookie is `__Host-sid`, `Secure`, `SameSite=Lax` (**deploying this signs everyone out once**).
  CSP `frame-ancestors`/`object-src`/`base-uri`/`form-action`, `X-Frame-Options`, `nosniff` and
  `Referrer-Policy: no-referrer` on every response. Imported Koski data leaves the session after
  an hour idle, and "Tyhjennä tiedot" clears it at once. Per-IP rate limits on imports, signing,
  wallet offers and passkey challenges. A production start refuses placeholder secrets
  (`change-me`, `dev-…`). Upstream error bodies are no longer logged or shown. `/employer`, the
  shared pages and `/verify` say that a badge does not prove the presenter is its holder.

## [0.0.4] - 2026-10-18

### Added

- Guide pages `/guide/studyinfo`, `/guide/wallet` and `/guide/sharing` (the Koski share link,
  the tested wallets with their store links, and sharing), linked from the main page's steps.
- Sharing: "Jaa" opens a share dialog with the link, a copy button and a fi/en message for the
  recipient. One selected credential goes into the user's "Jaetut todisteet" collection; several
  make a new collection. `GET /c/:token/items/:itemId` is a public page for one item, with download
  and verify links; regenerating the share token revokes it.
- LinkedIn in the share dialog: "Lisää LinkedIn-profiiliin" per credential (LinkedIn's Add to
  Profile link) and "Jaa LinkedInissä" per collection.
- `/employer`: what the badges are and how an employer checks one. The header gets a site nav.
- `/verify`: in-browser verification of a downloaded `ldp_vc` (or a VP holding one) with
  `@digitalcredentials/veri-good` 0.0.0-beta.7, from a file, pasted JSON, a link or `?url=` (same
  origin only). It trusts only this deployment's own signing DID, which the app learns by having
  signing-service sign a minimal credential (cached for ten minutes).
- The credential detail dialog also opens from the collections page and the shared collection page.

### Changed

- Main page redesigned: white page with a light-cyan hero holding the Koski form and the three
  steps, a full-width results list, and a selection bar fixed to the bottom of the viewport that
  appears while something is selected. The right-hand column is gone.
- The collections page and the share dialog follow the same design. Pages a recipient opens from a
  share link, and `/verify`, get their own look: a navy band over white sheets on a peach page.
- The chosen language is remembered across pages (translate-element 4.0.0; `?lang=` still wins).
- "Kulkuavain" is now "pääsyavain" throughout the UI.
- Views live in `src/views/` (one module per page) and styles in `public/styles/` (a base file plus
  sections a page lists in its head), so page work no longer collides in shared files.
- Credentials (`ldp_vc` and VCDM 2.0 wallet offers) now carry a top-level `name` from the
  achievement, for display in wallets and verifiers.
- The local Compose stack pins the frozen Open Badge VCT v1 hash (`vct#integrity`), as the deployed
  environments do.

The image needs no new variables and no schema changes. Pair it with oid4vci-issuer 0.0.3.

## [0.0.3] - 2026-10-17

### Added

- The local Compose stack passes `FEDERATION_ENTITY_METADATA`, `FEDERATION_AUTHORITY_HINTS` and
  `FEDERATION_TRUST_MARKS` from `.env` to oid4vci-issuer, and the README section "OpenID Federation"
  explains how to make them with oid4vci-issuer's `federation:setup` script.
- `CONTRIBUTING.md` (branches, worktrees, tests, citing specifications) and `PLAN.example.md`.

### Changed

- `CLAUDE.md` now covers only how Claude works here; shared practices moved to `CONTRIBUTING.md`.

The app image is unchanged apart from the version, and needs no new variables. Pair it with
oid4vci-issuer 0.0.3.

## [0.0.2] - 2026-10-17

### Added

- "Add to wallet" delivers an IETF SD-JWT VC (`dc+sd-jwt`) with flat Open Badge claims and the shared
  `vct` `https://openbadge.digicredential.eu/credentials/v1/OpenBadgeVCT`, issued and signed by
  oid4vci-issuer and bound to the wallet's key. Accepted by Heidi, Procivis One, Talao and Paradym.
  Downloads and collections stay `ldp_vc`.
- Collection owners can send any item of a collection to a wallet, and each collection card lists
  its items.
- `.env.example` tags every variable `# @env required|optional [secret]`; with `NODE_ENV=production` the
  app now exits at startup naming all missing required variables (no more dev session secret fallback).
- README section "Testing with a real wallet", using a tunnel to the local stack.

### Changed

- **Deployments must set** `OID4VCI_CREDENTIAL_CONFIGURATION_ID` and `OID4VCI_CREDENTIAL_VCT`, and
  every other variable `.env.example` tags `required`: the image refuses to start without them. The
  configuration must exist in oid4vci-issuer 0.0.2 or later, with the same `vct`.
- A redesigned UI: styles in `public/styles.css` with light and dark color schemes, a self-hosted
  Archivo font, card lists for credentials and collections, the language switcher in the header,
  and dates in the UI language's format.

## [0.0.1]

- Initial release: Koski import, Open Badge issuance, passkey authentication and collections.

### Added

- Test suite (`node --test`) covering the Koski import and its URL restrictions, credential
  building, the signing-service and oid4vci-issuer clients, and the running app driven over HTTP.
- End-to-end coverage of the primary journey — Koski link to draft badges, signing, download, wallet
  offer, language switching, and saving into a shared collection — against the real entrypoint, with
  the two companion services stubbed.
- End-to-end coverage of the authenticated half: passkey registration and sign-in, collection CRUD,
  ownership isolation between accounts, and share-token rotation. These ran against nothing before:
  the only authenticated assertions were that the guards reject an anonymous caller, which passes
  equally well when the routes behind them are broken.
- A virtual WebAuthn authenticator (`test/helpers/authenticator.js`) that answers the registration
  and login ceremonies, so passkey flows are testable without a browser or any new dependency.
- A Koski fixture served through an `--import` hook (`test/helpers/koski-stub.mjs`). The
  interception lives in the test harness rather than in `src/koski.js`, so the opintopolku.fi
  restriction — the app's SSRF boundary — keeps no test-only escape hatch.
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

### Fixed

- The credential detail dialog reads the achievement's result descriptions under both the
  `resultDescription` name Open Badges 3.0 defines and the `resultDescriptions` spelling
  `koski2openbadge` emitted before 0.1.0. Reading only the old name would have left every grade and
  credit row with a blank label, silently, once the dependency was updated.
- A failing signing or credential-offer call is now logged. Both paths returned 502 with the reason
  in the response body and wrote nothing to stdout, so an operator checking the container logs after
  a user reported a failure found only the startup line.

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
