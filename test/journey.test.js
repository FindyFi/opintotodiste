import assert from 'node:assert/strict'
import test, { after, before, describe } from 'node:test'

import { createAuthenticator } from './helpers/authenticator.js'
import { createClient, postgresUnavailable, startApp } from './helpers/app.js'
import { startStubServer } from './helpers/stub-server.js'

// The primary journey - paste a Koski link, get badges, sign one, put it in a
// collection, share it - had no end-to-end coverage at the app level. Each
// piece was unit-tested in isolation, which is how a shape mismatch between
// two of them survives a green suite.
//
// signing-service and oid4vci-issuer are stubbed, so this checks the app's
// own wiring, not their behaviour; Koski is served from a fixture via the
// harness's `--import` hook.
const skipReason = await postgresUnavailable()
const needsPostgres = skipReason ? { skip: skipReason } : {}

const FIXTURE = new URL('./fixtures/koski-sample.json', import.meta.url).pathname
const KOSKI_URL = 'https://opintopolku.fi/koski/opinnot/abc123'

const SIGNED = (vc) => ({ ...vc, proof: { type: 'Ed25519Signature2020', proofValue: 'z-stub' } })

describe('the Koski journey', needsPostgres, () => {
  let app
  let signer
  let issuer

  before(async () => {
    signer = await startStubServer((req) => ({ json: SIGNED(req.body) }))
    issuer = await startStubServer(() => ({
      json: { offerUri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fstub', expiresIn: 600 },
    }))
    app = await startApp({
      koskiFixture: FIXTURE,
      env: {
        SIGNING_SERVICE_URL: signer.url,
        SIGNING_SERVICE_INSTANCE_ID: 'test',
        SIGNING_SERVICE_SUITE: 'ed25519',
        OID4VCI_ISSUER_URL: issuer.url,
        OID4VCI_ISSUER_INSTANCE: 'test',
        OID4VCI_ISSUER_TOKEN: 'stub-token',
      },
    })
  })

  after(async () => {
    await app?.stop()
    await signer?.stop()
    await issuer?.stop()
  })

  async function loadCredentials(client, lang = 'fi') {
    const res = await client.json('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang } })
    assert.equal(res.status, 200, `loading Koski data failed: ${JSON.stringify(res.body)}`)
    return res.body
  }

  test('turns a Koski link into draft credentials', async () => {
    const client = createClient(app.baseUrl)
    const body = await loadCredentials(client)

    assert.ok(body.credentials.length > 0, 'expected at least one credential')
    assert.ok(body.personName, 'expected the person name to be reported')
    for (const credential of body.credentials) {
      assert.ok(credential.credentialSubject?.achievement?.name)
      assert.equal(credential.signed, null)
    }
  })

  test('reports a lapsed share link instead of failing opaquely', async () => {
    const client = createClient(app.baseUrl)
    const { status, body } = await client.json('/credentials', {
      method: 'POST',
      body: { koskiUrl: 'https://opintopolku.fi/koski/opinnot/not-found' },
    })

    assert.equal(status, 400)
    assert.match(body.error, /Koski responded with 404/)
  })

  test('refuses a link pointing anywhere but Koski', async () => {
    const client = createClient(app.baseUrl)
    const { status, body } = await client.json('/credentials', {
      method: 'POST',
      body: { koskiUrl: 'https://evil.example/koski/opinnot/abc123' },
    })

    assert.equal(status, 400)
    assert.match(body.error, /opintopolku\.fi/)
  })

  test('signs a credential and offers it for download', async () => {
    const client = createClient(app.baseUrl)
    await loadCredentials(client)

    const signed = await client.json('/credentials/0/sign', { method: 'POST' })
    assert.equal(signed.status, 200, JSON.stringify(signed.body))
    assert.ok(signed.body.signed.proof, 'expected a proof on the signed credential')

    // What the signing service was actually asked to sign - the app builds
    // the VC envelope, so this is where a malformed envelope would show up.
    const sent = signer.requests.at(-1)
    assert.match(sent.url, /\/instance\/test\/credentials\/sign\?suite=ed25519/)
    assert.deepEqual(sent.body['@context'], [
      'https://www.w3.org/2018/credentials/v1',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ])
    assert.equal(sent.body.issuer.id, 'did:web:example.org')
    assert.ok(sent.body.credentialSubject.achievement)

    const download = await client.request('/credentials/0/download')
    assert.equal(download.status, 200)
    assert.match(download.headers.get('content-disposition') ?? '', /attachment/)
    assert.ok((await download.json()).proof)
  })

  test('creates a wallet offer through the issuer', async () => {
    const client = createClient(app.baseUrl)
    await loadCredentials(client)

    const offer = await client.json('/credentials/0/offer', { method: 'POST' })
    assert.equal(offer.status, 200, JSON.stringify(offer.body))
    assert.match(offer.body.offerUri, /^openid-credential-offer:\/\//)
    assert.match(offer.body.qrDataUrl, /^data:image\/png;base64,/)

    const sent = issuer.requests.at(-1)
    assert.equal(sent.headers.authorization, 'Bearer stub-token')
    assert.equal(sent.body.credentialConfigurationId, 'OpenBadgeCredential')
    // The issuer signs on redemption, so it must be handed an unsigned VC.
    assert.equal(sent.body.unsignedCredential.proof, undefined)
  })

  test('re-translates already-loaded records without calling Koski again', async () => {
    const client = createClient(app.baseUrl)
    const fi = await loadCredentials(client, 'fi')

    const en = await client.json('/credentials/lang', { method: 'POST', body: { lang: 'en' } })
    assert.equal(en.status, 200, JSON.stringify(en.body))
    assert.equal(en.body.credentials.length, fi.credentials.length)

    const names = (body) => body.credentials.map((c) => c.credentialSubject.achievement.name)
    assert.notDeepEqual(names(en.body), names(fi), 'expected the English text to differ')
  })

  test('carries a signed status across a language switch', async () => {
    const client = createClient(app.baseUrl)
    await loadCredentials(client, 'fi')
    await client.json('/credentials/0/sign', { method: 'POST' })

    const en = await client.json('/credentials/lang', { method: 'POST', body: { lang: 'en' } })
    assert.ok(en.body.credentials[0].signed, 'signing should survive re-translation')
  })

  test('saves a signed credential into a collection and shares it', async () => {
    const client = createClient(app.baseUrl)
    const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })

    const options = await client.json('/auth/register/options', {
      method: 'POST',
      body: { displayName: 'Journey' },
    })
    await client.json('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })

    await loadCredentials(client)
    const collection = await client.json('/collections', { method: 'POST', body: { name: 'Omat' } })

    // Unsigned on purpose: this route signs what it needs to before storing.
    const added = await client.json(`/collections/${collection.body.id}/items`, {
      method: 'POST',
      body: { indices: [0] },
    })
    assert.equal(added.status, 200, JSON.stringify(added.body))
    const [result] = added.body.results
    assert.ok(!result.error, `adding the item failed: ${result.error}`)
    assert.ok(result.itemId)
    assert.ok(result.signed.proof)

    const listed = await client.json('/collections')
    assert.equal(listed.body.collections[0].itemCount, 1)

    // The shared page and the item download are public, no session at all.
    const anonymous = createClient(app.baseUrl)
    const page = await anonymous.request(`/c/${collection.body.shareToken}`)
    assert.equal(page.status, 200)

    const download = await anonymous.request(
      `/c/${collection.body.shareToken}/items/${result.itemId}/download`
    )
    assert.equal(download.status, 200)
    assert.ok((await download.json()).proof, 'the shared credential should still carry its proof')
  })
})
