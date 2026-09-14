import { randomBytes } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { pool } from './db.js'

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
    if (!rows[0]) throw new Error('User not found.')
    webauthnUserId = rows[0].webauthn_user_id
    name = rows[0].display_name
    excludeCredentials = await findUserCredentials(existingUserId)
  } else {
    if (!name) throw new Error('Please enter a display name.')
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
  if (!pending) throw new Error('No registration in progress. Please try again.')
  const { rpID, origin } = rpConfig()

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('The passkey could not be verified.')
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
  if (!pending) throw new Error('No sign-in in progress. Please try again.')
  const { rpID, origin } = rpConfig()

  const { rows } = await pool.query(
    'SELECT credential_id, user_id, public_key, counter, transports FROM passkey_credentials WHERE credential_id = $1',
    [response.id]
  )
  const stored = rows[0]
  if (!stored) throw new Error('This passkey is not registered here.')

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
  if (!verification.verified) throw new Error('The passkey could not be verified.')

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
