import assert from 'node:assert/strict'
import test, { after, before, describe } from 'node:test'

import { createAuthenticator } from './helpers/authenticator.js'
import { createClient, postgresUnavailable, startApp } from './helpers/app.js'

// The authenticated half of the app - passkey registration and login, and
// everything behind them - had no end-to-end coverage: the existing tests
// only assert that the guards reject an anonymous caller, which passes just
// as well if the routes behind them are broken. These drive the real
// ceremonies with a virtual authenticator against the real app.
const skipReason = await postgresUnavailable()
const needsPostgres = skipReason ? { skip: skipReason } : {}

describe('passkeys and collections', needsPostgres, () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app?.stop()
  })

  /** Registers a fresh account and returns a signed-in client. */
  async function signUp(displayName = `Test ${Math.random().toString(36).slice(2, 8)}`) {
    const client = createClient(app.baseUrl)
    const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })

    const options = await client.json('/auth/register/options', {
      method: 'POST',
      body: { displayName },
    })
    assert.equal(options.status, 200, `register/options failed: ${JSON.stringify(options.body)}`)

    const verified = await client.json('/auth/register/verify', {
      method: 'POST',
      body: authenticator.register(options.body),
    })
    assert.equal(verified.status, 200, `register/verify failed: ${JSON.stringify(verified.body)}`)

    return { client, authenticator, displayName }
  }

  describe('registration and sign-in', () => {
    test('registers an account with a passkey and reports it signed in', async () => {
      const { client, displayName } = await signUp()

      const me = await client.json('/auth/me')
      assert.equal(me.status, 200)
      assert.equal(me.body.loggedIn, true)
      assert.equal(me.body.displayName, displayName)
      assert.equal(me.body.passkeys.length, 1)
    })

    test('refuses a registration without a display name', async () => {
      const client = createClient(app.baseUrl)
      const { status, body } = await client.json('/auth/register/options', { method: 'POST', body: {} })

      assert.equal(status, 400)
      assert.match(body.error, /display name/i)
    })

    test('refuses a passkey signed for a different origin', async () => {
      const client = createClient(app.baseUrl)
      const impostor = createAuthenticator({ rpId: 'localhost', origin: 'https://evil.example' })

      const options = await client.json('/auth/register/options', {
        method: 'POST',
        body: { displayName: 'Wrong origin' },
      })
      const verified = await client.json('/auth/register/verify', {
        method: 'POST',
        body: impostor.register(options.body),
      })

      assert.equal(verified.status, 400)
    })

    test('signs back in with the same passkey after signing out', async () => {
      const { client, authenticator, displayName } = await signUp()

      assert.equal((await client.json('/auth/logout', { method: 'POST' })).status, 200)
      assert.equal((await client.json('/auth/me')).body.loggedIn, false)

      const options = await client.json('/auth/login/options', { method: 'POST' })
      assert.equal(options.status, 200)

      const verified = await client.json('/auth/login/verify', {
        method: 'POST',
        body: authenticator.authenticate(options.body),
      })
      assert.equal(verified.status, 200, `login/verify failed: ${JSON.stringify(verified.body)}`)
      assert.equal(verified.body.displayName, displayName)

      const me = await client.json('/auth/me')
      assert.equal(me.body.loggedIn, true)
    })

    test('refuses a passkey this instance has never seen', async () => {
      const { client } = await signUp()
      await client.json('/auth/logout', { method: 'POST' })

      const stranger = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
      const options = await client.json('/auth/login/options', { method: 'POST' })
      const verified = await client.json('/auth/login/verify', {
        method: 'POST',
        body: stranger.authenticate(options.body),
      })

      assert.equal(verified.status, 400)
      assert.match(verified.body.error, /not registered/i)
    })
  })

  describe('collections', () => {
    test('creates, lists, renames and deletes a collection', async () => {
      const { client } = await signUp()

      const created = await client.json('/collections', { method: 'POST', body: { name: 'Tutkinnot' } })
      assert.equal(created.status, 200, JSON.stringify(created.body))
      assert.equal(created.body.name, 'Tutkinnot')
      assert.ok(created.body.shareToken)

      const listed = await client.json('/collections')
      assert.equal(listed.status, 200)
      assert.deepEqual(
        listed.body.collections.map((c) => c.name),
        ['Tutkinnot']
      )

      const renamed = await client.json(`/collections/${created.body.id}`, {
        method: 'PATCH',
        body: { name: 'Kurssit' },
      })
      assert.equal(renamed.status, 200, JSON.stringify(renamed.body))
      assert.equal(renamed.body.name, 'Kurssit')

      const deleted = await client.request(`/collections/${created.body.id}`, { method: 'DELETE' })
      assert.equal(deleted.status, 204)
      assert.deepEqual((await client.json('/collections')).body.collections, [])
    })

    test('refuses a collection with no name', async () => {
      const { client } = await signUp()
      const { status } = await client.json('/collections', { method: 'POST', body: { name: '  ' } })

      assert.equal(status, 400)
    })

    test('keeps one account out of another account’s collection', async () => {
      const owner = await signUp()
      const stranger = await signUp()

      const created = await owner.client.json('/collections', { method: 'POST', body: { name: 'Private' } })
      const id = created.body.id

      // Not 403: an id the caller does not own is indistinguishable from one
      // that does not exist, which is the point.
      assert.equal((await stranger.client.json(`/collections/${id}`, { method: 'PATCH', body: { name: 'x' } })).status, 404)
      assert.equal((await stranger.client.request(`/collections/${id}`, { method: 'DELETE' })).status, 404)
      assert.equal(
        (await stranger.client.json(`/collections/${id}/share-token/regenerate`, { method: 'POST' })).status,
        404
      )
      assert.deepEqual((await stranger.client.json('/collections')).body.collections, [])
    })

    test('reports a per-item error rather than failing the whole request', async () => {
      // The happy path needs Koski records in the session, which this suite
      // deliberately does not reach out for; what matters here is that an
      // index with nothing behind it is reported per item, not as a 500.
      const { client } = await signUp()
      const created = await client.json('/collections', { method: 'POST', body: { name: 'Items' } })

      const added = await client.json(`/collections/${created.body.id}/items`, {
        method: 'POST',
        body: { indices: [0] },
      })

      assert.equal(added.status, 200)
      assert.equal(added.body.results.length, 1)
      assert.match(added.body.results[0].error, /Koski/i)
    })
  })

  describe('share links', () => {
    test('serves a collection publicly, with no session', async () => {
      const { client } = await signUp()
      const created = await client.json('/collections', { method: 'POST', body: { name: 'Shared' } })

      const anonymous = createClient(app.baseUrl)
      const res = await anonymous.request(`/c/${created.body.shareToken}`)

      assert.equal(res.status, 200)
      assert.match(await res.text(), /Shared/)
    })

    test('regenerating the token breaks the old link', async () => {
      const { client } = await signUp()
      const created = await client.json('/collections', { method: 'POST', body: { name: 'Rotating' } })
      const oldToken = created.body.shareToken

      const regenerated = await client.json(`/collections/${created.body.id}/share-token/regenerate`, {
        method: 'POST',
      })
      assert.equal(regenerated.status, 200)
      assert.notEqual(regenerated.body.shareToken, oldToken)

      const anonymous = createClient(app.baseUrl)
      assert.equal((await anonymous.request(`/c/${oldToken}`)).status, 404)
      assert.equal((await anonymous.request(`/c/${regenerated.body.shareToken}`)).status, 200)
    })

    test('404s an item that is not in the shared collection', async () => {
      const { client } = await signUp()
      const created = await client.json('/collections', { method: 'POST', body: { name: 'Empty' } })

      const anonymous = createClient(app.baseUrl)
      const res = await anonymous.request(
        `/c/${created.body.shareToken}/items/11111111-2222-3333-4444-555555555555/download`
      )

      assert.equal(res.status, 404)
    })
  })
})
