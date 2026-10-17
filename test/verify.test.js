import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { beforeEach, describe } from 'node:test'

import { resetTrustedIssuers, signingIssuerDid, trustedIssuers } from '../src/trusted-issuers.js'
import { verifyPage } from '../src/views/verify.js'
import { startStubServer } from './helpers/stub-server.js'

const DID = 'did:key:z6MknfohBhSQb169ERHBLctmU64Wbxebdt6Ksvh7qYinSSMc'

// Like signing-service: replaces the issuer with its tenant's DID.
const signingService = () => startStubServer(({ body }) => ({ json: { ...body, issuer: { id: DID }, proof: {} } }))

describe('trusted issuers for /verify', () => {
  beforeEach(() => resetTrustedIssuers())

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

  test('are empty without a signing service', async () => {
    assert.deepEqual(await trustedIssuers({}, { issuerName: 'x' }), {})
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

  // translate-element would add a second English copy next to the sibling.
  test('never pairs a sibling with text that translations.json already has', () => {
    const dictionary = JSON.parse(readFileSync(new URL('../public/translations.json', import.meta.url), 'utf8'))
    const html = verifyPage({ issuers: {} })
    const pairs = [...html.matchAll(/<(\w+)[^>]* lang="fi">([\s\S]*?)<\/\1><\1[^>]* lang="en">/g)]
    assert.ok(pairs.length > 0)
    for (const [, , fi] of pairs) {
      const text = fi.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      assert.ok(!Object.hasOwn(dictionary, text), text)
    }
  })
})
