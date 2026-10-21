import assert from 'node:assert/strict'
import test, { after, before, describe } from 'node:test'
import pg from 'pg'

import { createAuthenticator } from './helpers/authenticator.js'
import { createClient, databaseUrl, postgresUnavailable, startApp } from './helpers/app.js'

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
      assert.match(body.error, /Anna näyttönimi/)
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
      assert.match(verified.body.error, /ei ole rekisteröity/)
    })
  })

  describe('collections', () => {
    test('creates, lists, renames and deletes a collection', async () => {
      const { client } = await signUp()

      const created = await client.json('/collections', { method: 'POST', body: { name: 'Tutkinnot' } })
      assert.equal(created.status, 200, JSON.stringify(created.body))
      assert.equal(created.body.name, 'Tutkinnot')

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
      assert.equal((await stranger.client.json(`/share-links?collectionId=${id}`)).status, 404)
      assert.equal(
        (await stranger.client.json('/share-links', { method: 'POST', body: { collectionId: id, label: 'x' } })).status,
        404
      )
      assert.deepEqual((await stranger.client.json('/collections')).body.collections, [])
    })

    test('reports a per-item error rather than failing the whole request', async () => {
      // The happy path needs Koski data, which this suite deliberately does
      // not reach out for; what matters here is that a record ref with nothing
      // behind it is reported per item, not as a 500.
      const { client } = await signUp()
      const created = await client.json('/collections', { method: 'POST', body: { name: 'Items' } })

      const added = await client.json(`/collections/${created.body.id}/items`, {
        method: 'POST',
        body: { refs: ['AAAAAAAAAAAAAAAAAAAAAA'] },
      })

      assert.equal(added.status, 200)
      assert.equal(added.body.results.length, 1)
      assert.match(added.body.results[0].error, /Koski/i)
    })
  })

  describe('saved credentials, collections and share links', () => {
    let db

    before(async () => {
      db = new pg.Client({ connectionString: databaseUrl() })
      await db.connect()
    })

    after(async () => {
      await db?.end()
    })

    // Saving through the API needs Koski records in the session (see
    // journey.test.js); a stored snapshot is all these tests need.
    async function saved(displayName, name = 'Badge') {
      const { rows } = await db.query(
        `INSERT INTO saved_credentials (owner_id, credential)
         SELECT id, $2 FROM users WHERE display_name = $1 RETURNING id`,
        [displayName, { credentialSubject: { achievement: { name } } }]
      )
      return rows[0].id
    }

    async function collectionWith(user, credentialIds, name = 'Hakemus') {
      const created = await user.client.json('/collections', { method: 'POST', body: { name } })
      const added = await user.client.json(`/collections/${created.body.id}/items`, {
        method: 'POST',
        body: { credentialIds },
      })
      assert.equal(added.status, 200)
      assert.ok(added.body.results.every((r) => !r.error), JSON.stringify(added.body))
      return created.body
    }

    async function link(user, target, label = 'Yritys Oy') {
      const created = await user.client.json('/share-links', { method: 'POST', body: { ...target, label } })
      assert.equal(created.status, 200, JSON.stringify(created.body))
      return created.body
    }

    const anonymous = () => createClient(app.baseUrl)

    test('serves a collection publicly through a share link, with no session', async () => {
      const user = await signUp()
      const collection = await collectionWith(user, [await saved(user.displayName, 'Tradenomi')], 'Shared')
      const { path, label } = await link(user, { collectionId: collection.id })
      assert.match(path, /^\/c\/[\w-]{32}$/)
      assert.equal(label, 'Yritys Oy')

      const res = await anonymous().request(path)
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /Shared/)
      assert.match(html, /Tradenomi/)
      assert.match(html, /href="\/employer"/, 'points the employer to the employer page')
    })

    test('gives each recipient a link of their own, and deleting one leaves the others', async () => {
      const user = await signUp()
      const credentialId = await saved(user.displayName)
      const collection = await collectionWith(user, [credentialId])
      const first = await link(user, { collectionId: collection.id }, 'Yritys A')
      const second = await link(user, { collectionId: collection.id }, 'Yritys B')
      assert.notEqual(first.path, second.path)

      const listed = await user.client.json(`/share-links?collectionId=${collection.id}`)
      assert.deepEqual(listed.body.links.map((l) => l.label), ['Yritys B', 'Yritys A'])

      assert.equal((await user.client.request(`/share-links/${first.id}`, { method: 'DELETE' })).status, 204)
      assert.equal((await anonymous().request(first.path)).status, 404)
      assert.equal((await anonymous().request(`${first.path}/items/${credentialId}`)).status, 404)
      assert.equal((await anonymous().request(second.path)).status, 200)
      assert.equal((await anonymous().request(`${second.path}/items/${credentialId}`)).status, 200)
      assert.deepEqual((await user.client.json(`/share-links?collectionId=${collection.id}`)).body.links.map((l) => l.label), ['Yritys B'])
    })

    test('records nothing about who opens a link', async () => {
      const { rows } = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'share_links' ORDER BY column_name"
      )
      assert.deepEqual(rows.map((r) => r.column_name), ['collection_id', 'created_at', 'credential_id', 'id', 'label', 'token'])
    })

    test('shares one credential without any collection', async () => {
      const user = await signUp()
      const credentialId = await saved(user.displayName, 'Yksittäinen')
      const { path } = await link(user, { credentialId })
      assert.match(path, /^\/i\//)

      const page = await anonymous().request(path)
      assert.equal(page.status, 200)
      const html = await page.text()
      assert.match(html, /Yksittäinen/)
      assert.match(html, new RegExp(`href="${path}/download"`))
      assert.ok(html.includes(`href="/verify?url=${encodeURIComponent(`${path}/download`)}"`))

      const download = await anonymous().request(`${path}/download`)
      assert.equal(download.status, 200)
      assert.equal((await download.json()).credentialSubject.achievement.name, 'Yksittäinen')
    })

    test('requires a recipient name, and keeps it short', async () => {
      const user = await signUp()
      const credentialId = await saved(user.displayName)
      for (const label of ['', '   ', 'x'.repeat(101)]) {
        const res = await user.client.json('/share-links', { method: 'POST', body: { credentialId, label } })
        assert.equal(res.status, 400, label)
      }
    })

    test('keeps one account out of another account’s credentials and links', async () => {
      const owner = await signUp()
      const stranger = await signUp()
      const credentialId = await saved(owner.displayName)
      const ownLink = await link(owner, { credentialId })

      assert.equal((await stranger.client.json(`/share-links?credentialId=${credentialId}`)).status, 404)
      assert.equal(
        (await stranger.client.json('/share-links', { method: 'POST', body: { credentialId, label: 'x' } })).status,
        404
      )
      assert.equal((await stranger.client.request(`/share-links/${ownLink.id}`, { method: 'DELETE' })).status, 404)
      assert.equal((await stranger.client.request(`/saved-credentials/${credentialId}`, { method: 'DELETE' })).status, 404)
      assert.deepEqual((await stranger.client.json('/saved-credentials')).body.credentials, [])

      // Nor can a stranger put someone else's credential into their own collection.
      const theirs = await stranger.client.json('/collections', { method: 'POST', body: { name: 'Mine' } })
      const added = await stranger.client.json(`/collections/${theirs.body.id}/items`, {
        method: 'POST',
        body: { credentialIds: [credentialId] },
      })
      assert.match(added.body.results[0].error, /ei löytynyt/)
      assert.equal((await anonymous().request(ownLink.path)).status, 200)
    })

    test('404s an item that is not in the shared collection, and malformed ids', async () => {
      const user = await signUp()
      const outside = await saved(user.displayName)
      const collection = await collectionWith(user, [])
      const { path } = await link(user, { collectionId: collection.id })

      assert.equal((await anonymous().request(`${path}/items/${outside}`)).status, 404)
      assert.equal((await anonymous().request(`${path}/items/${outside}/download`)).status, 404)
      assert.equal((await anonymous().request(`${path}/items/not-a-uuid`)).status, 404)
      assert.equal((await user.client.request('/share-links/not-a-uuid', { method: 'DELETE' })).status, 404)
      assert.equal((await user.client.json('/share-links?credentialId=not-a-uuid')).status, 404)
      assert.equal((await user.client.json('/collections/not-a-uuid/items')).status, 404)
    })

    test('removing a credential from a collection keeps it saved and its own links working', async () => {
      const user = await signUp()
      const credentialId = await saved(user.displayName)
      const collection = await collectionWith(user, [credentialId])
      const collectionLink = await link(user, { collectionId: collection.id })
      const ownLink = await link(user, { credentialId })

      const removed = await user.client.request(`/collections/${collection.id}/items/${credentialId}`, { method: 'DELETE' })
      assert.equal(removed.status, 204)

      assert.deepEqual((await user.client.json(`/collections/${collection.id}/items`)).body.items, [])
      assert.equal((await user.client.json('/saved-credentials')).body.credentials.length, 1)
      assert.equal((await anonymous().request(`${collectionLink.path}/items/${credentialId}`)).status, 404)
      assert.equal((await anonymous().request(collectionLink.path)).status, 200)
      assert.equal((await anonymous().request(ownLink.path)).status, 200)
    })

    test('deleting a saved credential takes it out of every collection and breaks its links', async () => {
      const user = await signUp()
      const credentialId = await saved(user.displayName)
      const kept = await saved(user.displayName, 'Kept')
      const a = await collectionWith(user, [credentialId, kept], 'A')
      const b = await collectionWith(user, [credentialId], 'B')
      const ownLink = await link(user, { credentialId })
      const collectionLink = await link(user, { collectionId: a.id })

      assert.equal((await user.client.request(`/saved-credentials/${credentialId}`, { method: 'DELETE' })).status, 204)

      assert.deepEqual((await user.client.json(`/collections/${a.id}/items`)).body.items.map((i) => i.id), [kept])
      assert.deepEqual((await user.client.json(`/collections/${b.id}/items`)).body.items, [])
      assert.equal((await anonymous().request(ownLink.path)).status, 404)
      assert.equal((await anonymous().request(`${collectionLink.path}/items/${credentialId}`)).status, 404)
      assert.equal((await anonymous().request(`${collectionLink.path}/items/${kept}`)).status, 200)
    })

    test('deleting a collection breaks its links and keeps the credentials', async () => {
      const user = await signUp()
      const credentialId = await saved(user.displayName)
      const collection = await collectionWith(user, [credentialId])
      const { path } = await link(user, { collectionId: collection.id })

      assert.equal((await user.client.request(`/collections/${collection.id}`, { method: 'DELETE' })).status, 204)
      assert.equal((await anonymous().request(path)).status, 404)
      assert.deepEqual((await user.client.json('/saved-credentials')).body.credentials.map((c) => c.id), [credentialId])
    })

    test('adding a credential to a collection twice keeps one copy', async () => {
      const user = await signUp()
      const credentialId = await saved(user.displayName)
      const collection = await collectionWith(user, [credentialId])
      await user.client.json(`/collections/${collection.id}/items`, { method: 'POST', body: { credentialIds: [credentialId] } })

      assert.equal((await user.client.json(`/collections/${collection.id}/items`)).body.items.length, 1)
      assert.equal((await user.client.json('/collections')).body.collections[0].itemCount, 1)
    })

    test('refuses callers who are not signed in', async () => {
      const user = await signUp()
      const credentialId = await saved(user.displayName)
      const collection = await collectionWith(user, [credentialId])
      const client = anonymous()
      assert.equal((await client.json('/saved-credentials')).status, 401)
      assert.equal((await client.json('/saved-credentials', { method: 'POST', body: { refs: [] } })).status, 401)
      assert.equal((await client.request(`/saved-credentials/${credentialId}`, { method: 'DELETE' })).status, 401)
      assert.equal((await client.json(`/share-links?credentialId=${credentialId}`)).status, 401)
      assert.equal((await client.json('/share-links', { method: 'POST', body: { credentialId, label: 'x' } })).status, 401)
      assert.equal(
        (await client.request(`/collections/${collection.id}/items/${credentialId}`, { method: 'DELETE' })).status,
        401
      )
    })
  })

  describe('downloading the account data', () => {
    let db

    before(async () => {
      db = new pg.Client({ connectionString: databaseUrl() })
      await db.connect()
    })

    after(async () => {
      await db?.end()
    })

    async function withData(displayName, badgeName) {
      const { client } = await signUp(displayName)
      const { rows: users } = await db.query('SELECT id FROM users WHERE display_name = $1', [displayName])
      const { rows } = await db.query('INSERT INTO saved_credentials (owner_id, credential) VALUES ($1, $2) RETURNING id', [
        users[0].id,
        { credentialSubject: { achievement: { name: badgeName } } },
      ])
      const credentialId = rows[0].id
      const collection = (await client.json('/collections', { method: 'POST', body: { name: `${badgeName} set` } })).body
      await client.json(`/collections/${collection.id}/items`, { method: 'POST', body: { credentialIds: [credentialId] } })
      const link = (await client.json('/share-links', { method: 'POST', body: { credentialId, label: `${badgeName} link` } })).body
      await db.query('INSERT INTO koski_imports (owner_id, koski_url, data) VALUES ($1, $2, $3)', [
        users[0].id,
        `https://koski.example/${badgeName}`,
        { opiskeluoikeudet: [] },
      ])
      return { client, credentialId, collection, link }
    }

    test('is the user’s own rows as an attachment, and none of another user’s', async () => {
      const mine = await withData('Export Mine', 'MineBadge')
      await withData('Export Other', 'OtherBadge')

      const res = await mine.client.request('/auth/account/export')
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-disposition'), /^attachment/)
      assert.equal(res.headers.get('cache-control'), 'no-store')
      const data = JSON.parse(await res.text())

      assert.equal(data.user.displayName, 'Export Mine')
      assert.equal(data.passkeys.length, 1)
      assert.ok(data.passkeys[0].credentialId && data.passkeys[0].publicKey)
      assert.equal(data.koskiImport.koskiUrl, 'https://koski.example/MineBadge')
      assert.deepEqual(
        data.savedCredentials.map((c) => c.credential.credentialSubject.achievement.name),
        ['MineBadge']
      )
      assert.equal(data.collections.length, 1)
      assert.equal(data.collections[0].name, 'MineBadge set')
      assert.deepEqual(data.collections[0].credentialIds, [mine.credentialId])
      assert.deepEqual(data.shareLinks.map((l) => [l.label, l.token]), [['MineBadge link', mine.link.path.split("/").pop()]])
      assert.ok(!JSON.stringify(data).includes('Other'))
    })

    test('refuses a caller who is not signed in', async () => {
      assert.equal((await createClient(app.baseUrl).request('/auth/account/export')).status, 401)
    })
  })

  describe('deleting the account', () => {
    let db

    before(async () => {
      db = new pg.Client({ connectionString: databaseUrl() })
      await db.connect()
    })

    after(async () => {
      await db?.end()
    })

    async function userIdOf(displayName) {
      const { rows } = await db.query('SELECT id FROM users WHERE display_name = $1', [displayName])
      return rows[0]?.id
    }

    async function count(sql, userId) {
      const { rows } = await db.query(sql, [userId])
      return rows[0].n
    }

    test('deletes the user, passkeys, saved credentials, collections, links and sessions', async () => {
      const { client, authenticator, displayName } = await signUp()
      const userId = await userIdOf(displayName)
      const created = await client.json('/collections', { method: 'POST', body: { name: 'Doomed' } })
      // Saving through the API needs Koski records in the session; a stored
      // snapshot is all the cascade cares about.
      const { rows } = await db.query('INSERT INTO saved_credentials (owner_id, credential) VALUES ($1, $2) RETURNING id', [
        userId,
        { credentialSubject: { achievement: { name: 'Doomed badge' } } },
      ])
      const credentialId = rows[0].id
      await client.json(`/collections/${created.body.id}/items`, { method: 'POST', body: { credentialIds: [credentialId] } })
      const collectionLink = (await client.json('/share-links', { method: 'POST', body: { collectionId: created.body.id, label: 'A' } })).body
      const credentialLink = (await client.json('/share-links', { method: 'POST', body: { credentialId, label: 'B' } })).body
      const anonymous = createClient(app.baseUrl)
      assert.equal((await anonymous.request(`${collectionLink.path}/items/${credentialId}`)).status, 200)
      assert.equal((await anonymous.request(credentialLink.path)).status, 200)

      // A second signed-in browser for the same account.
      const otherBrowser = createClient(app.baseUrl)
      const options = await otherBrowser.json('/auth/login/options', { method: 'POST' })
      await otherBrowser.json('/auth/login/verify', { method: 'POST', body: authenticator.authenticate(options.body) })
      assert.equal((await otherBrowser.json('/auth/me')).body.loggedIn, true)

      const deleted = await client.json('/auth/account', { method: 'DELETE' })
      assert.equal(deleted.status, 200, JSON.stringify(deleted.body))
      assert.equal(deleted.body.passkey.rpId, 'localhost')
      assert.ok(deleted.body.passkey.userId)

      assert.equal(await userIdOf(displayName), undefined)
      assert.equal(await count('SELECT COUNT(*)::int AS n FROM passkey_credentials WHERE user_id = $1', userId), 0)
      assert.equal(await count('SELECT COUNT(*)::int AS n FROM saved_credentials WHERE owner_id = $1', userId), 0)
      assert.equal(await count('SELECT COUNT(*)::int AS n FROM collections WHERE owner_id = $1', userId), 0)
      assert.equal(await count('SELECT COUNT(*)::int AS n FROM collection_items WHERE collection_id = $1', created.body.id), 0)
      assert.equal(
        await count('SELECT COUNT(*)::int AS n FROM share_links WHERE id = ANY($1)', [collectionLink.id, credentialLink.id]),
        0
      )
      assert.equal(await count("SELECT COUNT(*)::int AS n FROM session WHERE sess->>'userId' = $1", userId), 0)

      assert.equal((await anonymous.request(collectionLink.path)).status, 404)
      assert.equal((await anonymous.request(credentialLink.path)).status, 404)
      assert.equal((await client.json('/auth/me')).body.loggedIn, false)
      assert.equal((await otherBrowser.json('/auth/me')).body.loggedIn, false)
      assert.equal((await client.json('/collections')).status, 401)
    })

    test('the deleted passkey no longer signs in', async () => {
      const { client, authenticator } = await signUp()
      await client.json('/auth/account', { method: 'DELETE' })

      const options = await client.json('/auth/login/options', { method: 'POST' })
      const verified = await client.json('/auth/login/verify', {
        method: 'POST',
        body: authenticator.authenticate(options.body),
      })
      assert.equal(verified.status, 400)
      assert.match(verified.body.error, /ei ole rekisteröity/)
    })

    test('leaves other accounts alone', async () => {
      const keeper = await signUp()
      const kept = await keeper.client.json('/collections', { method: 'POST', body: { name: 'Kept' } })
      const keptLink = await keeper.client.json('/share-links', { method: 'POST', body: { collectionId: kept.body.id, label: 'A' } })
      const leaver = await signUp()

      await leaver.client.json('/auth/account', { method: 'DELETE' })

      assert.equal((await keeper.client.json('/auth/me')).body.loggedIn, true)
      assert.equal((await createClient(app.baseUrl).request(keptLink.body.path)).status, 200)
    })

    test('refuses a caller who is not signed in', async () => {
      const { status } = await createClient(app.baseUrl).json('/auth/account', { method: 'DELETE' })
      assert.equal(status, 401)
    })
  })
})
