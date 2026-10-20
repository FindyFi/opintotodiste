import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { describe } from 'node:test'

import { createOffer, offerStatuses } from '../src/oid4vci.js'
import { startStubServer } from './helpers/stub-server.js'

const UNSIGNED_CREDENTIAL = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  credentialSubject: { id: 'urn:oid:1.2.3' },
}

const OFFER_RESPONSE = {
  preAuthorizedCode: 'code-123',
  offerUri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffers%2Fcode-123',
  expiresIn: 600,
}

describe('createOffer', () => {
  test('posts the unsigned credential to the issuer instance', async () => {
    const issuer = await startStubServer(() => ({ json: OFFER_RESPONSE }))
    try {
      const offer = await createOffer(UNSIGNED_CREDENTIAL, {
        baseUrl: issuer.url,
        tenant: 'test',
        token: 'coordinator-token',
      })

      const [request] = issuer.requests
      assert.equal(request.method, 'POST')
      assert.equal(request.url, '/instance/test/offers')
      assert.equal(request.headers.authorization, 'Bearer coordinator-token')
      assert.equal(request.body.credentialConfigurationId, 'OpenBadgeCredentialSdJwt')
      assert.deepEqual(request.body.unsignedCredential, UNSIGNED_CREDENTIAL)
      assert.equal(request.body.txCode, false)
      assert.equal('disclosable' in request.body, false)
      assert.deepEqual(offer, OFFER_RESPONSE)
    } finally {
      await issuer.stop()
    }
  })

  test('omits the authorization header when no token is configured', async () => {
    const issuer = await startStubServer(() => ({ json: OFFER_RESPONSE }))
    try {
      await createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test' })
      assert.equal(issuer.requests[0].headers.authorization, undefined)
    } finally {
      await issuer.stop()
    }
  })

  test('uses the configured credential configuration', async () => {
    const issuer = await startStubServer(() => ({ json: OFFER_RESPONSE }))
    try {
      await createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test', credentialConfigurationId: 'Other' })
      assert.equal(issuer.requests[0].body.credentialConfigurationId, 'Other')
    } finally {
      await issuer.stop()
    }
  })

  test('sends the disclosable claims', async () => {
    const issuer = await startStubServer(() => ({ json: OFFER_RESPONSE }))
    try {
      await createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test', disclosable: ['sub', 'identifier'] })
      assert.deepEqual(issuer.requests[0].body.disclosable, ['sub', 'identifier'])
    } finally {
      await issuer.stop()
    }
  })

  test('sends the expiry when there is one, and none otherwise', async () => {
    const issuer = await startStubServer(() => ({ json: OFFER_RESPONSE }))
    try {
      await createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test', validUntil: '2027-06-05T20:59:59.000Z' })
      await createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test' })
      assert.equal(issuer.requests[0].body.validUntil, '2027-06-05T20:59:59.000Z')
      assert.equal('validUntil' in issuer.requests[1].body, false)
    } finally {
      await issuer.stop()
    }
  })

  test('can still request an offer with a transaction code', async () => {
    const issuer = await startStubServer(() => ({ json: OFFER_RESPONSE }))
    try {
      await createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test', txCode: true })
      assert.equal(issuer.requests[0].body.txCode, true)
    } finally {
      await issuer.stop()
    }
  })

  // The body may echo the credential, and the message is logged and shown.
  test('surfaces an issuer failure by status only, without the response body', async () => {
    const issuer = await startStubServer(() => ({ status: 400, text: 'bad claims {"sub":"urn:oid:1.2.3"}' }))
    try {
      await assert.rejects(
        () => createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test' }),
        (err) => /^OID4VCI issuer responded with 400/.test(err.message) && !err.message.includes('urn:oid')
      )
    } finally {
      await issuer.stop()
    }
  })

  test('refuses to call an unconfigured issuer', async () => {
    await assert.rejects(() => createOffer(UNSIGNED_CREDENTIAL, {}), /OID4VCI_ISSUER_URL/)
    await assert.rejects(
      () => createOffer(UNSIGNED_CREDENTIAL, { baseUrl: 'http://localhost:4007' }),
      /OID4VCI_ISSUER_INSTANCE/
    )
  })
})

describe('offerStatuses', () => {
  test('maps the issuer offer status to waiting, picked-up or expired', async () => {
    const issuer = await startStubServer((req) => {
      if (req.url === '/instance/test/offers/a/status') return { json: { used: false } }
      if (req.url === '/instance/test/offers/b/status') return { json: { used: true } }
      return { status: 404, json: { error: 'Offer not found or expired.' } }
    })
    try {
      const statuses = await offerStatuses(['a', 'b', 'c'], { baseUrl: issuer.url, tenant: 'test' })
      assert.deepEqual(statuses, { a: 'waiting', b: 'picked-up', c: 'expired' })
    } finally {
      await issuer.stop()
    }
  })

  test("maps the wallet's notification to stored, failed or declined, and an unknown event to picked-up", async () => {
    const events = {
      accepted: 'credential_accepted',
      failure: 'credential_failure',
      deleted: 'credential_deleted',
      unknown: 'credential_lost',
      proto: 'constructor',
    }
    const issuer = await startStubServer((req) => {
      const [, code] = req.url.match(/^\/instance\/test\/offers\/([^/]+)\/status$/)
      return { json: { used: true, notification: { event: events[code] } } }
    })
    try {
      const statuses = await offerStatuses(Object.keys(events), { baseUrl: issuer.url, tenant: 'test' })
      assert.deepEqual(statuses, {
        accepted: 'stored',
        failure: 'failed',
        deleted: 'declined',
        unknown: 'picked-up',
        proto: 'picked-up',
      })
    } finally {
      await issuer.stop()
    }
  })

  test('fails when the issuer cannot answer', async () => {
    const issuer = await startStubServer(() => ({ status: 500, text: 'down' }))
    try {
      await assert.rejects(() => offerStatuses(['a'], { baseUrl: issuer.url, tenant: 'test' }), /responded with 500/)
    } finally {
      await issuer.stop()
    }
  })
})

describe('the wallet dialog', () => {
  test('has a text for every offer state, in the dictionary', async () => {
    const dialog = await readFile(new URL('../public/wallet-offer.js', import.meta.url), 'utf8')
    const dictionary = JSON.parse(await readFile(new URL('../public/translations.json', import.meta.url), 'utf8'))
    const table = dialog.slice(dialog.indexOf('const STATUS_TEXT = {'), dialog.indexOf('const NEXT = {'))
    for (const state of ['waiting', 'picked-up', 'expired', 'stored', 'failed', 'declined']) {
      assert.match(table, new RegExp(`^    '?${state}'?: \\(\\) =>`, 'm'), state)
    }
    for (const [, fi] of table.matchAll(/lang: 'fi' \}, '([^']+)'\)/g)) assert.ok(dictionary[fi]?.en, fi)
  })
})
