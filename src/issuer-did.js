import { signCredential } from './badges.js'

// The DID our signing-service tenant signs ldp_vc credentials with, and its
// key. signing-service replaces `issuer.id` with that DID when it signs
// (ISSUER_ID never reaches a signed credential) and has no endpoint that tells
// it, so we sign a minimal credential and read the DID and the proof's
// verification method back.
//
// The tenant signs as a did:key, or as a did:web when it has
// TENANT_DIDMETHOD_<T>=web and TENANT_DID_URL_<T>. Both come from the same
// TENANT_SEED_<T>, so the key is the same: signing-service names it
// `<did>#<publicKeyMultibase>` either way. With a fixed seed (as deployed) it
// is stable; locally ("generate") it changes whenever signing-service
// restarts, hence the expiry.

const PROBE = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential'],
  issuer: 'did:example:probe',
  issuanceDate: '2026-01-01T00:00:00Z',
  credentialSubject: { id: 'did:example:probe' },
}

const MAX_AGE_MS = 10 * 60 * 1000

// An Ed25519 public key as a multibase (base58btc) multikey, as
// Ed25519VerificationKey2020 and did:key write it.
const ED25519_MULTIBASE = /^z6Mk[1-9A-HJ-NP-Za-km-z]+$/

let cached = null // { key, at } once a probe succeeds

/**
 * Resolves to `{ did, publicKeyMultibase }`; `publicKeyMultibase` is null if
 * the proof names some other kind of key. Asks signing-service at most every
 * ten minutes. When it can't be reached, the last answer is kept: the key
 * only changes with the seed, and did.json shouldn't vanish with a restart.
 */
export async function signingKey(signing, { now = Date.now() } = {}) {
  if (cached && now - cached.at < MAX_AGE_MS) return cached.key
  let signed
  try {
    signed = await signCredential(PROBE, signing)
  } catch (err) {
    if (cached) return cached.key
    throw err
  }
  const did = typeof signed.issuer === 'string' ? signed.issuer : signed.issuer?.id
  if (!did?.startsWith('did:')) throw new Error(`The signing service returned no issuer DID (got ${JSON.stringify(did)}).`)
  const [methodDid, fragment] = String(signed.proof?.verificationMethod ?? '').split('#')
  const publicKeyMultibase = methodDid === did && ED25519_MULTIBASE.test(fragment ?? '') ? fragment : null
  const key = { did, publicKeyMultibase }
  cached = { key, at: now }
  return key
}

export async function signingIssuerDid(signing, options) {
  return (await signingKey(signing, options)).did
}

// For tests: forget the cached key.
export function resetSigningKey() {
  cached = null
}

/** The did:web that `origin`'s /.well-known/did.json describes. */
export function didWebFor(origin) {
  return `did:web:${encodeURIComponent(new URL(origin).host)}`
}

/** The did:key with the same key, which credentials signed before did:web name. */
export function didKeyFor(publicKeyMultibase) {
  return `did:key:${publicKeyMultibase}`
}

/**
 * The DID document for /.well-known/did.json, or null when this site isn't
 * the signing DID's did:web (local dev on did:key, another host, or a key we
 * can't describe). Only the public key is needed: the same document
 * signing-service's own did-web-generator would make, with the key also
 * listed under verificationMethod for resolvers that look only there.
 */
export function didDocument({ did, publicKeyMultibase }, origin) {
  if (!origin || !publicKeyMultibase || did !== didWebFor(origin)) return null
  const method = {
    id: `${did}#${publicKeyMultibase}`,
    type: 'Ed25519VerificationKey2020',
    controller: did,
    publicKeyMultibase,
  }
  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
    id: did,
    verificationMethod: [method],
    assertionMethod: [method.id],
  }
}
