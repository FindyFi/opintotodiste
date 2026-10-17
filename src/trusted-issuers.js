import { signCredential } from './badges.js'

// The issuers /verify trusts, in veri-good's issuer list format:
// { "<did>": { issuerName, url } }. veri-good rejects any other issuer.
//
// That is the DID our own signing-service tenant signs with. signing-service
// replaces `issuer.id` with that DID when it signs (ISSUER_ID never reaches a
// signed credential) and has no endpoint that tells it, so we sign a minimal
// credential once and read it back. With a fixed TENANT_SEED_* (as deployed)
// it is a stable did:key; locally ("generate") it changes whenever
// signing-service restarts, hence the expiry.
//
// When dcc-known-registries lists Findynet's federation (issue #7), veri-good
// still won't read it: 0.0.0-beta.7 has no registry support, only this list.

const PROBE = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential'],
  issuer: 'did:example:probe',
  issuanceDate: '2026-01-01T00:00:00Z',
  credentialSubject: { id: 'did:example:probe' },
}

const MAX_AGE_MS = 10 * 60 * 1000

let cached = null // { did, at } once a probe succeeds

export async function signingIssuerDid(signing, { now = Date.now() } = {}) {
  if (cached && now - cached.at < MAX_AGE_MS) return cached.did
  const signed = await signCredential(PROBE, signing)
  const did = typeof signed.issuer === 'string' ? signed.issuer : signed.issuer?.id
  if (!did?.startsWith('did:')) throw new Error(`The signing service returned no issuer DID (got ${JSON.stringify(did)}).`)
  cached = { did, at: now }
  return did
}

// For tests: forget the cached DID.
export function resetTrustedIssuers() {
  cached = null
}

// Never throws: without signing-service the list is empty, and veri-good
// then reports every credential as from an unknown issuer.
export async function trustedIssuers(signing, { issuerName, url }) {
  try {
    const did = await signingIssuerDid(signing)
    return { [did]: { issuerName, url } }
  } catch (err) {
    console.error('Could not learn the signing DID for /verify:', err.message)
    return {}
  }
}
