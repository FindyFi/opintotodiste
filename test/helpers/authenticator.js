import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto'

// A virtual WebAuthn authenticator, enough to drive this app's passkey
// registration and login over HTTP.
//
// The alternative is a real browser with a virtual authenticator, which means
// a browser dependency and a driver. The ceremonies are small and fully
// specified, so it is cheaper to produce the two response shapes directly -
// and it keeps the whole suite runnable with `node --test` and no extra
// dependency. @simplewebauthn/server verifies these the same as a real one.

const b64url = (buf) => Buffer.from(buf).toString('base64url')

// --- Minimal CBOR encoder --------------------------------------------------
// Only the few types an attestation object needs: small maps, text keys,
// byte strings and the integers in a COSE key. Not general-purpose.

function head(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length])
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length])
  if (length < 0x10000) return Buffer.from([(major << 5) | 25, length >> 8, length & 0xff])
  throw new Error(`CBOR length ${length} is larger than this encoder supports`)
}

const cborUint = (n) => head(0, n)
const cborNegative = (n) => head(1, -1 - n) // CBOR stores -1-n for negative n
const cborBytes = (b) => Buffer.concat([head(2, b.length), Buffer.from(b)])
const cborText = (s) => Buffer.concat([head(3, Buffer.byteLength(s)), Buffer.from(s, 'utf8')])

// entries: [encodedKey, encodedValue][] - already-encoded, so the caller
// controls key types (COSE keys use integer keys, attestation uses text).
const cborMap = (entries) =>
  Buffer.concat([head(5, entries.length), ...entries.map(([k, v]) => Buffer.concat([k, v]))])

// --- Authenticator ---------------------------------------------------------

const FLAG_USER_PRESENT = 0x01
const FLAG_USER_VERIFIED = 0x04
const FLAG_ATTESTED_CREDENTIAL_DATA = 0x40

function coseEs256PublicKey(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' })
  return cborMap([
    [cborUint(1), cborUint(2)], // kty: EC2
    [cborUint(3), cborNegative(-7)], // alg: ES256
    [cborNegative(-1), cborUint(1)], // crv: P-256
    [cborNegative(-2), cborBytes(Buffer.from(jwk.x, 'base64url'))],
    [cborNegative(-3), cborBytes(Buffer.from(jwk.y, 'base64url'))],
  ])
}

function authenticatorData({ rpId, flags, signCount, attestedCredentialData }) {
  const counter = Buffer.alloc(4)
  counter.writeUInt32BE(signCount)
  return Buffer.concat([
    createHash('sha256').update(rpId).digest(),
    Buffer.from([flags]),
    counter,
    ...(attestedCredentialData ? [attestedCredentialData] : []),
  ])
}

function clientData(type, challenge, origin) {
  // Key order matters only in that it must be stable: the signature is over
  // the bytes, and the server hashes the same bytes it received.
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }), 'utf8')
}

/**
 * Creates one virtual authenticator holding a single credential. `origin` and
 * `rpId` have to match what the app is configured with, or verification fails
 * exactly as it would for a real device pointed at the wrong site.
 */
export function createAuthenticator({ rpId = 'localhost', origin = 'http://localhost:3000' } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const credentialId = randomBytes(32)
  let signCount = 0

  return {
    credentialId: b64url(credentialId),

    /** Answers a `navigator.credentials.create()` challenge. */
    register(options) {
      const attestedCredentialData = Buffer.concat([
        Buffer.alloc(16), // AAGUID: all-zero, as attestationType 'none' implies
        Buffer.from([credentialId.length >> 8, credentialId.length & 0xff]),
        credentialId,
        coseEs256PublicKey(publicKey),
      ])

      const authData = authenticatorData({
        rpId,
        flags: FLAG_USER_PRESENT | FLAG_USER_VERIFIED | FLAG_ATTESTED_CREDENTIAL_DATA,
        signCount: signCount++,
        attestedCredentialData,
      })

      const attestationObject = cborMap([
        [cborText('fmt'), cborText('none')],
        [cborText('attStmt'), cborMap([])],
        [cborText('authData'), cborBytes(authData)],
      ])

      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientData('webauthn.create', options.challenge, origin)),
          attestationObject: b64url(attestationObject),
          transports: ['internal'],
        },
      }
    },

    /** Answers a `navigator.credentials.get()` challenge. */
    authenticate(options) {
      const authData = authenticatorData({
        rpId,
        flags: FLAG_USER_PRESENT | FLAG_USER_VERIFIED,
        signCount: ++signCount,
      })
      const clientDataJSON = clientData('webauthn.get', options.challenge, origin)

      const signature = createSign('sha256')
        .update(Buffer.concat([authData, createHash('sha256').update(clientDataJSON).digest()]))
        .sign(privateKey)

      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientDataJSON),
          authenticatorData: b64url(authData),
          signature: b64url(signature),
        },
      }
    },
  }
}
