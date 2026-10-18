import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { after, before, describe } from 'node:test'
import pg from 'pg'

import { databaseUrl, postgresUnavailable, startApp } from './helpers/app.js'
import { startStubServer } from './helpers/stub-server.js'

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

  // Not a did:key's absence (that's a 404): we can't tell what the issuer is.
  test('answers 503 for did.json without a signing service', async () => {
    assert.equal((await fetch(`${app.baseUrl}/.well-known/did.json`)).status, 503)
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

  test('404s an unknown shared collection or credential', async () => {
    for (const path of ['/c/not-a-real-token', '/i/not-a-real-token', '/i/not-a-real-token/download']) {
      const res = await fetch(`${app.baseUrl}${path}`)
      assert.equal(res.status, 404, path)
      assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', 'share links stay out of search engines')
    }
  })
})

describe("the ldp_vc issuer's did.json", needsPostgres, () => {
  const KEY = 'z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q'
  let app
  let signer

  // Like signing-service with TENANT_DIDMETHOD_<T>=web and TENANT_DID_URL_<T>=https://opinto.example.
  before(async () => {
    signer = await startStubServer(({ body }) => ({
      json: { ...body, issuer: 'did:web:opinto.example', proof: { verificationMethod: `did:web:opinto.example#${KEY}` } },
    }))
    app = await startApp({
      env: { ORIGIN: 'https://opinto.example', SIGNING_SERVICE_URL: signer.url, SIGNING_SERVICE_INSTANCE_ID: 'test', SIGNING_SERVICE_SUITE: 'ed25519' },
    })
  })

  after(async () => {
    await app?.stop()
    await signer?.stop()
  })

  test('is served for any verifier, naming the signing key', async () => {
    const res = await fetch(`${app.baseUrl}/.well-known/did.json`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/json/)
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
    const doc = await res.json()
    assert.equal(doc.id, 'did:web:opinto.example')
    assert.deepEqual(doc.assertionMethod, [`did:web:opinto.example#${KEY}`])
    assert.equal(doc.verificationMethod[0].publicKeyMultibase, KEY)
  })

  test('makes /verify trust the did:web and the did:key of the same key', async () => {
    const html = await (await fetch(`${app.baseUrl}/verify`)).text()
    assert.ok(html.includes('did:web:opinto.example'))
    assert.ok(html.includes(`did:key:${KEY}`))
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

      for (const expected of ['users', 'passkey_credentials', 'collections', 'saved_credentials', 'collection_items', 'share_links']) {
        assert.ok(tables.includes(expected), `expected table ${expected}, saw ${tables.join(', ')}`)
      }
    } finally {
      await client.end().catch(() => {})
      await app.stop()
    }
  })

  test('moves pre-U9 collection items into saved credentials, keeping their ids', async () => {
    // A schema of its own, so the shared test database is left alone.
    const client = new pg.Client({ connectionString: databaseUrl() })
    const schema = `u9_migration_${process.pid}`
    const user = '00000000-0000-0000-0000-000000000001'
    const collection = '00000000-0000-0000-0000-0000000000c1'
    const item = '00000000-0000-0000-0000-0000000000a1'
    try {
      await client.connect()
      await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`)
      // The tables as they were before U9 (only what the migration touches).
      await client.query(`
        CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), display_name TEXT NOT NULL,
          webauthn_user_id BYTEA NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
        CREATE TABLE collections (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
          share_token TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
        CREATE TABLE collection_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
          credential JSONB NOT NULL, added_at TIMESTAMPTZ NOT NULL DEFAULT now());
        INSERT INTO users (id, display_name, webauthn_user_id) VALUES ('${user}', 'Old', '\\x01');
        INSERT INTO collections (id, owner_id, name, share_token) VALUES ('${collection}', '${user}', 'Old', 'tok');
        INSERT INTO collection_items (id, collection_id, credential) VALUES ('${item}', '${collection}', '{"old": true}');
      `)
      const schemaSql = await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8')
      await client.query(schemaSql)
      await client.query(schemaSql)

      const { rows: saved } = await client.query('SELECT id, owner_id, credential FROM saved_credentials')
      assert.deepEqual(saved, [{ id: item, owner_id: user, credential: { old: true } }])
      const { rows: items } = await client.query('SELECT collection_id, credential_id FROM collection_items')
      assert.deepEqual(items, [{ collection_id: collection, credential_id: item }])
      const { rows: columns } = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'collections'`,
        [schema]
      )
      assert.ok(!columns.some((c) => c.column_name === 'share_token'))
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
      await client.end().catch(() => {})
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
