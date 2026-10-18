import { didKeyFor, signingKey } from './issuer-did.js'

// The issuers /verify trusts, in veri-good's issuer list format:
// { "<did>": { issuerName, url } }. veri-good rejects any other issuer.
//
// That is the DID our own signing-service tenant signs with (see
// issuer-did.js). When the tenant signs as a did:web, credentials issued
// before the switch still name the did:key of the same key, so that is
// trusted too.
//
// When dcc-known-registries lists Findynet's federation (issue #7), veri-good
// still won't read it: 0.0.0-beta.7 has no registry support, only this list.

// Never throws: without signing-service the list is empty, and veri-good
// then reports every credential as from an unknown issuer.
export async function trustedIssuers(signing, { issuerName, url }) {
  try {
    const { did, publicKeyMultibase } = await signingKey(signing)
    const dids = [did]
    if (did.startsWith('did:web:') && publicKeyMultibase) dids.push(didKeyFor(publicKeyMultibase))
    return Object.fromEntries(dids.map((d) => [d, { issuerName, url }]))
  } catch (err) {
    console.error('Could not learn the signing DID for /verify:', err.message)
    return {}
  }
}
