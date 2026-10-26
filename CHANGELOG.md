# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Images are built from tagged commits outside this repository, so deployments have a readable
version to pin.

## [Unreleased]

### Security

- body-parser 2.4.0 ([GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)): a
  compressed request body with trailing bytes no longer crashes the app. Also proxy-addr 2.0.8
  ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)), which did not apply
  here: `trust proxy` is a hop count, not a subnet.

## [0.0.10] - 2026-10-21

No schema, env or oid4vci-issuer changes; UI text only. The privacy notice and terms are unchanged.

### Added

- "Näin palvelu toimii" box on the studyinfo and wallet guides (U27): what the service does with the
  share link, how long data is kept signed out, and what an account and a passkey are, with a link to
  the privacy notice and terms.

### Changed

- The main page lede is longer and links to Oma Opintopolku and the privacy notice; the Finnish title
  drops "todennettaviksi" (U28).

## [0.0.9] - 2026-10-21

No schema, env or oid4vci-issuer changes; UI only.

### Changed

- "Järjestä: tyyppi" sorts by level, highest first (U26): student status, then doctoral, licentiate,
  master's, bachelor's and other degrees, diplomas, certificates and licences, other or unknown
  types, and courses and assessments last; ties by newest award date, then name. A second click
  reverses the order.

- The top bar keeps its layout whatever the page and the sign-in state (U25). The site links
  (now with "Kokoelmani", always shown; signed out, its page asks to sign in) follow the brand; the
  account sits in a fixed-width slot before the language switcher, which ends the bar: "Kirjaudu
  sisään" (registering is offered in the dialog) or the display name, which opens a menu with the
  full name, "Kokoelmani", "Tili", "Lataa tietosi" and "Kirjaudu ulos". Pages without sign-in keep
  the slot empty.

## [0.0.8] - 2026-10-21

No schema changes. `OID4VCI_CREDENTIAL_VCT` is the Open Badge VCT v2, together with the issuer
configuration's `vct`. The new optional `OID4VCI_STUDENT_STATUS_VCT` and
`OID4VCI_STUDENT_STATUS_CONFIGURATION_ID` turn on the student status wallet type, which needs its
oid4vci-issuer configuration (K5). The wallet credential's expiry (K3), the wallet's own report in
the dialog (W5), the issuer display, UniMe and Toppan need an oid4vci-issuer release after v0.0.4.

### Added

- "Lataa tietosi" / "Download your data" in the account dialog (U24): `GET /auth/account/export` returns a JSON
  file with everything stored about the signed-in user: display name, passkeys (public keys as base64url),
  the Koski import, saved credentials, collections and share links (tokens included). A copy request by
  email can't be verified, since an account has no email or name.

- Wallet credentials carry their grades and extents (W6). Every badge's `result` goes to the wallet
  as it is, as it already did for the student status. Its values have no scale or unit (a bare "9"),
  so the grade and the extent also go as flat text claims, `grade` ("9 (4–10)", "E (I–L)") and
  `extent` ("25 vuosiviikkotuntia", the unit as Koski names it). A completed status without a value
  gets no `grade`. The compose `dc+sd-jwt` configuration labels `grade`, `extent`, `result`,
  `result[].value` and `result[].status` in Finnish and English. Deployed issuer configurations need
  the same labels.

- A student status badge (`ext:StudentStatus`, result `Enrolled`) for each study right Koski shows
  the person enrolled in, naming the institution and the level of studies; see
  docs/student-status-credential.md. It expires at the expected end of the studies (in higher
  education, at the end of the term registered present): `expirationDate` in downloads and
  collections, `exp` in wallets. Signing it or sending it to a wallet fetches Koski again through the
  import's share link, and is refused (409) when the link has lapsed or Koski no longer shows the
  enrolment. An expired saved copy is signed again in its place. The demo person has one. Needs
  koski2openbadge v0.5.0 and an oid4vci-issuer release that turns an offer's `validUntil` into
  `exp` (K3); an older issuer ignores the field, and the wallet credential then doesn't expire.

