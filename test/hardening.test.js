import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { after, before, describe } from 'node:test'
import pg from 'pg'

import { createAuthenticator } from './helpers/authenticator.js'
import { createClient, databaseUrl, postgresUnavailable, startApp } from './helpers/app.js'

// H3 (docs/threat-analysis.md T8, T9, T12): headers, list indices, session
// ids on sign-in, the session cookie, "clear my data", the idle lifetime of
// imported Koski data, and rate limits.
const skipReason = await postgresUnavailable()
const needsPostgres = skipReason ? { skip: skipReason } : {}

const FIXTURE = new URL('./fixtures/koski-sample.json', import.meta.url).pathname
const KOSKI_URL = 'https://opintopolku.fi/koski/opinnot/abc123'

async function withDb(fn) {
  const db = new pg.Client({ connectionString: databaseUrl() })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

// express-session saves a new session while the body is still being sent, so
// read it all before the next request, as the browser code does.
async function importFor(client) {
  const res = await client.request('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang: 'fi' } })
  await res.text()
  return res
}

function sessionCookie(res) {
  return res.headers.getSetCookie().find((cookie) => /^(connect\.sid|__Host-sid)=/.test(cookie))
}

describe('hardening', needsPostgres, () => {
  let app

  before(async () => {
    app = await startApp({ koskiFixture: FIXTURE })
  })

  after(async () => {
    await app?.stop()
  })

  async function load(client, koskiUrl = KOSKI_URL) {
    const res = await client.json('/credentials', { method: 'POST', body: { koskiUrl, lang: 'fi' } })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    return res.body
  }

  test('sends the security headers on pages and static files', async () => {
    for (const path of ['/', '/app.js', '/c/unknown']) {
      const res = await fetch(`${app.baseUrl}${path}`)
      const csp = res.headers.get('content-security-policy') ?? ''
      for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"]) {
        assert.ok(csp.includes(directive), `${path}: ${directive}`)
      }
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path)
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path)
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path)
    }
  })

  test('keeps the main page, with the imported records in it, out of the cache', async () => {
    const res = await fetch(app.baseUrl)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  test('accepts only plain non-negative integers as list positions', async () => {
    const client = createClient(app.baseUrl)
    await load(client)
    for (const index of ['__proto__', 'constructor', 'length', '-1', '1.5', '0x0', '1e0']) {
      for (const action of ['sign', 'offer']) {
        const res = await client.json(`/credentials/${index}/${action}`, { method: 'POST' })
        assert.equal(res.status, 404, `${action} ${index}`)
      }
      assert.equal((await client.request(`/credentials/${index}/download`)).status, 404, `download ${index}`)
    }
  })

  test('gives the session a new id on registration and sign-in, keeping the Koski data', async () => {
    const client = createClient(app.baseUrl)
    const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
    const before = sessionCookie(await importFor(client))
    assert.ok(before, 'expected an anonymous session cookie')
    const options = await client.json('/auth/register/options', { method: 'POST', body: { displayName: 'Fixation' } })
    const registered = await client.request('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })
    assert.equal(registered.status, 200)
    await registered.text()
    const afterRegistration = sessionCookie(registered)
    assert.ok(afterRegistration, 'expected a new session cookie')
    assert.notEqual(afterRegistration.split(';')[0], before.split(';')[0])

    // The planted (old) id is worth nothing now.
    const planted = await fetch(`${app.baseUrl}/auth/me`, { headers: { cookie: before.split(';')[0] } })
    assert.equal((await planted.json()).loggedIn, false)
    assert.equal((await client.json('/auth/me')).body.loggedIn, true)
    assert.equal((await client.json('/credentials/lang', { method: 'POST', body: { lang: 'fi' } })).status, 200)

    client.forget()
    const anonymous = sessionCookie(await importFor(client))
    assert.ok(anonymous, 'expected an anonymous session cookie')
    const loginOptions = await client.json('/auth/login/options', { method: 'POST' })
    const login = await client.request('/auth/login/verify', { method: 'POST', body: authenticator.authenticate(loginOptions.body) })
    assert.equal(login.status, 200)
    await login.text()
    assert.notEqual(sessionCookie(login)?.split(';')[0], anonymous.split(';')[0])
    assert.equal((await client.json('/auth/me')).body.loggedIn, true)
    assert.equal((await client.json('/credentials/lang', { method: 'POST', body: { lang: 'fi' } })).status, 200)
  })

  test('"clear my data" ends an anonymous session', async () => {
    const koskiUrl = `https://opintopolku.fi/koski/opinnot/clear-${randomUUID()}`
    const client = createClient(app.baseUrl)
    await load(client, koskiUrl)

    assert.match(await (await client.request('/')).text(), /<html lang="fi" data-auth="out">/)
    const cleared = await client.request('/credentials', { method: 'DELETE' })
    assert.equal(cleared.status, 200)
    assert.match(sessionCookie(cleared) ?? '', /Expires=Thu, 01 Jan 1970/)

    assert.equal((await client.json('/credentials/lang', { method: 'POST', body: { lang: 'fi' } })).status, 404)
    assert.match(await (await client.request('/')).text(), /__INITIAL_DATA__ = null/)
    const rows = await withDb((db) => db.query(`SELECT 1 FROM session WHERE sess->>'koskiUrl' = $1`, [koskiUrl]))
    assert.equal(rows.rowCount, 0)
  })

  test('"clear my data" keeps a signed-in user signed in', async () => {
    const client = createClient(app.baseUrl)
    const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
    const options = await client.json('/auth/register/options', { method: 'POST', body: { displayName: 'Clearer' } })
    await client.json('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })
    await load(client)

    // The page hides the button from signed-in users; the route still works.
    assert.match(await (await client.request('/')).text(), /<html lang="fi" data-auth="in">/)
    assert.equal((await client.json('/credentials', { method: 'DELETE' })).status, 200)
    assert.equal((await client.json('/credentials/lang', { method: 'POST', body: { lang: 'fi' } })).status, 404)
    assert.equal((await client.json('/auth/me')).body.loggedIn, true)
  })

  test('drops imported Koski data after an hour without requests', async () => {
    const koskiUrl = `https://opintopolku.fi/koski/opinnot/idle-${randomUUID()}`
    const client = createClient(app.baseUrl)
    await load(client, koskiUrl)
    assert.equal((await client.json('/credentials/lang', { method: 'POST', body: { lang: 'en' } })).status, 200)

    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    await withDb((db) =>
      db.query(`UPDATE session SET sess = jsonb_set(sess::jsonb, '{koskiSeenAt}', to_jsonb($2::bigint))::json WHERE sess->>'koskiUrl' = $1`, [
        koskiUrl,
        twoHoursAgo,
      ])
    )

    assert.equal((await client.json('/credentials/lang', { method: 'POST', body: { lang: 'fi' } })).status, 404)
    const rows = await withDb((db) => db.query(`SELECT 1 FROM session WHERE sess->>'koskiUrl' = $1`, [koskiUrl]))
    assert.equal(rows.rowCount, 0)
  })
})

// A separate instance: an HTTPS origin behind the load balancer, and its own
// rate-limit counters.
describe('hardening behind an HTTPS load balancer', needsPostgres, () => {
  let app

  before(async () => {
    app = await startApp({ koskiFixture: FIXTURE, env: { ORIGIN: 'https://opintotodiste.example', RP_ID: 'opintotodiste.example' } })
  })

  after(async () => {
    await app?.stop()
  })

  test('sets a Secure, __Host- prefixed, SameSite=Lax session cookie', async () => {
    const res = await fetch(`${app.baseUrl}/auth/login/options`, { method: 'POST', headers: { 'x-forwarded-proto': 'https' } })
    assert.equal(res.status, 200)
    const cookie = sessionCookie(res) ?? ''
    assert.match(cookie, /^__Host-sid=/)
    for (const attribute of [/; Path=\//, /; HttpOnly/, /; Secure/, /; SameSite=Lax/]) assert.match(cookie, attribute)
    assert.doesNotMatch(cookie, /; Domain=/)
  })

  test('never sends that cookie over plain HTTP', async () => {
    const res = await fetch(`${app.baseUrl}/auth/login/options`, { method: 'POST' })
    assert.equal(sessionCookie(res), undefined)
  })

  test('limits passkey challenges and Koski imports per client', async () => {
    // Its own address, as the load balancer would report it.
    const headers = { 'x-forwarded-for': '203.0.113.7', 'content-type': 'application/json' }
    let last
    for (let i = 0; i <= 100; i++) last = await fetch(`${app.baseUrl}/auth/login/options`, { method: 'POST', headers })
    assert.equal(last.status, 429)
    assert.ok(Number(last.headers.get('retry-after')) > 0)

    const body = JSON.stringify({ koskiUrl: KOSKI_URL })
    for (let i = 0; i <= 60; i++) last = await fetch(`${app.baseUrl}/credentials`, { method: 'POST', headers, body })
    assert.equal(last.status, 429)
    assert.match((await last.json()).error, /Too many requests/)

    // Another client is not affected.
    const other = await fetch(`${app.baseUrl}/credentials`, { method: 'POST', headers: { ...headers, 'x-forwarded-for': '203.0.113.8' }, body })
    assert.equal(other.status, 200)
  })
})
