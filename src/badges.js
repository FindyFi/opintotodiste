import { randomUUID } from 'node:crypto'

const VC_CONTEXT = 'https://www.w3.org/2018/credentials/v1'
const VC2_CONTEXT = 'https://www.w3.org/ns/credentials/v2'
const OB3_CONTEXT = 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'

// Wraps a koski2openbadge `credentialSubject` in the envelope a signing
// service expects: a full, unsigned Open Badges 3.0 Verifiable Credential.
export function toVerifiableCredential({ credentialSubject, awardedOn }, { issuerId, issuerName }) {
  if (!issuerId) {
    throw new Error('The issuer is not configured (set ISSUER_ID).')
  }
  return {
    '@context': [VC_CONTEXT, OB3_CONTEXT],
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: issuerId,
      type: ['Profile'],
      name: issuerName,
    },
    ...(credentialSubject.achievement?.name ? { name: credentialSubject.achievement.name } : {}),
    issuanceDate: awardedOn ? new Date(awardedOn).toISOString() : new Date().toISOString(),
    credentialSubject,
  }
}

// Like toVerifiableCredential, but a VCDM 2.0 credential (`validFrom`, v2
// context) for oid4vci-issuer to secure as an SD-JWT. Still unsigned, and
// `issuerId` must be the issuer's HTTPS URL, which the issuer checks.
export function toVcdm2Credential({ credentialSubject, awardedOn }, { issuerId, issuerName }) {
  if (!issuerId) {
    throw new Error('The wallet issuer is not configured (set OID4VCI_CREDENTIAL_ISSUER_ID).')
  }
  return {
    '@context': [VC2_CONTEXT, OB3_CONTEXT],
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: issuerId,
      type: ['Profile'],
      name: issuerName,
    },
    ...(credentialSubject.achievement?.name ? { name: credentialSubject.achievement.name } : {}),
    validFrom: awardedOn ? new Date(awardedOn).toISOString() : new Date().toISOString(),
    credentialSubject,
  }
}

// The claims of an IETF SD-JWT VC (`dc+sd-jwt`), which most wallets
// understand better than VCDM 2.0: flat claims identified by `vct`, with no
// JSON-LD (`@context`, `type`) and no credentialSubject wrapper. Still
// unsigned; oid4vci-issuer adds `iss`, `iat` and `cnf`.
// Claim names follow Open Badges 3.0, as the shared Open Badge type at
// https://openbadge.digicredential.eu/credentials/v1/OpenBadgeVCT defines.
// No top-level `name` here: SD-JWT VC has no registered claim for it, and a
// wallet's display name for this vct comes from the type metadata (F1), not
// per-instance data. The achievement's own `name` is still in `achievement`.
// The holder's name travels as Open Badges' `identifier` (G8), always
// disclosed for now; the v1 type defines no display for it.
export function toSdJwtVcClaims({ credentialSubject, awardedOn }, { vct }) {
  if (!vct) {
    throw new Error('The wallet credential type is not configured (set OID4VCI_CREDENTIAL_VCT).')
  }
  return {
    vct,
    ...(credentialSubject.id ? { sub: credentialSubject.id } : {}),
    ...(credentialSubject.identifier ? { identifier: withoutJsonLdTypes(credentialSubject.identifier) } : {}),
    ...(awardedOn ? { awardedDate: new Date(awardedOn).toISOString() } : {}),
    achievement: withoutJsonLdTypes(credentialSubject.achievement),
  }
}

function withoutJsonLdTypes(value) {
  if (Array.isArray(value)) return value.map(withoutJsonLdTypes)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'type').map(([key, v]) => [key, withoutJsonLdTypes(v)]))
}

// Inverse of toVerifiableCredential for a stored (signed) ldp_vc, so it can be
// rebuilt as another kind of credential.
export function recordFromCredential(vc) {
  return { credentialSubject: vc.credentialSubject, awardedOn: vc.issuanceDate ?? vc.validFrom }
}

// Calls a https://github.com/digitalcredentials/signing-service instance to
// add a proof to an unsigned credential.
export async function signCredential(vc, { baseUrl, instanceId, suite = 'ed25519' }) {
  if (!baseUrl || !instanceId) {
    throw new Error('The signing service is not configured (set SIGNING_SERVICE_URL and SIGNING_SERVICE_INSTANCE_ID).')
  }
  const url = new URL(`/instance/${instanceId}/credentials/sign`, baseUrl)
  url.searchParams.set('suite', suite)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(vc),
  })
  if (!res.ok) {
    // Status only: the body may echo the credential we sent, and this message
    // is logged and shown to the user. The service logs the details itself.
    await res.body?.cancel()
    throw new Error(`Signing service responded with ${res.status} ${res.statusText}`)
  }
  return res.json()
}
