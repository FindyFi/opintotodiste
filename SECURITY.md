# Security policy

## Supported versions

The project is small and moves as a single line of development. Fixes land on `main`; there are no
maintained release branches.

## Reporting a vulnerability

Please report suspected vulnerabilities privately, through GitHub's
[private vulnerability reporting](https://github.com/FindyFi/opintotodiste/security/advisories/new)
for this repository. Please do not open a public issue for a security problem.

Include what you need to describe the problem: affected version or commit, what an attacker could do,
and a way to reproduce it if you have one.

## What this service handles

It imports a person's study records from Koski, converts them into draft Open Badges, and stores
signed credentials in collections the person owns. That makes the sensitive material personal
education data belonging to identified individuals, plus the passkey material behind their accounts.
Signing keys are *not* here — they live in the `signing-service` this app delegates to.

Three properties are design decisions rather than oversights:

- **Share links are unauthenticated bearer URLs.** Each link (`share_links.token`) is 24 random bytes
  (`randomBytes(24)`, base64url) and points at one collection (`/c/<token>`) or one saved credential
  (`/i/<token>`); anyone holding it can read those credentials without signing in. That is the
  feature. The owner makes one link per recipient and revokes a link by deleting it; nothing is
  recorded about who opens a link.
- **Saved credentials are immutable snapshots.** `saved_credentials.credential` holds the signed
  credential as it was when saved, not a live pointer back into Koski; collections only point at
  them. Deleting the saved credential (or its links) is the way to un-share the data in it.
- **Koski fetches are restricted to `opintopolku.fi`**, by host match rather than substring, and to
  study-record paths. The user supplies the URL, so this is the app's SSRF boundary: it is what
  stops a pasted link from making the server fetch `169.254.169.254`, an internal address or a
  `file://` path. `test/koski.test.js` covers those cases; please keep it that way when touching
  `src/koski.js`.

The threats we have identified, how likely and how serious each is, and what we do to prevent and
respond to them are in [docs/threat-analysis.md](docs/threat-analysis.md).

## Deployment expectations

| Setting | Why it matters |
| --- | --- |
| `SESSION_SECRET` | Signs session cookies. A default or shared value lets anyone mint a session for any account. Must be unique per environment and secret. |
| `RP_ID`, `ORIGIN` | The WebAuthn relying-party identity. These are what bind a passkey to *this* site; a wrong or overly broad value undermines the login. Must be the real HTTPS origin outside local development. |
| `DATABASE_URL` | Holds the personal data and passkey records above. Expects a private network and credentials that are not shared with anything else. |
| `OID4VCI_ISSUER_TOKEN` | Must match the issuer's `COORDINATOR_TOKEN`. It is what stops a third party from having arbitrary content signed by your key. |

The app serves over plain HTTP and expects to sit behind TLS termination. Passkeys require a secure
context, so anything other than `localhost` needs real HTTPS or login will not work at all. With
an `https://` `ORIGIN` the session cookie is `__Host-sid` and `Secure`; the app trusts one proxy hop
(`X-Forwarded-Proto`, `X-Forwarded-For`), so put exactly one load balancer in front of it. Its own
rate limits (per client IP and per instance, `src/rate-limit.js`) are a floor against scripts on the
Koski import, signing, wallet offers and passkey challenges; heavier limits belong in the ingress.
