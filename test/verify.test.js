import assert from 'node:assert/strict'
import test, { beforeEach, describe } from 'node:test'

import { didDocument, didWebFor, resetSigningKey, signingIssuerDid, signingKey } from '../src/issuer-did.js'
import { trustedIssuers } from '../src/trusted-issuers.js'
import { verifyPage } from '../src/views/verify.js'
import { startStubServer } from './helpers/stub-server.js'

const DID = 'did:key:z6MknfohBhSQb169ERHBLctmU64Wbxebdt6Ksvh7qYinSSMc'

// What signing-service 1.1.0 signs with for TENANT_SEED_<T>=z1AeiPT496wWmo9BG2QYXeTusgFSZPNG3T9wNeTtjrQ3rCB,
// as a did:key and with TENANT_DIDMETHOD_<T>=web, TENANT_DID_URL_<T>=https://opinto.todiste.fi.
const KEY = 'z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q'
const DID_WEB = 'did:web:opinto.todiste.fi'

// Like signing-service: replaces the issuer with its tenant's DID and names
// the key in the proof.
const signingAs = (did, key = did.startsWith('did:key:') ? did.slice(8) : KEY) =>
  startStubServer(({ body }) => ({ json: { ...body, issuer: { id: did }, proof: { verificationMethod: `${did}#${key}` } } }))
const signingService = () => signingAs(DID)

describe('trusted issuers for /verify', () => {
  beforeEach(() => resetSigningKey())

  test('are the DID the signing service signs with', async () => {
    const signer = await signingService()
    try {
      const issuers = await trustedIssuers({ baseUrl: signer.url, instanceId: 'test' }, { issuerName: 'Opintotodiste', url: 'https://opinto.todiste.fi' })
      assert.deepEqual(issuers, { [DID]: { issuerName: 'Opintotodiste', url: 'https://opinto.todiste.fi' } })
      assert.equal(signer.requests[0].url, '/instance/test/credentials/sign?suite=ed25519')
    } finally {
      await signer.stop()
    }
  })

  test('ask the signing service once, then again after ten minutes', async () => {
    const signer = await signingService()
    const signing = { baseUrl: signer.url, instanceId: 'test' }
    try {
      await signingIssuerDid(signing, { now: 0 })
      await signingIssuerDid(signing, { now: 9 * 60 * 1000 })
      assert.equal(signer.requests.length, 1)
      await signingIssuerDid(signing, { now: 11 * 60 * 1000 })
      assert.equal(signer.requests.length, 2)
    } finally {
      await signer.stop()
    }
  })

  test('refuse an answer without a DID', async () => {
    const signer = await startStubServer(({ body }) => ({ json: { ...body, issuer: 'https://example.org' } }))
    try {
      await assert.rejects(() => signingIssuerDid({ baseUrl: signer.url, instanceId: 'test' }), /no issuer DID/)
    } finally {
      await signer.stop()
    }
  })

  test('are the did:web and, for credentials issued before it, the did:key of the same key', async () => {
    const signer = await signingAs(DID_WEB)
    try {
      const issuers = await trustedIssuers({ baseUrl: signer.url, instanceId: 'test' }, { issuerName: 'Opintotodiste', url: 'https://opinto.todiste.fi' })
      const entry = { issuerName: 'Opintotodiste', url: 'https://opinto.todiste.fi' }
      assert.deepEqual(issuers, {
        [DID_WEB]: entry,
        [`did:key:${KEY}`]: entry,
      })
    } finally {
      await signer.stop()
    }
  })

  test('keep the last answer while the signing service is down', async () => {
    const signer = await signingService()
    const signing = { baseUrl: signer.url, instanceId: 'test' }
    await signingIssuerDid(signing, { now: 0 })
    await signer.stop()
    assert.equal(await signingIssuerDid(signing, { now: 60 * 60 * 1000 }), DID)
  })

  test('are empty without a signing service', async () => {
    assert.deepEqual(await trustedIssuers({}, { issuerName: 'x' }), {})
  })
})

describe('the issuer DID document', () => {
  beforeEach(() => resetSigningKey())

  test('names the key from the proof', async () => {
    const signer = await signingAs(DID_WEB)
    try {
      assert.deepEqual(await signingKey({ baseUrl: signer.url, instanceId: 'test' }), { did: DID_WEB, publicKeyMultibase: KEY })
    } finally {
      await signer.stop()
    }
  })

  test('has no key when the proof names another DID or some other kind of key', async () => {
    for (const verificationMethod of [`did:web:elsewhere.example#${KEY}`, `${DID_WEB}#key-1`, `${DID_WEB}#zDn${KEY.slice(4)}`, undefined]) {
      resetSigningKey()
      const signer = await startStubServer(({ body }) => ({ json: { ...body, issuer: DID_WEB, proof: { verificationMethod } } }))
      try {
        assert.deepEqual(await signingKey({ baseUrl: signer.url, instanceId: 'test' }), { did: DID_WEB, publicKeyMultibase: null }, verificationMethod)
      } finally {
        await signer.stop()
      }
    }
  })

  test("is this origin's did:web, with the key as its assertion method", () => {
    assert.equal(didWebFor('https://opinto.todiste.fi'), DID_WEB)
    assert.equal(didWebFor('http://localhost:3001'), 'did:web:localhost%3A3001')
    assert.deepEqual(didDocument({ did: DID_WEB, publicKeyMultibase: KEY }, 'https://opinto.todiste.fi'), {
      '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
      id: DID_WEB,
      verificationMethod: [{ id: `${DID_WEB}#${KEY}`, type: 'Ed25519VerificationKey2020', controller: DID_WEB, publicKeyMultibase: KEY }],
      assertionMethod: [`${DID_WEB}#${KEY}`],
    })
  })

  test('is null for a did:key, another host or an unknown key', () => {
    assert.equal(didDocument({ did: `did:key:${KEY}`, publicKeyMultibase: KEY }, 'https://opinto.todiste.fi'), null)
    assert.equal(didDocument({ did: 'did:web:other.example', publicKeyMultibase: KEY }, 'https://opinto.todiste.fi'), null)
    assert.equal(didDocument({ did: `${DID_WEB}:issuer`, publicKeyMultibase: KEY }, 'https://opinto.todiste.fi'), null)
    assert.equal(didDocument({ did: DID_WEB, publicKeyMultibase: null }, 'https://opinto.todiste.fi'), null)
    assert.equal(didDocument({ did: DID_WEB, publicKeyMultibase: KEY }, undefined), null)
  })
})

describe('the verify page', () => {
  test('hands veri-good the issuer list, escaped as template text', () => {
    const html = verifyPage({ issuers: { [DID]: { issuerName: 'A & B </template>' } } })
    const [, text] = /<template id="issuer-dids">([^<]*)<\/template>/.exec(html)
    const decoded = text.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e])
    assert.deepEqual(JSON.parse(decoded), { [DID]: { issuerName: 'A & B </template>' } })
  })

  // Without the template veri-good would trust its built-in demo DIDs.
  test('renders the template even for an empty list', () => {
    assert.match(verifyPage({ issuers: {} }), /<template id="issuer-dids">\{\}<\/template>/)
  })

  test('loads the vendored veri-good and its own script', () => {
    const html = verifyPage({ issuers: {} })
    assert.ok(html.includes('<script type="module" src="/vendor/veri-good/bundle.js"></script>'))
    assert.ok(html.includes('<script src="/verify.js" defer></script>'))
  })
})
