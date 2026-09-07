import { randomUUID } from 'node:crypto'

const VC_CONTEXT = 'https://www.w3.org/2018/credentials/v1'
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
    issuanceDate: awardedOn ? new Date(awardedOn).toISOString() : new Date().toISOString(),
    credentialSubject,
  }
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
    const text = await res.text().catch(() => '')
    throw new Error(`Signing service responded with ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  return res.json()
}
