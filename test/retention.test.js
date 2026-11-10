import assert from 'node:assert/strict'
import test, { after, before, describe } from 'node:test'
import pg from 'pg'

import { createAuthenticator } from './helpers/authenticator.js'
import { createClient, databaseUrl, postgresUnavailable, startApp } from './helpers/app.js'
import { deleteUnusedAccounts, RETENTION_LOCK_KEY } from '../src/retention.js'

const skipReason = await postgresUnavailable()
const needsPostgres = skipReason ? { skip: skipReason } : {}

describe('deleting accounts unused for over 6 months', needsPostgres, () => {
  let app
  let pool

  before(async () => {
    app = await startApp()
    pool = new pg.Pool({ connectionString: databaseUrl() })
  })

  after(async () => {
    await app?.stop()
    await pool?.end()
  })

  async function signUp() {
    const client = createClient(app.baseUrl)
    const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
    const options = await client.json('/auth/register/options', {
      method: 'POST',
      body: { displayName: `Retention ${Math.random().toString(36).slice(2, 8)}` },
    })
    const verified = await client.json('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })
    assert.equal(verified.status, 200)
    const { rows } = await pool.query('SELECT id FROM users WHERE display_name = $1', [options.body.user.name])
    return { client, userId: rows[0].id }
  }

  /** Moves the account's passkey and user timestamps `months` back; lastUsed false leaves last_used_at null. */
  async function age(userId, months, { lastUsed = true } = {}) {
    const then = `now() - make_interval(months => ${months})`
    await pool.query(`UPDATE users SET created_at = ${then} WHERE id = $1`, [userId])
    await pool.query(`UPDATE passkey_credentials SET created_at = ${then}, last_used_at = ${lastUsed ? then : 'NULL'} WHERE user_id = $1`, [userId])
  }

  // Every app start (each test file starts one) runs the sweep too, so another
  // sweep may hold the lock (deleteUnusedAccounts returns null) or may already
  // have deleted the account this test aged. Retry until this sweep runs, and
  // check the accounts rather than the count.
  async function sweep() {
    for (let attempt = 0; attempt < 50; attempt++) {
      const count = await deleteUnusedAccounts(pool)
      if (count !== null) return count
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error('Another sweep held the lock for over a second')
  }

  const exists = async (userId) => (await pool.query('SELECT 1 FROM users WHERE id = $1', [userId])).rowCount === 1

  test('deletes an account last signed in 7 months ago with its collections and sessions, and keeps a recent one', async () => {
    const old = await signUp()
    const recent = await signUp()
    const created = await old.client.json('/collections', { method: 'POST', body: { name: 'Old' } })
    assert.equal(created.status, 200)
    await age(old.userId, 7)
    await age(recent.userId, 5)

    await sweep()

    assert.equal(await exists(old.userId), false)
    assert.equal((await pool.query('SELECT 1 FROM collections WHERE owner_id = $1', [old.userId])).rowCount, 0)
    assert.equal((await pool.query('SELECT 1 FROM passkey_credentials WHERE user_id = $1', [old.userId])).rowCount, 0)
    assert.equal((await pool.query("SELECT 1 FROM session WHERE sess->>'userId' = $1", [old.userId])).rowCount, 0)
    assert.equal((await old.client.json('/auth/me')).body.loggedIn, false)
    assert.equal(await exists(recent.userId), true)
    assert.equal((await recent.client.json('/auth/me')).body.loggedIn, true)
  })

  test('counts a never-used passkey from its created_at', async () => {
    const stale = await signUp()
    const fresh = await signUp()
    await age(stale.userId, 7, { lastUsed: false })

    await sweep()

    assert.equal(await exists(stale.userId), false)
    assert.equal(await exists(fresh.userId), true)
  })

  test('a recent sign-in on any passkey keeps the account', async () => {
    const account = await signUp()
    await age(account.userId, 8)
    await pool.query('UPDATE passkey_credentials SET last_used_at = now() WHERE user_id = $1', [account.userId])

    await sweep()

    assert.equal(await exists(account.userId), true)
  })

  test('an account with no passkeys counts from its own created_at', async () => {
    const { rows } = await pool.query(
      "INSERT INTO users (display_name, webauthn_user_id, created_at) VALUES ('NoKey', decode(md5(random()::text), 'hex'), now() - interval '7 months') RETURNING id"
    )
    await sweep()
    assert.equal(await exists(rows[0].id), false)
  })
})

describe('the sweep lock', needsPostgres, () => {
  test('a sweep that finds the lock taken returns null and deletes nothing', async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl() })
    const holder = await pool.connect()
    try {
      // Lock first, so no other file's sweep can delete the account in between.
      await holder.query('BEGIN')
      await holder.query('SELECT pg_advisory_xact_lock($1::bigint)', [RETENTION_LOCK_KEY])
      const { rows } = await pool.query(
        "INSERT INTO users (display_name, webauthn_user_id, created_at) VALUES ('Locked', decode(md5(random()::text), 'hex'), now() - interval '7 months') RETURNING id"
      )
      assert.equal(await deleteUnusedAccounts(pool), null)
      assert.equal((await pool.query('SELECT 1 FROM users WHERE id = $1', [rows[0].id])).rowCount, 1)
      await holder.query('ROLLBACK')
      await pool.query('DELETE FROM users WHERE id = $1', [rows[0].id])
    } finally {
      holder.release()
      await pool.end()
    }
  })
})
