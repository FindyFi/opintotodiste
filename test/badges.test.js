import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { signCredential, toVerifiableCredential } from '../src/badges.js'
import { startStubServer } from './helpers/stub-server.js'

const RECORD = {
  credentialSubject: { type: ['AchievementSubject'], id: 'urn:oid:1.2.3' },
  awardedOn: '2021-06-01',
}

const ISSUER = { issuerId: 'did:web:example.org', issuerName: 'Example Issuer' }

describe('toVerifiableCredential', () => {
  test('wraps the subject in an unsigned Open Badges 3.0 credential', () => {
    const vc = toVerifiableCredential(RECORD, ISSUER)

    assert.deepEqual(vc['@context'], [
      'https://www.w3.org/2018/credentials/v1',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ])
    assert.deepEqual(vc.type, ['VerifiableCredential', 'OpenBadgeCredential'])
    assert.deepEqual(vc.credentialSubject, RECORD.credentialSubject)
    assert.deepEqual(vc.issuer, { id: 'did:web:example.org', type: ['Profile'], name: 'Example Issuer' })
    assert.ok(!('proof' in vc), 'the credential must still be unsigned')
  })

  test('gives every credential its own uuid', () => {
    const a = toVerifiableCredential(RECORD, ISSUER)
    const b = toVerifiableCredential(RECORD, ISSUER)

    assert.match(a.id, /^urn:uuid:[0-9a-f-]{36}$/)
    assert.notEqual(a.id, b.id)
  })

  test('uses the award date as the issuance date', () => {
    const vc = toVerifiableCredential(RECORD, ISSUER)
    assert.equal(vc.issuanceDate, new Date('2021-06-01').toISOString())
  })

  test('falls back to now when the record has no award date', () => {
    const before = Date.now()
    const vc = toVerifiableCredential({ credentialSubject: {} }, ISSUER)
    const issued = new Date(vc.issuanceDate).getTime()

    assert.ok(issued >= before && issued <= Date.now())
  })

  test('refuses to build a credential with no configured issuer', () => {
    assert.throws(() => toVerifiableCredential(RECORD, {}), /ISSUER_ID/)
  })
})

describe('signCredential', () => {
  test('posts the credential to the configured instance and suite', async () => {
    const signer = await startStubServer(({ body }) => ({ json: { ...body, proof: { type: 'Ed25519Signature2020' } } }))
    try {
      const vc = toVerifiableCredential(RECORD, ISSUER)
      const signed = await signCredential(vc, { baseUrl: signer.url, instanceId: 'test' })

      assert.equal(signer.requests[0].method, 'POST')
      assert.equal(signer.requests[0].url, '/instance/test/credentials/sign?suite=ed25519')
      assert.deepEqual(signer.requests[0].body, vc)
      assert.ok(signed.proof)
    } finally {
      await signer.stop()
    }
  })

  test('honours a non-default suite', async () => {
    const signer = await startStubServer(({ body }) => ({ json: body }))
    try {
      await signCredential({}, { baseUrl: signer.url, instanceId: 'test', suite: 'eddsa-rdfc-2022' })
      assert.equal(signer.requests[0].url, '/instance/test/credentials/sign?suite=eddsa-rdfc-2022')
    } finally {
      await signer.stop()
    }
  })

  test('surfaces a signing failure with the service response', async () => {
    const signer = await startStubServer(() => ({ status: 500, text: 'no key for instance' }))
    try {
      await assert.rejects(
        () => signCredential({}, { baseUrl: signer.url, instanceId: 'test' }),
        /Signing service responded with 500.*no key for instance/s
      )
    } finally {
      await signer.stop()
    }
  })

  test('refuses to call an unconfigured signing service', async () => {
    await assert.rejects(() => signCredential({}, {}), /SIGNING_SERVICE_URL/)
    await assert.rejects(() => signCredential({}, { baseUrl: 'http://localhost:4006' }), /SIGNING_SERVICE_INSTANCE_ID/)
  })
})
