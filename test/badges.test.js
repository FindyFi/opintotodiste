import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { recordFromCredential, sdJwtVcDisclosable, signCredential, toSdJwtVcClaims, toVcdm2Credential, toVerifiableCredential } from '../src/badges.js'
import { startStubServer } from './helpers/stub-server.js'

const RECORD = {
  credentialSubject: { type: ['AchievementSubject'], id: 'urn:oid:1.2.3' },
  awardedOn: '2021-06-01',
}

const ISSUER = { issuerId: 'did:web:example.org', issuerName: 'Example Issuer' }

describe('toSdJwtVcClaims', () => {
  const VCT = 'https://issuer.example/vct/OpenBadgeCredential'
  const achievement = {
    id: 'urn:x:a',
    type: ['Achievement'],
    name: 'A',
    creator: { id: 'urn:x:c', type: ['Profile'], name: 'C' },
  }

  test('builds flat SD-JWT VC claims without JSON-LD', () => {
    const claims = toSdJwtVcClaims({ ...RECORD, credentialSubject: { ...RECORD.credentialSubject, achievement } }, { vct: VCT })
    assert.deepEqual(claims, {
      vct: VCT,
      sub: 'urn:oid:1.2.3',
      awardedDate: '2021-06-01T00:00:00.000Z',
      achievement: { id: 'urn:x:a', name: 'A', creator: { id: 'urn:x:c', name: 'C' } },
    })
  })

  test('carries the holder name identifier without its JSON-LD type', () => {
    const identifier = [{ type: 'IdentityObject', hashed: false, identityType: 'name', identityHash: 'Testi Opiskelija' }]
    const claims = toSdJwtVcClaims({ credentialSubject: { identifier, achievement: { name: 'A' } } }, { vct: VCT })
    assert.deepEqual(claims.identifier, [{ hashed: false, identityType: 'name', identityHash: 'Testi Opiskelija' }])
  })

  test('leaves out what the record lacks', () => {
    assert.deepEqual(toSdJwtVcClaims({ credentialSubject: { achievement: { name: 'A' } } }, { vct: VCT }), { vct: VCT, achievement: { name: 'A' } })
  })

  test('refuses to build claims with no configured vct', () => {
    assert.throws(() => toSdJwtVcClaims(RECORD, {}), /OID4VCI_CREDENTIAL_VCT/)
  })

  test('makes the holder claims disclosable, only those present', () => {
    assert.deepEqual(sdJwtVcDisclosable({ vct: VCT, sub: 'urn:oid:1', identifier: [], achievement: {} }), ['sub', 'identifier'])
    assert.deepEqual(sdJwtVcDisclosable({ vct: VCT, identifier: [], achievement: {} }), ['identifier'])
    assert.deepEqual(sdJwtVcDisclosable({ vct: VCT, achievement: {} }), [])
  })
})

describe('toVcdm2Credential', () => {
  const ISSUER2 = { issuerId: 'https://issuer.example', issuerName: 'Example Issuer' }

  test('builds an unsigned VCDM 2.0 Open Badges credential', () => {
    const vc = toVcdm2Credential(RECORD, ISSUER2)

    assert.deepEqual(vc['@context'], [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ])
    assert.deepEqual(vc.type, ['VerifiableCredential', 'OpenBadgeCredential'])
    assert.match(vc.id, /^urn:uuid:/)
    assert.deepEqual(vc.issuer, { id: 'https://issuer.example', type: ['Profile'], name: 'Example Issuer' })
    assert.deepEqual(vc.credentialSubject, RECORD.credentialSubject)
    assert.equal(vc.validFrom, new Date('2021-06-01').toISOString())
    assert.ok(!('issuanceDate' in vc) && !('proof' in vc))
  })

  test('falls back to now when there is no award date', () => {
    const before = Date.now()
    const vc = toVcdm2Credential({ credentialSubject: {} }, ISSUER2)
    const from = new Date(vc.validFrom).getTime()
    assert.ok(from >= before && from <= Date.now())
  })

  test('refuses to build a credential with no configured issuer', () => {
    assert.throws(() => toVcdm2Credential(RECORD, {}), /OID4VCI_CREDENTIAL_ISSUER_ID/)
  })

  test('takes the top-level name from the achievement', () => {
    const vc = toVcdm2Credential({ ...RECORD, credentialSubject: { ...RECORD.credentialSubject, achievement: { name: 'A' } } }, ISSUER2)
    assert.equal(vc.name, 'A')
  })

  test('has no top-level name when the achievement has none', () => {
    const vc = toVcdm2Credential(RECORD, ISSUER2)
    assert.ok(!('name' in vc))
  })
})

describe('recordFromCredential', () => {
  test('recovers the record from a stored credential', () => {
    const vc = toVerifiableCredential(RECORD, ISSUER)
    assert.deepEqual(recordFromCredential(vc), {
      credentialSubject: RECORD.credentialSubject,
      awardedOn: new Date('2021-06-01').toISOString(),
    })
  })

  test('falls back to validFrom', () => {
    assert.equal(recordFromCredential({ credentialSubject: {}, validFrom: '2022-01-01T00:00:00.000Z' }).awardedOn, '2022-01-01T00:00:00.000Z')
  })
})

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

  test('takes the top-level name from the achievement', () => {
    const vc = toVerifiableCredential({ ...RECORD, credentialSubject: { ...RECORD.credentialSubject, achievement: { name: 'A' } } }, ISSUER)
    assert.equal(vc.name, 'A')
  })

  test('has no top-level name when the achievement has none', () => {
    const vc = toVerifiableCredential(RECORD, ISSUER)
    assert.ok(!('name' in vc))
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
