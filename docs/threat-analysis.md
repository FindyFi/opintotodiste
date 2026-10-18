# Threat analysis

What can go wrong in Opintotodiste, how likely it is and how bad it would be, what we do so that it
doesn't happen, and what we do if it happens anyway.

- Written: 2026-10-18, against `main` at 90ea5b7 (release 0.0.4 plus U12, U14, U15) and the
  development environment in FindyFi/aws-environment. Updated after H3 (application hardening).
- Review it when the trust model changes: a new way to import data, a new credential format,
  revocation, identity binding, or a new deployment environment. Otherwise once a year.
- Reporting a vulnerability: see [SECURITY.md](../SECURITY.md).

## The system in one paragraph

A person pastes a Koski share link (*suoritusjako*, `https://opintopolku.fi/koski/opinnot/<id>`).
The app fetches the study records from Koski's API, keeps them in the server-side session and converts
them into Open Badges 3.0. The person can then download a badge as a Data Integrity–signed JSON file
(`ldp_vc`, signed by signing-service with a `did:key`), send it to a wallet over OID4VCI (an SD-JWT VC
signed by oid4vci-issuer with its own key and bound to the wallet's key), or, after signing in with a
passkey, save signed badges, group them into collections and share a collection or one badge with
bearer links, one per recipient (`/c/<token>`, `/i/<token>`). Employers open the link, and can check a badge on `/verify`, which trusts only our
signing DID.

### Trust boundaries

| Boundary | What crosses it | What we rely on |
| --- | --- | --- |
| Browser → app | Koski link, language, list indices, collection names, passkey responses | Server-side checks; the client never sends credential content |
| App → Koski | `GET https://opintopolku.fi/koski/api/opinnot/<id>` | Exact host match, HTTPS (TLS certificate check), Koski being honest |
| App → signing-service | An unsigned credential | Private network only; **signing-service has no authentication** |
| App → oid4vci-issuer | An unsigned credential + coordinator token | `OID4VCI_ISSUER_TOKEN` = issuer's `COORDINATOR_TOKEN` |
| Wallet → oid4vci-issuer | Pre-authorized code, tx code, proof of key | Single-use code, 10-minute offer lifetime |
| Anyone → `/c/<token>`, `/i/<token>` | Nothing but the token | 24 random bytes per link; whoever has the link sees the collection or the badge |

### What the credentials say, and what they don't

Our signature says: *"Opintotodiste fetched this study record from Koski through a share link on this
date."* It does **not** say who imported it. The credential identifies the learner only by the Koski
oppijanumero (`credentialSubject.id = urn:oid:…`, SD-JWT `sub`), which an employer cannot check, and
by the name from Koski (`credentialSubject.identifier`, an Open Badges `IdentityObject` with
`identityType: name`, in plain text), which an employer can compare with an ID. Nothing ties the
importer to that person. This is the root of the most important threat below (T1).

## Rating scale

- **Probability**: *Low* (needs an unusual skill, access or coincidence), *Medium* (plausible for a
  motivated person with ordinary means), *High* (expected to happen once the service has users).
- **Impact**: *Low* (inconvenience), *Medium* (one person's privacy or one employer misled),
  *High* (many people affected, or the credentials can no longer be trusted), *Critical* (forgeries
  that nobody can tell from genuine credentials).
- **Risk**: the combination, used to order the work.
- **Status**: *Mitigated* (residual risk accepted), *Partly* (some controls in place, gaps listed),
  *Open* (no effective control yet).

## Summary

| Id | Threat | Probability | Impact | Risk | Status | Task |
| --- | --- | --- | --- | --- | --- | --- |
| [T1](#t1-someone-claims-another-persons-study-records) | Someone claims another person's study records (Bob uses Alice's Koski link) | High | High | **High** | Partly | H5, H6 |
| [T2](#t2-fake-or-tampered-koski-data) | Fake or tampered Koski data (fake Koski service, look-alike host, redirect) | Low | Critical | Medium | Mitigated | — |
| [T3](#t3-forged-or-edited-credentials) | Forged or edited credentials shown to an employer | Medium | Medium | Medium | Partly | H5 |
| [T4](#t4-the-signing-service-signs-for-someone-else) | The signing service or the issuer signs for someone else | Low–Medium | Critical | **High** | Open | H4 |
| [T5](#t5-a-signing-key-leaks) | A signing key leaks | Low | Critical | Medium | Partly | H5, G7 |
| [T6](#t6-look-alike-site-or-fake-verification-page) | Look-alike Opintotodiste site or fake verification page | Medium | Medium | Medium | Partly | — |
| [T7](#t7-a-share-link-reaches-the-wrong-people) | A share link reaches the wrong people | Medium | Medium | Medium | Partly | — |
| [T8](#t8-the-next-person-at-a-shared-computer) | The next person at a shared computer sees or takes the previous person's data | Medium | Medium | Medium | Mitigated | — |
| [T9](#t9-account-or-session-takeover) | Account or session takeover (fixation, XSS, CSRF, clickjacking) | Low | High | Medium | Partly | — |
| [T10](#t10-losing-access-to-an-account) | Losing access to an account (lost passkey) | Medium | Low | Low | Accepted | — |
| [T11](#t11-a-wallet-offer-is-picked-up-by-someone-else) | A wallet offer is picked up by someone else | Low | Medium | Low | Partly | — |
| [T12](#t12-abuse-and-denial-of-service) | Abuse and denial of service (mass sign-ups, offers, Koski proxying) | Medium | Medium | Medium | Partly | aws-environment |
| [T13](#t13-a-credential-outlives-the-record-it-came-from) | A credential outlives the record it came from | Medium | Medium | Medium | Open | H5 (S1) |
| [T14](#t14-personal-data-leaks-from-storage-or-logs) | Personal data leaks from the database, backups or logs | Low | High | Medium | Partly | — |
| [T15](#t15-a-dependency-is-compromised) | A dependency or container image is compromised | Low | High | Medium | Partly | — |
| [T16](#t16-a-deployment-runs-with-development-defaults) | A deployment runs with development defaults | Low | Critical | Medium | Partly | — |

---

## T1: Someone claims another person's study records

**What may happen.** Alice creates a Koski share link and gives it to a recruiter, posts it in a job
application portal, or sends it to a friend. Bob gets hold of it (they are the recruiter, they see it on
a shared screen, it is forwarded, it is posted publicly). Bob pastes Alice's link into Opintotodiste,
signs in with **their own** passkey, puts Alice's degree into **their** collection and sends it to **their**
wallet. They then show it to an employer as their own.

Nothing in the app stops this today. Koski share links are bearer links by design, and our import
trusts whoever holds one. The employer sees a genuine, correctly signed Opintotodiste badge. Since G8
it carries Alice's name, so an employer who compares it with Bob's ID will notice; one who doesn't
check will not. The wallet credential is even holder-bound
(`cnf`), but bound to Bob's wallet key: holder binding proves that the presenter is the wallet the
credential was issued to, not that they are the learner.

The same works without stealing anything: Bob can import any share link they are given legitimately, for
example as a recruiter who received dozens.

Before G8 our credential was *weaker* than the Koski link it came from: an employer who opened Alice's
Koski link saw Alice's name, while Bob's badge showed none. Now both show the name.

**Probability: High.** Koski share links are meant to be passed around; no skill is needed.
**Impact: High.** An employer is misled about a qualification; Alice's study records and oppijanumero
end up in Bob's hands and in Bob's shares; once known, it undermines trust in every Opintotodiste badge.

**What we do so that it doesn't happen.**

- In place: nothing effective. The import accepts only real Koski data (T2), which limits Bob to
  records that exist, but not to their own.
- In place (G8): the holder's name from Koski is in every credential (ldp_vc, the VCDM 2.0 offer and
  the SD-JWT VC) and on the shared pages, so an employer can compare it with an ID document. Cheap, but
  it shifts the check to the employer. In the SD-JWT VC the name and the oppijanumero are selectively
  disclosable (G9): a wallet presents them only if the holder agrees, so a verifier that needs the
  name must ask for it.
- Decided (H2): no limit of one account per oppijanumero, since a person may legitimately have several
  accounts (passkeys on different devices), and so no import log either.
- Planned (H6, later, costly): get the data through an authenticated channel instead of a bearer link:
  the learner signs in through Koski's OAuth2 consent flow (Opintopolku / Suomi.fi), and we import only
  that person's own records.
- In place (H3): `/employer`, the shared pages and `/verify` say what a badge proves and what it
  doesn't ("the records come from Koski and have not been changed; Opintotodiste does not check that
  the person presenting it is the holder, so compare the name with an ID"), until H6 exists.

**What we do if it happens anyway.**

1. Alice (or an employer) reports it to info@findy.fi.
2. Alice revokes the share link in Oma Opintopolku, so it cannot be imported again.
3. We find Bob's collections that contain Alice's oppijanumero (`collection_items.credential`), delete
   them (which kills their share links) and, if the terms of use are breached, their account.
4. We revoke the credentials Bob obtained (needs revocation, S1/H5; today downloaded files and
   wallet credentials stay valid forever, so this step is not possible yet).
5. Treat Alice's data in Bob's hands as a personal data breach: assess, and notify the Data Protection
   Ombudsman within 72 hours and Alice if required.

## T2: Fake or tampered Koski data

**What may happen.** Bob sets up a fake Koski service that returns a degree they never earned, and
pastes a link to it so that Opintotodiste signs their invented records. Variants: a look-alike host
(`opintopolku.fi.example.com`, `opintopoIku.fi`), an `http://` link, a link whose path escapes the
study-record API, a redirect from opintopolku.fi to their server, DNS spoofing of opintopolku.fi on our
network, or simply sending us crafted JSON. The same URL handling is the app's SSRF boundary: a link
to `169.254.169.254` or an internal address must not be fetched either.

**Probability: Low** (the obvious routes are closed). **Impact: Critical**: a correctly signed
credential for an invented qualification, indistinguishable from a genuine one.

**What we do so that it doesn't happen.**

- In place:
  - `src/koski.js` parses the link with `URL` and requires the hostname to equal `opintopolku.fi`
    exactly (not a suffix or substring match), and the path to match
    `/koski/(api/)opinnot/<[a-zA-Z0-9-]+>`. The fetch URL is rebuilt from the id alone, always as
    `https://opintopolku.fi/koski/api/opinnot/<id>`; nothing else from the input reaches the request.
  - HTTPS with Node's default certificate validation defeats DNS spoofing unless a CA is compromised.
  - There is no route that accepts credential content from the client. Signing, offers and collection
    items all use the records the server itself fetched into the session; the client sends only list
    indices.
  - `test/koski.test.js` covers foreign hosts, look-alike hosts, internal addresses and bad paths.
  - The fetch refuses redirects (`redirect: 'error'`), so an open redirect on opintopolku.fi cannot
    send it to an attacker's server or an internal address; it gives up after 15 seconds and on a
    response over 5 MB (H3).

**What we do if it happens anyway.** Find the affected credentials by their issuance time and the
source link in the logs, revoke them (S1/H5), delete the stored copies, close the hole, and tell the
employers who received them if known. If the data came from a compromised Koski, inform Opetushallitus.

## T3: Forged or edited credentials

**What may happen.** Bob downloads a genuine badge of their own and edits the JSON (a better grade, another
degree, another name), or writes a credential from scratch that claims to come from "Opintotodiste",
signed with their own key. They send the file, or a screenshot, to an employer.

**Probability: Medium.** Editing JSON is easy. **Impact: Medium**, per employer misled, if the
employer does not check.

**What we do so that it doesn't happen.**

- In place: every `ldp_vc` carries a Data Integrity proof; any edit breaks it. `/verify` (veri-good)
  checks the proof and accepts **only** our signing DID (`src/trusted-issuers.js`), so a self-signed
  credential with our name shows as an unknown issuer. Wallet credentials are SD-JWTs whose issuer
  key is published at the issuer's `/.well-known/jwt-vc-issuer` and in its OpenID Federation entity
  configuration. `/verify?url=` takes only same-origin URLs, so a link cannot make our page vouch for
  a file hosted elsewhere. The shared pages (`/c/…`) render credentials from our own database, which
  only ever holds credentials we signed.
- Residual: a screenshot or a PDF printout cannot be verified, and an employer who does not check
  is not protected. The `/employer` page tells employers to check on `/verify` or on the share link.

**What we do if it happens anyway.** Nothing to revoke (we never signed it). Help the employer verify,
and if a forged credential misuses our name at scale, warn on `/employer` and report it.

## T4: The signing service signs for someone else

**What may happen.** signing-service has no authentication: whoever can reach its port can have any
content signed with our `did:key`. In the deployed environments it runs in private subnets without a
public IP, but its security group allows port 4006 from `0.0.0.0/0` ("Temporary full VPC access",
`tf/infrastructure/security/sec-groups.tf` in aws-environment). Any other workload in the VPC (another
application, a compromised container) can therefore sign arbitrary credentials as Opintotodiste.
Similarly, anyone holding `OID4VCI_ISSUER_TOKEN` can make oid4vci-issuer issue any claims to a wallet
under our SD-JWT key.

**Probability: Low–Medium** (needs a foothold in the VPC or the token, but the VPC is shared with
other services). **Impact: Critical**: forgeries are indistinguishable from genuine credentials, and
a `did:key` cannot be rotated without invalidating every credential issued so far.

**What we do so that it doesn't happen.**

- In place: no public IP, private subnets, internal service discovery name; the coordinator token is
  a secret from the secret store, required in production.
- Planned (H4): restrict the security group to the opintotodiste and oid4vci-issuer security groups,
  and confirm that no other application uses the same signing tenant.

**What we do if it happens anyway.** Treat it as a key compromise (T5).

## T5: A signing key leaks

**What may happen.** The signing-service tenant seed (`TENANT_SEED_*`) or oid4vci-issuer's
`SD_JWT_SIGNING_KEY` leaks, through the secret store, a backup, a log, a developer machine or a
compromised container. Whoever has it can sign credentials that verify as ours.

**Probability: Low.** **Impact: Critical.**

**What we do so that it doesn't happen.**

- In place: keys live in the deployment secret store, only in signing-service and oid4vci-issuer
  (never in this app); development keys are generated per start and are different from deployed ones.
- Gap: the `ldp_vc` issuer is a `did:key`, which *is* the key: it cannot be rotated, only abandoned.
  G7 (did:web) makes rotation possible. There is no revocation (S1).

**What we do if it happens anyway** (runbook to be written in H5).

1. Generate a new key and deploy it.
2. SD-JWT: publish the new key in `/.well-known/jwt-vc-issuer` and the federation metadata, remove the
   old one; wallets and verifiers that re-fetch keys then reject old credentials, genuine ones included.
3. `ldp_vc`: update `/verify`'s trusted DID (automatic, it probes signing-service) and the trust
   registries; with `did:key`, every badge issued before is now indistinguishable from forgeries.
4. Tell users to re-issue their badges (their collections must be re-signed; we can do it for them from
   the stored records), and tell trust registries and known verifiers.
5. Assess whether personal data was exposed (T14).

## T6: Look-alike site or fake verification page

**What may happen.** Bob builds a site that looks like Opintotodiste (`opintotodiste-fi.com`) with a
"shared collection" of degrees they don't have, or a fake "verification" page that says anything is
genuine, and sends that link to an employer. Or they phish learners: a fake Opintotodiste asks for
their Koski link (giving Bob the data, see T1).

**Probability: Medium.** **Impact: Medium.**

**What we do so that it doesn't happen.**

- In place: the `/employer` page and the shared pages tell employers to check badges themselves; the
  share pages link to `/verify` on our own origin. Passkeys are bound to our origin, so a look-alike
  site cannot reuse a learner's passkey login.
- Recommended: state our exact address on `/employer` ("only `opintotodiste.…findy.fi` pages are ours"),
  and let employers verify by pasting a link or file on `/verify` rather than trusting what a page
  shows.

**What we do if it happens anyway.** Report the domain to its registrar/host and to Kyberturvallisuuskeskus
(NCSC-FI), warn on `/employer`, and help the misled employer verify the real records.

## T7: A share link reaches the wrong people

**What may happen.** A collection link meant for one employer is forwarded, posted, indexed by a
search engine, kept in a recruitment system long after the process, or leaks in a `Referer` header.
Whoever has it sees the badges and the oppijanumero in them. Links have no expiry and no record of
who opened them (deliberately, U9).

**Probability: Medium.** **Impact: Medium** (study records and a personal identifier of one person).

**What we do so that it doesn't happen.**

- In place: 192-bit random tokens (unguessable); `X-Robots-Tag: noindex, nofollow` on every `/c/`
  response (from U13); Open Graph previews show only the collection or badge name and the school; the
  owner makes one labelled link per recipient and deletes one without breaking the others (U9), shares
  a single badge without exposing a collection, removes a badge from a collection, deletes the badge,
  the collection or the whole account (U15); and since H3, `Referrer-Policy: no-referrer` on every response, so a token in our URLs (also in
  `/verify?url=`) never leaves in a `Referer` header (H3).
- Consider: an expiry date.

**What we do if it happens anyway.** The owner deletes the link that leaked; on request
we do it for them (info@findy.fi). Copies already downloaded cannot be recalled.

## T8: The next person at a shared computer

**What may happen.** Alice imports their Koski data on a library or school computer without signing in
and walks away. The session cookie has no expiry and the server keeps the session (with their name and
study records) for 24 hours after the last request. The next person opens the site and sees Alice's
records; if they sign in, they can put them into their own collections (T1). Anonymous users have no way
to clear their data; only signed-in users can sign out.

**Probability: Medium.** **Impact: Medium.**

**What we do so that it doesn't happen.**

- In place: the session keeps only the Koski fields the converter needs (oppijanumero, names, study
  rights), not the whole response; signing out deletes the session row. Since H3: imported Koski data
  leaves the session after an hour without requests; "Tyhjennä tiedot" (*clear my data*) under the
  list removes it at once after a confirmation (an anonymous session is deleted as a whole); the main page, which embeds the records, is sent `Cache-Control: no-store`.
- Residual: within that hour, or for a signed-in user who leaves without signing out, the next person
  still sees the data.

**What we do if it happens anyway.** As T1 for any badges taken; otherwise the Koski data expires
within the hour.

## T9: Account or session takeover

**What may happen.** Someone gets into Alice's account and deletes or shares Alice's collections, or
sends Alice's badges to the attacker's own wallet: by stealing Alice's session cookie, fixing the
session id before Alice signs in (a sibling `*.findy.fi` subdomain can set cookies for the parent
domain), injecting script (XSS) through a collection name or Koski data, making Alice's browser send
requests (CSRF), or tricking Alice into clicking "delete account" in a hidden frame (clickjacking).

**Probability: Low.** **Impact: High** for the victim.

**What we do so that it doesn't happen.**

- In place: passkeys (phishing-resistant, bound to `RP_ID`/`ORIGIN`; no passwords to steal or reuse);
  all server-rendered values go through `esc()` and embedded JSON through `embedJson()`; client code
  builds the DOM with `textContent`; state-changing routes take JSON bodies, which a cross-site form
  cannot send without a CORS preflight, and browsers default cookies to `SameSite=Lax`; ownership is
  checked in SQL on every collection route, so a stranger's ids answer 404.
- In place since H3: a new session id on registration and sign-in (fixation); over HTTPS the
  cookie is `__Host-sid`, `Secure`, `HttpOnly`, `SameSite=Lax`, so a sibling subdomain cannot set it;
  `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none';
  form-action 'self'` and `X-Frame-Options: DENY` (clickjacking), `X-Content-Type-Options: nosniff`;
  list indices must be non-negative integers.
- Gap: the CSP does not restrict `script-src`, because the pages embed their data in inline scripts.
  Escaping is the only defence against XSS until the data moves to `<script type="application/json">`
  or nonces.

**What we do if it happens anyway.** Delete the user's sessions (as account deletion does), ask them to
check their passkeys and collections, delete and recreate their share links; fix the hole; if collections were read,
handle it as a personal data breach (T14).

## T10: Losing access to an account

**What may happen.** Alice loses their only passkey (new phone without synced passkeys). There is no
account recovery, so their collections and share links are out of reach.

**Probability: Medium.** **Impact: Low**: nothing is lost that can't be rebuilt, since the badges can
be imported again from Koski; existing share links keep working until removed.

**What we do.** Accepted. The account dialog lets users add a second passkey; the guide should say so.
If Alice asks, we can delete the old account on request after checking that they are its owner (for
example, by their naming a collection and its content).

## T11: A wallet offer is picked up by someone else

**What may happen.** The wallet dialog shows the offer QR code and the transaction code side by side.
Someone who sees both (over the shoulder, a shared screen, a screenshot) within the offer's lifetime
can scan it first, and that person's wallet gets Alice's badge bound to its key.

**Probability: Low.** **Impact: Medium.**

**What we do so that it doesn't happen.** In place: pre-authorized codes are single-use and expire
after 10 minutes; the tx code is required. Accepted otherwise: the person who could do this usually
could import the Koski link as well (T1).

**What we do if it happens anyway.** Revoke that credential (S1) once revocation exists.

## T12: Abuse and denial of service

**What may happen.** A script creates thousands of accounts and collections, or repeats imports,
signing and wallet offers. The database fills up, signing-service or oid4vci-issuer (which keeps
offers in memory) slows down or runs out of memory, or Koski starts blocking our IP address because
we proxy too many requests, which breaks the service for everyone.

**Probability: Medium.** **Impact: Medium** (availability).

**What we do so that it doesn't happen.**

- In place: Express's default 100 kB body limit; imports, signing and offers only work on data the
  session fetched from Koski; offers expire after 10 minutes.
- In place since H3: per-client-IP limits in the app (`src/rate-limit.js`, five-minute windows): 60
  Koski imports, 200 signing or wallet-offer requests, 100 passkey challenges. Generous enough for a
  classroom behind one address.
- Gap: the limits are per instance and in memory, and there is no WAF in front of the opintotodiste
  load balancer (none found in aws-environment). A WAF rate rule is where heavier limits belong.

**What we do if it happens anyway.** Block the source at the load balancer, scale or restart the
affected service, clean up the junk accounts, and contact Koski's support if we were blocked.

## T13: A credential outlives the record it came from

**What may happen.** Koski corrects or cancels a record after it was imported (a wrong grade, a
cancelled degree, a record added by mistake). Our badge keeps saying what Koski said on the day of
import, with no expiry, and we cannot withdraw it.

**Probability: Medium.** **Impact: Medium.**

**What we do so that it doesn't happen.** In place: badges show the award date, and the shared pages
say where the data comes from. Planned: revocation status (S1, to become required, H5); consider an
expiry or a "checked against Koski on" date.

**What we do if it happens anyway.** On request from the learner or the school, delete the stored
copies and (with S1) revoke the issued credentials.

## T14: Personal data leaks from storage or logs

**What may happen.** The database (sessions with Koski data, collections with badges and
oppijanumeros, passkey public keys), a backup, or the logs leak through a misconfiguration, stolen
credentials or a vulnerability.

**Probability: Low.** **Impact: High.**

**What we do so that it doesn't happen.**

- In place: data minimisation (the session keeps only what the converter needs; credentials carry the
  oppijanumero and the name, nothing more about the person; passkeys store only public keys); the database is on a private network with its own
  credentials; CloudWatch logs are kept 30 days (development); sessions expire after 24 hours idle;
  account deletion removes everything of the user, including other sessions.
  Since H3, errors from signing-service and oid4vci-issuer are logged (and shown) by status only,
  never with the response body, which may echo the credential.
- Gap: database backup retention is not yet documented (U13).

**What we do if it happens anyway.** Follow Findynet's personal data breach process: contain, assess,
notify the Data Protection Ombudsman within 72 hours, inform affected users if the risk is high,
rotate database and session secrets (which signs everyone out).

## T15: A dependency is compromised

**What may happen.** A malicious version of an npm package (the converter `koski2openbadge`, the
`veri-good` bundle served to employers' browsers, `translate-element`, `@simplewebauthn/*`) or a
container image (signing-service, Postgres, Node) reaches a deployment.

**Probability: Low.** **Impact: High**: code running in our app or in users' browsers.

**What we do so that it doesn't happen.** In place: `package-lock.json`; Dependabot for npm, Docker
and GitHub Actions; signing-service pinned to a published version; browser libraries served from our
own origin, not a CDN. Recommended: `npm audit` (or similar) in CI, and pin `veri-good` (a beta) to an
exact version.

**What we do if it happens anyway.** Roll back to the last good image, rotate any secret the code
could read (session secret, coordinator token, database password, keys if the issuer was affected,
T5), and assess T14.

## T16: A deployment runs with development defaults

**What may happen.** A deployment starts with `SESSION_SECRET=dev-secret-change-me` (anyone can mint a
session cookie for any account), the compose `COORDINATOR_TOKEN`, a generated SD-JWT key, or the wrong
`RP_ID`/`ORIGIN`.

**Probability: Low.** **Impact: Critical** (session secret, coordinator token).

**What we do so that it doesn't happen.** In place: with `NODE_ENV=production` the app refuses to
start when a required variable is missing (`src/env-check.js`); deployment config lives in
aws-environment with secrets in the secret store. Since H3 it also refuses a secret that is still set
to one of this repository's placeholders (`change-me`, `dev-…`). Gap: a wrong `RP_ID`/`ORIGIN`
is not detected at startup (passkey sign-in fails instead).

**What we do if it happens anyway.** Set real values and redeploy (which signs everyone out), check
the logs for unexpected sessions or offers, and handle as T5 or T14 if anything was exploited.

---

## Assumptions and out of scope

- Koski (Opetushallitus) returns correct data over HTTPS for a valid share link. A compromised Koski
  is out of scope.
- The learner's own device and passkey provider are not compromised.
- Wallets implement OID4VCI and holder binding correctly; their security is their vendors'.
- oid4vci-issuer and signing-service are assessed here only where this app depends on them; their own
  threat analyses belong in their repositories.
- AWS account security (IAM, the deployment pipeline) is covered by FindyFi/aws-environment.
