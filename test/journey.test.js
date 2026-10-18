import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { after, before, describe } from 'node:test'

import pg from 'pg'

import { createAuthenticator } from './helpers/authenticator.js'
import { createClient, databaseUrl, postgresUnavailable, startApp } from './helpers/app.js'
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
        OID4VCI_CREDENTIAL_ISSUER_ID: 'https://issuer.example',
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
    return { ...res.body, refs: res.body.credentials.map((c) => c.ref) }
  }

  test('turns a Koski link into draft credentials', async () => {
    const client = createClient(app.baseUrl)
    const body = await loadCredentials(client)

    assert.ok(body.credentials.length > 0, 'expected at least one credential')
    // The call name wins over all first names, on the page and in the credentials.
    assert.equal(body.personName, 'Tapaus Opiskelija')
    for (const credential of body.credentials) {
      assert.ok(credential.credentialSubject?.achievement?.name)
      assert.deepEqual(credential.credentialSubject.identifier, [
        { type: 'IdentityObject', hashed: false, identityType: 'name', identityHash: 'Tapaus Opiskelija' },
      ])
      assert.equal(credential.signed, false)
      assert.match(credential.ref, /^[A-Za-z0-9_-]{22}$/)
    }
  })

  // /policy promises this: the fixture carries a (fake) identity code and birth
  // date, which must not reach the session table.
  test('keeps only the learner number and names of the person in the session', async () => {
    // A share link of its own, to find this session among the others.
    const koskiUrl = `https://opintopolku.fi/koski/opinnot/session-${randomUUID()}`
    const client = createClient(app.baseUrl)
    const res = await client.json('/credentials', { method: 'POST', body: { koskiUrl, lang: 'fi' } })
    assert.equal(res.status, 200)

    const db = new pg.Client({ connectionString: databaseUrl() })
    await db.connect()
    try {
      const { rows } = await db.query(`SELECT sess FROM session WHERE sess->>'koskiUrl' = $1`, [koskiUrl])
      assert.equal(rows.length, 1, 'expected the saved session')
      assert.deepEqual(Object.keys(rows[0].sess.koskiData.henkilö).sort(), ['etunimet', 'kutsumanimi', 'oid', 'sukunimi'])
    } finally {
      await db.end()
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
    const { refs } = await loadCredentials(client)

    const signed = await client.json(`/credentials/${refs[0]}/sign`, { method: 'POST' })
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

    const download = await client.request(`/credentials/${refs[0]}/download`)
    assert.equal(download.status, 200)
    assert.match(download.headers.get('content-disposition') ?? '', /attachment/)
    assert.ok((await download.json()).proof)
  })

  test('creates a wallet offer through the issuer', async () => {
    const client = createClient(app.baseUrl)
    const { refs } = await loadCredentials(client)

    const offer = await client.json(`/credentials/${refs[0]}/offer`, { method: 'POST' })
    assert.equal(offer.status, 200, JSON.stringify(offer.body))
    assert.match(offer.body.offerUri, /^openid-credential-offer:\/\//)
    assert.match(offer.body.qrDataUrl, /^data:image\/png;base64,/)

    const sent = issuer.requests.at(-1)
    assert.equal(sent.headers.authorization, 'Bearer stub-token')
    assert.equal(sent.body.credentialConfigurationId, 'OpenBadgeCredentialSdJwt')
    // The issuer signs on redemption, so it must be handed an unsigned VCDM 2.0 VC.
    const vc = sent.body.unsignedCredential
    assert.equal(vc.proof, undefined)
    assert.equal(vc['@context'][0], 'https://www.w3.org/ns/credentials/v2')
    assert.equal(vc.issuer.id, 'https://issuer.example')
    assert.ok(vc.validFrom)
    assert.equal(vc.issuanceDate, undefined)
    assert.equal('disclosable' in sent.body, false, 'vc+sd-jwt has no disclosures')
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
    const { refs } = await loadCredentials(client, 'fi')
    await client.json(`/credentials/${refs[0]}/sign`, { method: 'POST' })

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

    const { refs } = await loadCredentials(client)
    const collection = await client.json('/collections', { method: 'POST', body: { name: 'Omat' } })

    // Unsigned on purpose: this route signs what it needs to before storing.
    const added = await client.json(`/collections/${collection.body.id}/items`, {
      method: 'POST',
      body: { refs: [refs[0]] },
    })
    assert.equal(added.status, 200, JSON.stringify(added.body))
    const [result] = added.body.results
    assert.ok(!result.error, `adding the item failed: ${result.error}`)
    assert.ok(result.credentialId)
    assert.ok(result.signed.proof)

    const listed = await client.json('/collections')
    assert.equal(listed.body.collections[0].itemCount, 1)

    // Saving the same record again (here: straight to the saved credentials)
    // finds the copy already saved.
    const again = await client.json('/saved-credentials', { method: 'POST', body: { refs: [refs[0]] } })
    assert.equal(again.body.results[0].credentialId, result.credentialId)
    assert.equal((await client.json('/saved-credentials')).body.credentials.length, 1)

    const link = await client.json('/share-links', {
      method: 'POST',
      body: { collectionId: collection.body.id, label: 'Työnantaja' },
    })
    assert.equal(link.status, 200, JSON.stringify(link.body))
    const base = link.body.path

    // The shared page and the item download are public, no session at all.
    const anonymous = createClient(app.baseUrl)
    const page = await anonymous.request(base)
    assert.equal(page.status, 200)
    const pageHtml = await page.text()
    const verifyLink = `/verify?url=${encodeURIComponent(`${base}/items/${result.credentialId}/download`)}`
    assert.ok(pageHtml.includes(`href="${verifyLink}"`), 'each shared item should link to /verify')

    const download = await anonymous.request(`${base}/items/${result.credentialId}/download`)
    assert.equal(download.status, 200)
    assert.ok((await download.json()).proof, 'the shared credential should still carry its proof')

    // The public item page, linked from the shared collection page.
    const itemUrl = `${base}/items/${result.credentialId}`
    assert.match(pageHtml, new RegExp(`href="${itemUrl}"`))
    const itemPage = await anonymous.request(itemUrl)
    assert.equal(itemPage.status, 200)
    const html = await itemPage.text()
    assert.match(html, new RegExp(`href="${itemUrl}/download"`))
    assert.ok(html.includes(`href="${verifyLink}"`), 'the item page should verify its own download')
    assert.equal((await anonymous.request(`${base}/items/not-a-uuid`)).status, 404)

    // Deleting the link revokes the item page along with the collection.
    await client.request(`/share-links/${link.body.id}`, { method: 'DELETE' })
    assert.equal((await anonymous.request(base)).status, 404)
    assert.equal((await anonymous.request(itemUrl)).status, 404)
  })

  test('saves one credential and shares it without a collection', async () => {
    const client = createClient(app.baseUrl)
    const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
    const options = await client.json('/auth/register/options', { method: 'POST', body: { displayName: 'Single' } })
    await client.json('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })
    const { refs } = await loadCredentials(client)

    const saved = await client.json('/saved-credentials', { method: 'POST', body: { refs: [refs[0]] } })
    assert.equal(saved.status, 200)
    const [result] = saved.body.results
    assert.ok(!result.error, result.error)
    assert.deepEqual((await client.json('/collections')).body.collections, [])

    const link = await client.json('/share-links', { method: 'POST', body: { credentialId: result.credentialId, label: 'A' } })
    const download = await createClient(app.baseUrl).request(`${link.body.path}/download`)
    assert.equal(download.status, 200)
    assert.deepEqual((await download.json()).proof, result.signed.proof)
  })

  describe('one list of credentials', () => {
    async function signUp(name, client = createClient(app.baseUrl)) {
      const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
      const options = await client.json('/auth/register/options', { method: 'POST', body: { displayName: name } })
      await client.json('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })
      return client
    }

    const list = async (client) => (await client.json('/credentials')).body.credentials
    const signedNow = () => signer.requests.length

    test('keeps a signed-in user’s import, unsigned, after signing out and back in', async () => {
      const client = createClient(app.baseUrl)
      const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
      const options = await client.json('/auth/register/options', { method: 'POST', body: { displayName: 'Pysyvä' } })
      await client.json('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })
      const before = signedNow()
      const { credentials: fetched } = await loadCredentials(client)
      assert.equal(signedNow(), before, 'importing signs nothing')

      // The next day: a new session, with no Koski data in it.
      await client.json('/auth/logout', { method: 'POST' })
      assert.deepEqual(await list(client), [])
      const login = await client.json('/auth/login/options', { method: 'POST' })
      await client.json('/auth/login/verify', { method: 'POST', body: authenticator.authenticate(login.body) })

      const entries = await list(client)
      assert.deepEqual(entries.map((e) => e.ref), fetched.map((e) => e.ref))
      assert.ok(entries.every((e) => !e.credentialId && e.signed === false))
    })

    test('shows a signed record once, with its saved copy’s id', async () => {
      const client = await signUp('List')
      const { credentials: fetched, refs } = await loadCredentials(client)
      const saved = await client.json('/saved-credentials', { method: 'POST', body: { refs: [refs[1]] } })
      const { credentialId } = saved.body.results[0]

      const entries = await list(client)
      assert.equal(entries.length, fetched.length)
      assert.deepEqual(entries.filter((e) => e.credentialId).map((e) => [e.ref, e.credentialId]), [[refs[1], credentialId]])
      assert.equal(entries[1].signed, true)
    })

    test('follows the language, and a re-import in another language changes nothing else', async () => {
      const client = await signUp('Kielet')
      const fi = await loadCredentials(client, 'fi')
      const saved = await client.json('/saved-credentials', { method: 'POST', body: { refs: [fi.refs[0]] } })
      const { credentialId } = saved.body.results[0]

      const en = await loadCredentials(client, 'en')
      assert.deepEqual(en.refs, fi.refs, 'the same records in either language')
      assert.notEqual(en.credentials[0].credentialSubject.achievement.name, fi.credentials[0].credentialSubject.achievement.name)
      assert.equal(en.credentials[0].credentialId, credentialId)

      const again = await client.json('/saved-credentials', { method: 'POST', body: { refs: [en.refs[0]] } })
      assert.equal(again.body.results[0].credentialId, credentialId)
      assert.equal((await client.json('/saved-credentials')).body.credentials.length, 1)
    })

    test('signing in keeps what was imported before it', async () => {
      const client = createClient(app.baseUrl)
      const { refs } = await loadCredentials(client)
      await client.request(`/credentials/${refs[2]}`, { method: 'DELETE' })
      await signUp('Myöhemmin', client)

      const entries = await list(client)
      assert.deepEqual(entries.map((e) => e.ref), refs.filter((_, i) => i !== 2))
      // It is in the account now, not in the session.
      const db = new pg.Client({ connectionString: databaseUrl() })
      await db.connect()
      try {
        const { rows } = await db.query(
          `SELECT i.removed FROM koski_imports i JOIN users u ON u.id = i.owner_id WHERE u.display_name = 'Myöhemmin'`
        )
        assert.deepEqual(rows[0].removed, [refs[2]])
      } finally {
        await db.end()
      }
    })

    test('signing signs once and saves the copy, for its owner to download', async () => {
      const client = await signUp('Lataa')
      const { refs } = await loadCredentials(client)
      const signed = await client.json(`/credentials/${refs[0]}/sign`, { method: 'POST' })
      assert.equal(signed.status, 200, JSON.stringify(signed.body))
      const { credentialId } = signed.body
      assert.ok(credentialId)
      const count = signedNow()
      const again = await client.json(`/credentials/${refs[0]}/sign`, { method: 'POST' })
      assert.equal(again.body.credentialId, credentialId)
      assert.equal(signedNow(), count, 'the saved copy is reused')

      const download = await client.request(`/saved-credentials/${credentialId}/download`)
      assert.equal(download.status, 200)
      assert.match(download.headers.get('content-disposition') ?? '', /attachment/)
      assert.deepEqual((await download.json()).proof, signed.body.signed.proof)

      assert.equal((await (await signUp('Someone else')).request(`/saved-credentials/${credentialId}/download`)).status, 404)
      assert.equal((await createClient(app.baseUrl).request(`/saved-credentials/${credentialId}/download`)).status, 401)
    })

    test('a wallet offer saves a signed-in user’s credential', async () => {
      const client = await signUp('Lompakko')
      const { refs } = await loadCredentials(client)
      const offer = await client.json(`/credentials/${refs[2]}/offer`, { method: 'POST' })
      assert.equal(offer.status, 200, JSON.stringify(offer.body))
      assert.ok(offer.body.credentialId)
      assert.equal((await list(client))[2].credentialId, offer.body.credentialId)
    })

    test('saves nothing for an anonymous user', async () => {
      const client = createClient(app.baseUrl)
      const { credentials: fetched, refs } = await loadCredentials(client)
      const signed = await client.json(`/credentials/${refs[0]}/sign`, { method: 'POST' })
      assert.equal(signed.body.credentialId, undefined)
      assert.ok(signed.body.signed.proof)
      const offer = await client.json(`/credentials/${refs[0]}/offer`, { method: 'POST' })
      assert.equal(offer.body.credentialId, undefined)

      const entries = await list(client)
      assert.equal(entries.length, fetched.length)
      assert.ok(entries.every((e) => e.credentialId === undefined))
      assert.equal(entries[0].signed, true, 'the session keeps the signature')
    })

    for (const who of ['an anonymous', 'a signed-in']) {
      test(`Poista takes a record off ${who} user’s list until an import brings it back`, async () => {
        const client = who === 'an anonymous' ? createClient(app.baseUrl) : await signUp('Poisto')
        const { refs } = await loadCredentials(client)
        assert.equal((await client.request(`/credentials/${refs[1]}`, { method: 'DELETE' })).status, 204)
        assert.deepEqual((await list(client)).map((e) => e.ref), refs.filter((_, i) => i !== 1))

        const en = await client.json('/credentials/lang', { method: 'POST', body: { lang: 'en' } })
        assert.deepEqual(en.body.credentials.map((e) => e.ref), refs.filter((_, i) => i !== 1), 'a language switch keeps it off')

        await loadCredentials(client)
        assert.deepEqual((await list(client)).map((e) => e.ref), refs)
        assert.equal((await client.request('/credentials/not-a-ref', { method: 'DELETE' })).status, 404)
      })
    }

    test('Poista on a signed row deletes the saved copy too', async () => {
      const client = await signUp('Siivous')
      const { credentials: fetched, refs } = await loadCredentials(client)
      const saved = await client.json('/saved-credentials', { method: 'POST', body: { refs: [refs[0]] } })
      await client.request(`/saved-credentials/${saved.body.results[0].credentialId}`, { method: 'DELETE' })
      await client.request(`/credentials/${refs[0]}`, { method: 'DELETE' })

      const entries = await list(client)
      assert.equal(entries.length, fetched.length - 1)
      assert.ok(entries.every((e) => e.ref !== refs[0] && !e.credentialId))
    })

    test('lists every share link with what it points to, for its owner only', async () => {
      const client = await signUp('Jakaja')
      const { refs } = await loadCredentials(client)
      const saved = await client.json('/saved-credentials', { method: 'POST', body: { refs: [refs[0], refs[1]] } })
      const [first, second] = saved.body.results
      const collection = await client.json('/collections', { method: 'POST', body: { name: 'Hakemus' } })
      await client.json(`/collections/${collection.body.id}/items`, { method: 'POST', body: { credentialIds: [second.credentialId] } })
      await client.json('/share-links', { method: 'POST', body: { credentialId: first.credentialId, label: 'A Oy' } })
      await client.json('/share-links', { method: 'POST', body: { collectionId: collection.body.id, label: 'B Oy' } })

      const { links } = (await client.json('/share-links')).body
      assert.deepEqual(
        links.map((l) => [l.label, l.target, l.targetName]).sort(),
        [
          ['A Oy', { credentialId: first.credentialId }, first.name],
          ['B Oy', { collectionId: collection.body.id }, 'Hakemus'],
        ]
      )
      assert.deepEqual((await (await signUp('Muu')).json('/share-links')).body.links, [])
    })
  })

  describe('sending a collection item to a wallet', () => {
    async function signUp(name) {
      const client = createClient(app.baseUrl)
      const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
      const options = await client.json('/auth/register/options', { method: 'POST', body: { displayName: name } })
      await client.json('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })
      return client
    }

    async function collectionWithItem(client) {
      const { refs } = await loadCredentials(client)
      const collection = await client.json('/collections', { method: 'POST', body: { name: 'Omat' } })
      const added = await client.json(`/collections/${collection.body.id}/items`, {
        method: 'POST',
        body: { refs: [refs[0]] },
      })
      return { collection: collection.body, itemId: added.body.results[0].credentialId, signed: added.body.results[0].signed }
    }

    test('re-issues the stored credential as a VCDM 2.0 offer for its owner', async () => {
      const client = await signUp('Owner')
      const { collection, itemId, signed } = await collectionWithItem(client)

      const offer = await client.json(`/saved-credentials/${itemId}/offer`, { method: 'POST' })
      assert.equal(offer.status, 200, JSON.stringify(offer.body))
      assert.match(offer.body.offerUri, /^openid-credential-offer:\/\//)
      assert.match(offer.body.qrDataUrl, /^data:image\/png;base64,/)

      const vc = issuer.requests.at(-1).body.unsignedCredential
      assert.equal(issuer.requests.at(-1).body.credentialConfigurationId, 'OpenBadgeCredentialSdJwt')
      assert.equal(vc['@context'][0], 'https://www.w3.org/ns/credentials/v2')
      assert.equal(vc.issuer.id, 'https://issuer.example')
      assert.equal(vc.validFrom, signed.issuanceDate)
      assert.deepEqual(vc.credentialSubject, signed.credentialSubject)
      assert.equal(vc.proof, undefined)
    })

    test('lists the items of an owned collection, and only to the owner', async () => {
      const owner = await signUp('Lister')
      const { collection } = await collectionWithItem(owner)

      const listed = await owner.json(`/collections/${collection.id}/items`)
      assert.equal(listed.status, 200)
      assert.equal(listed.body.items.length, 1)

      const stranger = await signUp('Stranger')
      assert.equal((await stranger.json(`/collections/${collection.id}/items`)).status, 404)
    })

    test('404s for someone who does not own the collection', async () => {
      const owner = await signUp('Owner 2')
      const { itemId } = await collectionWithItem(owner)
      const stranger = await signUp('Stranger 2')

      const res = await stranger.json(`/saved-credentials/${itemId}/offer`, { method: 'POST' })
      assert.equal(res.status, 404)
    })

    test('401s when signed out, including through the share link', async () => {
      const owner = await signUp('Owner 3')
      const { collection, itemId } = await collectionWithItem(owner)

      const anonymous = createClient(app.baseUrl)
      const res = await anonymous.json(`/saved-credentials/${itemId}/offer`, { method: 'POST' })
      assert.equal(res.status, 401)
      const link = await owner.json('/share-links', { method: 'POST', body: { collectionId: collection.id, label: 'A' } })
      assert.equal((await anonymous.request(`${link.body.path}/items/${itemId}/offer`, { method: 'POST' })).status, 404)
    })

    test('shows the award date on the shared page', async () => {
      const owner = await signUp('Owner 4')
      const { collection, signed } = await collectionWithItem(owner)
      const [y, m, d] = signed.issuanceDate.slice(0, 10).split('-')

      const link = await owner.json('/share-links', { method: 'POST', body: { collectionId: collection.id, label: 'A' } })
      const page = await createClient(app.baseUrl).request(link.body.path)
      assert.match(await page.text(), new RegExp(`${Number(d)}\\.${Number(m)}\\.${y}`))
    })
  })
})

describe('wallet offers as SD-JWT VC claims', needsPostgres, () => {
  const VCT = 'https://issuer.example/vct/OpenBadgeCredential'
  let app
  let issuer

  before(async () => {
    issuer = await startStubServer(() => ({
      json: { offerUri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fstub', expiresIn: 600 },
    }))
    app = await startApp({
      koskiFixture: FIXTURE,
      env: {
        OID4VCI_ISSUER_URL: issuer.url,
        OID4VCI_ISSUER_INSTANCE: 'test',
        OID4VCI_CREDENTIAL_CONFIGURATION_ID: 'OpenBadgeCredentialSdJwtVc',
        OID4VCI_CREDENTIAL_VCT: VCT,
      },
    })
  })

  after(async () => {
    await app?.stop()
    await issuer?.stop()
  })

  test('sends flat claims with the configured vct', async () => {
    const client = createClient(app.baseUrl)
    const loaded = await client.json('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang: 'fi' } })
    assert.equal(loaded.status, 200, JSON.stringify(loaded.body))

    const offer = await client.json(`/credentials/${loaded.body.credentials[0].ref}/offer`, { method: 'POST' })
    assert.equal(offer.status, 200, JSON.stringify(offer.body))

    const { credentialConfigurationId, unsignedCredential: claims, disclosable } = issuer.requests.at(-1).body
    assert.equal(credentialConfigurationId, 'OpenBadgeCredentialSdJwtVc')
    assert.deepEqual(disclosable, ['sub', 'identifier'].filter((claim) => claim in claims))
    assert.ok(disclosable.includes('identifier'), 'the holder name is disclosable')
    assert.equal(claims.vct, VCT)
    assert.ok(claims.achievement?.name)
    assert.ok(!Number.isNaN(Date.parse(claims.awardedDate)))
    for (const key of ['@context', 'type', 'credentialSubject', 'issuer', 'iss', 'cnf', 'vct#integrity']) assert.equal(key in claims, false, key)
  })
})
