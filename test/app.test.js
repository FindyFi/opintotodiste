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

  test('serves the collections page', async () => {
    const res = await fetch(`${app.baseUrl}/my/collections`)
    assert.equal(res.status, 200)
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

  test('404s an unknown shared collection', async () => {
    const res = await fetch(`${app.baseUrl}/c/not-a-real-token`)
    assert.equal(res.status, 404)
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
