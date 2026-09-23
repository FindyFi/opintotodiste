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
  txCode: '12345',
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
      assert.equal(request.body.credentialConfigurationId, 'OpenBadgeCredential')
      assert.deepEqual(request.body.unsignedCredential, UNSIGNED_CREDENTIAL)
      assert.equal(request.body.txCode, true)
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

  test('can request an offer without a transaction code', async () => {
    const issuer = await startStubServer(() => ({ json: OFFER_RESPONSE }))
    try {
      await createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test', txCode: false })
      assert.equal(issuer.requests[0].body.txCode, false)
    } finally {
      await issuer.stop()
    }
  })

  test('surfaces an issuer failure with its response', async () => {
    const issuer = await startStubServer(() => ({ status: 401, text: 'unauthorized' }))
    try {
      await assert.rejects(
        () => createOffer(UNSIGNED_CREDENTIAL, { baseUrl: issuer.url, tenant: 'test' }),
        /OID4VCI issuer responded with 401.*unauthorized/s
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
