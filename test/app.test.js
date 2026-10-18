import assert from 'node:assert/strict'
import test, { after, before, describe } from 'node:test'
import pg from 'pg'

import { databaseUrl, postgresUnavailable, startApp } from './helpers/app.js'

// Reported as skipped rather than failed on a bare clone: the app connects to
// Postgres at import time, so these need `docker compose up -d db` (or CI's
// service container) to be meaningful. node:test treats the mere presence of
// a `skip` key as a skip, so the option is spread in only when there is a
// reason.
const skipReason = await postgresUnavailable()
const needsPostgres = skipReason ? { skip: skipReason } : {}

describe('the running app', needsPostgres, () => {
  let app

  before(async () => {
    app = await startApp()
  })

  after(async () => {
    await app?.stop()
  })

  test('reports healthy', async () => {
    const res = await fetch(`${app.baseUrl}/healthz`)
    assert.equal(res.status, 200)
  })

  test('serves the front page', async () => {
    const res = await fetch(app.baseUrl)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/html/)
  })

  test('links the favicons from the head and serves them', async () => {
    const html = await (await fetch(app.baseUrl)).text()
    for (const href of ['/icons/icon.svg', '/icons/favicon-32.png', '/icons/apple-touch-icon.png']) {
      assert.ok(html.includes(`href="${href}"`), href)
      const res = await fetch(`${app.baseUrl}${href}`)
      assert.equal(res.status, 200, href)
    }
    const logo = await fetch(`${app.baseUrl}/icons/logo-512.png`)
    assert.equal(logo.headers.get('content-type'), 'image/png')
  })

  test('serves the collections page', async () => {
    const res = await fetch(`${app.baseUrl}/my/collections`)
    assert.equal(res.status, 200)
  })

  test('serves the guide pages', async () => {
    for (const name of ['studyinfo', 'wallet', 'sharing']) {
      const res = await fetch(`${app.baseUrl}/guide/${name}`)
      assert.equal(res.status, 200, name)
    }
  })

  // No signing service here: the page still renders, trusting nobody.
  test('serves the verify page with veri-good', async () => {
    const res = await fetch(`${app.baseUrl}/verify`)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /<template id="issuer-dids">\{\}<\/template>/)
    const bundle = await fetch(`${app.baseUrl}/vendor/veri-good/bundle.js`)
    assert.equal(bundle.status, 200)
    assert.match(bundle.headers.get('content-type'), /javascript/)
    assert.equal((await fetch(`${app.baseUrl}/vendor/veri-good/`)).status, 404)
  })

  test('404s an unknown guide', async () => {
    for (const name of ['nope', 'constructor']) {
      const res = await fetch(`${app.baseUrl}/guide/${name}`)
      assert.equal(res.status, 404, name)
    }
  })

  test('requires a sign-in before listing collections', async () => {
    const res = await fetch(`${app.baseUrl}/collections`)
    assert.equal(res.status, 401)
  })

  test('requires a sign-in before creating a collection', async () => {
    const res = await fetch(`${app.baseUrl}/collections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Mine' }),
    })
    assert.equal(res.status, 401)
  })

  test('reports nobody signed in for a fresh session', async () => {
    const res = await fetch(`${app.baseUrl}/auth/me`)
    assert.equal(res.status, 200)
  })

  test('rejects a Koski url pointing somewhere else', async () => {
    const res = await fetch(`${app.baseUrl}/credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ koskiUrl: 'https://evil.example/koski/opinnot/abc' }),
    })
    assert.equal(res.status, 400)
  })

  test('serves the employer page in both languages', async () => {
    const res = await fetch(`${app.baseUrl}/employer`)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<div lang="fi" class="employer-body">/)
    assert.match(html, /<div lang="en" class="employer-body">/)
    assert.match(html, /href="https:\/\/osaaja\.todiste\.fi\/"/)
    assert.match(html, /href="https:\/\/findynet\.fi\/yhteys\/"/)
    assert.match(html, /<a href="\/employer" aria-current="page">/, 'marks the header link as the current page')
  })

  test('serves the policy page in both languages', async () => {
    const res = await fetch(`${app.baseUrl}/policy`)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<article lang="fi">/)
    assert.match(html, /<article lang="en">/)
  })

  test('404s an unknown shared collection', async () => {
    const res = await fetch(`${app.baseUrl}/c/not-a-real-token`)
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', 'share links stay out of search engines')
  })
})

describe('schema bootstrapping', needsPostgres, () => {
  test('creates its tables on startup', async () => {
    const app = await startApp()
    const client = new pg.Client({ connectionString: databaseUrl() })

    try {
      await client.connect()
      const { rows } = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
      )
      const tables = rows.map((r) => r.table_name)

      for (const expected of ['users', 'passkey_credentials', 'collections', 'collection_items']) {
        assert.ok(tables.includes(expected), `expected table ${expected}, saw ${tables.join(', ')}`)
      }
    } finally {
      await client.end().catch(() => {})
      await app.stop()
    }
  })

  test('is safe to run again against an existing database', async () => {
    // schema.sql is all IF NOT EXISTS; a second boot must not fail.
    const app = await startApp()
    await app.stop()
  })
})

describe('startup validation', () => {
  test('refuses to start without DATABASE_URL', async () => {
    await assert.rejects(
      () => startApp({ env: { DATABASE_URL: '' } }),
      /Postgres is not configured/
    )
  })
})