- The student status goes to wallets as a type of its own, "Opiskelijatodiste" (Student status),
  when `OID4VCI_STUDENT_STATUS_VCT` is set: flat PID-style claims (`enrolment_status`,
  `institution_name`, `institution_code`, `education_level`, `expiry_date`, …) under the
  oid4vci-issuer configuration `OID4VCI_STUDENT_STATUS_CONFIGURATION_ID` (default
  `StudentStatusSdJwtVc`), with its own card and hot pink colours; see
  docs/student-status-wallet-credential.md. Who and where are selectively disclosable; the level, the
  status and the dates are not. The holder's birth date comes from Koski when it is sent and is not
  stored. A wallet credential always reflects Koski at that moment: "Add to wallet" on a saved copy
  confirms the status against Koski like the list does, and is refused when Koski can't confirm it. In the list it
  has a student card icon and comes first. Needs koski2openbadge v0.6.0 (the
  school number) and the issuer configuration (K5).

- The "Add to wallet" dialog shows when each offer is picked up (or has expired), so you notice if
  someone else scanned the code first. The app asks oid4vci-issuer's offer status endpoint through the
  new `POST /wallet-offers/status`.
- The dialog also shows "Saved in the wallet", that the wallet reported an error, or that the badge was
  declined in the wallet, when the wallet sends an OID4VCI notification (section 11) and oid4vci-issuer
  passes it on as `notification.event` in the offer status. Most wallets send none; their offers stay
  "picked up". Needs an oid4vci-issuer release with `notification_endpoint` (W5); an older issuer
  simply never reports one.
- Hovi Wallet is listed on the wallet guide (/guide/wallet).
- UniMe is listed on the wallet guide. It needs an oid4vci-issuer release with the W1 wallet
  tolerances (`/.well-known/did.json`, `did:jwk` proof keys).
- The wallet credential (`dc+sd-jwt`) carries the holder's name also as flat `given_name` (all
  first names from Koski) and `family_name` claims, as the EU PID does, so wallets that don't show
  nested claims show the name. Both are selectively disclosable, like `sub` and `identifier`. A
  credential sent from a collection gets them from the owner's Koski import, when it is the same
  person; without the import it goes without them.

- The compose issuer has an issuer `display` (`OID4VCI_ISSUER_METADATA`: Opintotodiste / Study credential and its logo),
  and every credential configuration a logo and the Open Badge card colours in
  `credential_metadata.display`. The logo URL comes from `OPINTOTODISTE_PUBLIC_URL` (default: the
  development deployment). Needs an oid4vci-issuer release with `OID4VCI_ISSUER_METADATA`.

### Changed

- /policy version 3 (21.10.2026): "Oikeutesi" now opens with "Sinulla on oikeus hallita palveluun
  tallennettuja tietoja." instead of directing requests to info@findy.fi, since each right below has
  its own instructions. The version also covers the student status sentence added in K5 (U23).
- /policy, still version 3: copies of one's data come from the account dialog's "Lataa tietosi"
  (U24) instead of a request, under both access and portability (U23).
