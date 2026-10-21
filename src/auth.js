import { randomBytes } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { pool } from './db.js'
import { UserError } from './user-error.js'

const PASSKEY_NOT_VERIFIED = 'Pääsyavainta ei voitu varmentaa.'

function rpConfig() {
  const { RP_ID, RP_NAME, ORIGIN } = process.env
  if (!RP_ID || !RP_NAME || !ORIGIN) {
    throw new Error('Passkey auth is not configured (set RP_ID, RP_NAME and ORIGIN).')
  }
  return { rpID: RP_ID, rpName: RP_NAME, origin: ORIGIN }
}

export async function findUserById(userId) {
  const { rows } = await pool.query('SELECT id, display_name FROM users WHERE id = $1', [userId])
  return rows[0] ? { id: rows[0].id, displayName: rows[0].display_name } : null
}

async function findUserCredentials(userId) {
  const { rows } = await pool.query(
    'SELECT credential_id, transports FROM passkey_credentials WHERE user_id = $1',
    [userId]
  )
  return rows.map((r) => ({ id: r.credential_id, transports: r.transports || undefined }))
}

// Starts either a brand-new account registration, or (when the caller is
// already logged in) adding another passkey/device to that same account.
export async function beginRegistration(req, displayName) {
  const { rpID, rpName } = rpConfig()
  const existingUserId = req.session.userId

  let webauthnUserId
  let excludeCredentials = []
  let name = (displayName || '').trim()

  if (existingUserId) {
    const { rows } = await pool.query('SELECT display_name, webauthn_user_id FROM users WHERE id = $1', [
      existingUserId,
    ])
    if (!rows[0]) throw new UserError('Käyttäjää ei löytynyt.', { status: 404 })
    webauthnUserId = rows[0].webauthn_user_id
    name = rows[0].display_name
    excludeCredentials = await findUserCredentials(existingUserId)
  } else {
    if (!name) throw new UserError('Anna näyttönimi.')
    webauthnUserId = randomBytes(32)
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: name,
    userDisplayName: name,
    userID: webauthnUserId,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })

  req.session.pendingRegistration = {
    challenge: options.challenge,
    webauthnUserId: Buffer.from(webauthnUserId).toString('base64'),
    displayName: name,
    userId: existingUserId || null,
  }
  return options
}

export async function completeRegistration(req, response) {
  const pending = req.session.pendingRegistration
  if (!pending) throw new UserError('Rekisteröitymistä ei ole aloitettu. Yritä uudelleen.')
  const { rpID, origin } = rpConfig()

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })
  if (!verification.verified || !verification.registrationInfo) {
    throw new UserError(PASSKEY_NOT_VERIFIED)
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const webauthnUserId = Buffer.from(pending.webauthnUserId, 'base64')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let userId = pending.userId
    if (!userId) {
      const { rows } = await client.query(
        'INSERT INTO users (display_name, webauthn_user_id) VALUES ($1, $2) RETURNING id',
        [pending.displayName, webauthnUserId]
      )
      userId = rows[0].id
    }
    await client.query(
      `INSERT INTO passkey_credentials (credential_id, user_id, public_key, counter, device_type, backed_up, transports)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        credential.id,
        userId,
        Buffer.from(credential.publicKey),
        credential.counter,
        credentialDeviceType,
        credentialBackedUp,
        credential.transports || null,
      ]
    )
    await client.query('COMMIT')

    delete req.session.pendingRegistration
    req.session.userId = userId
    req.session.displayName = pending.displayName
    return { id: userId, displayName: pending.displayName }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Discoverable/usernameless login: allowCredentials is intentionally omitted
// so the browser shows its own passkey picker instead of requiring a typed
// identifier - the picked credential's id is how we resolve the user below.
export async function beginLogin(req) {
  const { rpID } = rpConfig()
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
  req.session.pendingLogin = { challenge: options.challenge }
  return options
}

export async function completeLogin(req, response) {
  const pending = req.session.pendingLogin
  if (!pending) throw new UserError('Kirjautumista ei ole aloitettu. Yritä uudelleen.')
  const { rpID, origin } = rpConfig()

  const { rows } = await pool.query(
    'SELECT credential_id, user_id, public_key, counter, transports FROM passkey_credentials WHERE credential_id = $1',
    [response.id]
  )
  const stored = rows[0]
  if (!stored) throw new UserError('Tätä pääsyavainta ei ole rekisteröity tähän palveluun.')

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: stored.credential_id,
      publicKey: stored.public_key,
      counter: Number(stored.counter),
      transports: stored.transports || undefined,
    },
  })
  if (!verification.verified) throw new UserError(PASSKEY_NOT_VERIFIED)

  await pool.query('UPDATE passkey_credentials SET counter = $1, last_used_at = now() WHERE credential_id = $2', [
    verification.authenticationInfo.newCounter,
    stored.credential_id,
  ])

  const user = await findUserById(stored.user_id)
  delete req.session.pendingLogin
  req.session.userId = user.id
  req.session.displayName = user.displayName
  return user
}

export async function listPasskeys(userId) {
  const { rows } = await pool.query(
    'SELECT credential_id, device_type, created_at, last_used_at FROM passkey_credentials WHERE user_id = $1 ORDER BY created_at',
    [userId]
  )
  return rows.map((r) => ({ id: r.credential_id, deviceType: r.device_type, createdAt: r.created_at, lastUsedAt: r.last_used_at }))
}

// Deletes the account: passkeys and collections (with their items and share
// links) go with the users row through ON DELETE CASCADE. The user's other
// sessions (another browser, another device) are deleted too, so none of them
// stays signed in to an account that no longer exists, or keeps its Koski data.
// Returns what the browser needs to tell its passkey provider the passkey is gone.
export async function deleteAccount(userId) {
  const { rpID } = rpConfig()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Users first: the cascade then locks the tables in the order schema.sql
    // creates their indexes, and session last, as runSchema does. The other
    // way round, an instance booting meanwhile deadlocks with this.
    const { rows } = await client.query('DELETE FROM users WHERE id = $1 RETURNING webauthn_user_id', [userId])
    await client.query("DELETE FROM session WHERE sess->>'userId' = $1", [userId])
    await client.query('COMMIT')
    if (!rows[0]) return null
    return { rpId: rpID, userId: Buffer.from(rows[0].webauthn_user_id).toString('base64url') }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
