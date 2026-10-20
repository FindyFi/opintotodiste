import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { createOffer } from '../src/oid4vci.js'
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