- Error messages from the server are in Finnish and translated into English like the rest of the UI
  (`lang: 'fi'` in the response, English in translations.json), including Koski, sign-in, collections
  and rate limit errors. Technical failures (an upstream service's answer, missing configuration) no longer
  reach the user as they are: they get a Finnish message, and the details go to the log. Missing pages,
  expired share links and unknown addresses show a page instead of plain English text. A lapsed share link
  is reported as such. A test fails on UI text or server messages without English (U22).
- The wallet guide lists the wallets in alphabetical order.
- Wallet offers no longer ask for a confirmation code (`tx_code`). The code was shown next to the QR
  code, so it protected little, and some wallets (Toppan) can't enter one. Offers stay single-use and
  short-lived. The wallet guide's last step is now "Accept the badge". Threat analysis T11 is updated.
- Wallet credentials use the Open Badge VCT v2
  (`https://openbadge.digicredential.eu/credentials/v2/OpenBadgeVCT`), which labels the holder's
  name claims. `OID4VCI_CREDENTIAL_VCT` and the oid4vci-issuer configuration's `vct` and
  `vct#integrity` must change together, after v2 is published. Credentials already issued keep v1.

### Fixed

- Loading Koski data again updates a higher-education study right instead of keeping the old copy
  next to the new one. Study rights from Virta have no Koski oid, so the merge matched them by their
  whole content, and any change (a new status, a semester registration) made a second copy. They are
  now matched by their source system id and institution, and copies kept by earlier imports collapse
  into the latest on the next import.
- Basic and upper secondary education subjects no longer end in "undefined": they carry the date of
  their grade year or syllabus, and name it in the description. Any value missing from Koski is left
  out of the text (koski2openbadge v0.3.0).
- Grades are shown on their own scale: school grades 4–10 (a passing 5 was shown as 5 on the 0–5
  scale), suoritettu as completed. The extent names its unit from Koski, e.g. weekly lessons, instead
  of always ECTS credits (koski2openbadge v0.4.0).

## [0.0.7] - 2026-10-19

The image needs no new variables and no schema changes.

### Fixed

- The "try the service with demo data" link now disappears once Koski data or demo data is loaded;
  its `display: flex` had been overriding the `hidden` attribute.

## [0.0.6] - 2026-10-19

The image needs no new variables and no schema changes. Pair it with oid4vci-issuer 0.0.4.

### Added

- "Kokeile palvelua esittelytiedoilla" on the main page loads a synthetic study record (a fictional
  person and institutions, 22 credentials) as if it came from Koski. The button shows only while
  nothing has been loaded; `POST /demo` refuses when Koski data is there, and a real import replaces
  the demo data.
- Main page: the type, issuer and date under each credential filter the list. Active filters show
  above "Valitse kaikki", each removable; they are kept in the URL, so Back undoes one. Selected
  credentials stay selected while a filter hides them.

### Fixed

- The confirmation and name prompts (clear data, delete, remove from a collection, rename, delete a
  link) follow the interface language instead of always being in Finnish (`public/i18n.js`).

## [0.0.5] - 2026-10-18

Deploy with oid4vci-issuer 0.0.4 (selective disclosure). Deploying signs everyone out once (the
session cookie is renamed) and ends the share links made before it; the schema changes are applied
at startup.

### Added

- `/policy`: privacy notice and terms of use in Finnish and English, linked from every page.
- A signed-in user can delete their account from the account dialog (opened from the display name):
  passkeys, collections, saved credentials and share links go with it, and where the browser has the
  WebAuthn Signal API the passkey provider is asked to drop the passkey. The owner can also remove a
  single credential from a collection.
- Share links per recipient: the share dialog lists a credential's or a collection's links, creates
  one named after the recipient and deletes one. A single credential is shared on its own
  (`/i/:token`) instead of through a "Jaetut todisteet" collection. Nothing is recorded about who
  opens a link.
- did:web for the `ldp_vc` issuer: when signing-service's tenant signs as the did:web of the app's
  `ORIGIN` (`TENANT_DIDMETHOD_<T>=web`, `TENANT_DID_URL_<T>`), the app serves
  `/.well-known/did.json`. `/verify` trusts both that DID and the did:key of the same key, which
  earlier credentials name. Without that signing-service config nothing changes.
- PNG logo and favicons from the brand rosette (`public/icons/`, built by `scripts/build-icons.sh`).
- Open Graph and Twitter card metadata on the views, with a 1200x630 image in Finnish and English
  (`?lang=en`).
- `docs/threat-analysis.md`: threats T1–T16 with their probability, impact, prevention and response;
  SECURITY.md links to it.
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

- Signed credentials are stored once per account (new table `saved_credentials`) and collections
  only point at them, so deleting a collection keeps its badges. `share_links` replaces
  `collections.share_token`. Existing collection items are migrated at startup; **share links made
  before this release stop working**.
- One list of credentials (U18). A signed-in user's Koski data is kept in their account (new
  table `koski_imports`), not in the session: the list is there the next day, in whichever
  language the page is in. Later imports are merged in by study right; another person's data
  replaces it. Signing in keeps what was imported before it. Credentials are signed only when one
  is needed (download, share, collection, wallet), once, and that copy is reused
  (`saved_credentials.record_ref`). Records are addressed by a ref derived from the achievement
  instead of a list position (`/credentials/:ref/...`, `refs` in request bodies). There is no
  "save" step. The detail dialog has Lataa, Jaa, Lisää lompakkoon and Poista, on the main page and
  on /my/collections. Poista takes a record off the list until an import brings it back, and
  deletes its signed copy, links included. "Tyhjennä tiedot" is back for signed-in users: it deletes the
  account's Koski data and keeps the credentials already signed (shared, in a collection). /my/collections lists "Jaetut todisteet" (each shared credential or collection
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
