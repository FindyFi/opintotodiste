import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { credentialKey, credentialPerson, hasExpired, recordFromCredential, sdJwtVcDisclosable, signCredential, studentStatusDisclosable, toSdJwtVcClaims, toStudentStatusClaims, toVcdm2Credential, toVerifiableCredential } from '../src/badges.js'
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

  test('carries the name parts as flat claims, all first names as given_name', () => {
    const henkilö = { oid: '1', etunimet: ' Testi  Tapaus ', kutsumanimi: 'Tapaus', sukunimi: 'Opiskelija' }
    const claims = toSdJwtVcClaims({ credentialSubject: { achievement: { name: 'A' } } }, { vct: VCT, henkilö })
    assert.equal(claims.given_name, 'Testi Tapaus')
    assert.equal(claims.family_name, 'Opiskelija')
  })

  test('falls back to the call name and leaves out a missing part', () => {
    const claims = toSdJwtVcClaims({ credentialSubject: { achievement: { name: 'A' } } }, { vct: VCT, henkilö: { kutsumanimi: 'Tapaus', sukunimi: ' ' } })
    assert.equal(claims.given_name, 'Tapaus')
    assert.equal('family_name' in claims, false)
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
    assert.deepEqual(
      sdJwtVcDisclosable({ vct: VCT, sub: 'urn:oid:1', identifier: [], given_name: 'T', family_name: 'O', achievement: {} }),
      ['sub', 'identifier', 'given_name', 'family_name'],
    )
  })
})

describe('credentialPerson', () => {
  const henkilö = { oid: '1.2.3', etunimet: 'Testi Tapaus', kutsumanimi: 'Tapaus', sukunimi: 'Opiskelija' }
  const subject = (id, name) => ({ id, identifier: [{ type: 'IdentityObject', hashed: false, identityType: 'name', identityHash: name }] })

  test('is the Koski person when the oid and the name match', () => {
    assert.equal(credentialPerson(subject('urn:oid:1.2.3', 'Tapaus Opiskelija'), henkilö), henkilö)
  })

  test('is null for another oid, another name, or no import', () => {
    assert.equal(credentialPerson(subject('urn:oid:9.9.9', 'Tapaus Opiskelija'), henkilö), null)
    assert.equal(credentialPerson(subject('urn:oid:1.2.3', 'Toinen Opiskelija'), henkilö), null)
    assert.equal(credentialPerson({ id: 'urn:oid:1.2.3' }, henkilö), null)
    assert.equal(credentialPerson(subject('urn:oid:1.2.3', 'Tapaus Opiskelija'), undefined), null)
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

  // The body may echo the credential, and the message is logged and shown.
  test('surfaces a signing failure by status only, without the response body', async () => {
    const signer = await startStubServer(() => ({ status: 500, text: 'cannot sign {"credentialSubject":{"id":"urn:oid:1.2.3"}}' }))
    try {
      await assert.rejects(
        () => signCredential({}, { baseUrl: signer.url, instanceId: 'test' }),
        (err) => /^Signing service responded with 500/.test(err.message) && !err.message.includes('urn:oid')
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

describe('credentialKey', () => {
  const subject = (name, achievementId = 'urn:opintopolku2openbadge:abc') => ({
    id: 'urn:oid:1.2.3',
    achievement: { ...(achievementId ? { id: achievementId } : {}), name },
  })

  test('matches a record and its signed credential, in any language', () => {
    const record = { credentialSubject: subject('Ylioppilastutkinto'), awardedOn: '2021-06-01' }
    const signed = toVerifiableCredential({ credentialSubject: subject('Matriculation examination'), awardedOn: '2021-06-01' }, ISSUER)
    assert.equal(credentialKey(record), credentialKey(signed))
    assert.equal(credentialKey(record), credentialKey(recordFromCredential(signed)))
  })

  test('tells apart another date, learner or achievement', () => {
    const key = credentialKey({ credentialSubject: subject('A'), awardedOn: '2021-06-01' })
    assert.notEqual(key, credentialKey({ credentialSubject: subject('A'), awardedOn: '2021-06-02' }))
    assert.notEqual(key, credentialKey({ credentialSubject: { ...subject('A'), id: 'urn:oid:9' }, awardedOn: '2021-06-01' }))
    assert.notEqual(key, credentialKey({ credentialSubject: subject('A', 'urn:opintopolku2openbadge:def'), awardedOn: '2021-06-01' }))
  })

  test('without an achievement id, needs the whole credentialSubject to match', () => {
    const fi = { credentialSubject: subject('Kurssi', null), awardedOn: '2021-06-01' }
    assert.equal(credentialKey(fi), credentialKey({ credentialSubject: subject('Kurssi', null), awardedOn: '2021-06-01' }))
    assert.notEqual(credentialKey(fi), credentialKey({ credentialSubject: subject('Course', null), awardedOn: '2021-06-01' }))
  })
})

// A student status (K3) as koski2openbadge emits it: no award date, a
// validUntil, a start and an Enrolled result.
describe('results in the SD-JWT VC claims', () => {
  const VCT = 'https://issuer.example/vct'
  const subject = (resultDescription, result, key = 'resultDescription') => ({
    credentialSubject: { achievement: { name: 'A', [key]: resultDescription }, result },
  })
  const grade = (desc, value) => [{ id: 'urn:x#grade', type: ['ResultDescription'], name: 'Arvosana', ...desc }, { type: ['Result'], resultDescription: 'urn:x#grade', ...value }]

  test('a course sends its result, and its grade and extent as text', () => {
    const [gradeDesc, gradeResult] = grade({ resultType: 'RawScore', valueMin: '4', valueMax: '10' }, { value: '9' })
    const extentDesc = { id: 'urn:x#credits', type: ['ResultDescription'], name: 'Laajuus (vuosiviikkotuntia)', resultType: 'RawScore', valueMin: '0' }
    const extentResult = { type: ['Result'], resultDescription: 'urn:x#credits', value: '25' }
    const claims = toSdJwtVcClaims(subject([gradeDesc, extentDesc], [gradeResult, extentResult]), { vct: VCT })
    assert.deepEqual(claims.result, [
      { resultDescription: 'urn:x#grade', value: '9' },
      { resultDescription: 'urn:x#credits', value: '25' },
    ])
    assert.equal(claims.grade, '9 (4–10)')
    assert.equal(claims.extent, '25 vuosiviikkotuntia')
  })

  test('a letter grade gets its scale from the allowed values', () => {
    const [desc, result] = grade({ resultType: 'LetterGrade', allowedValue: ['I', 'A', 'B', 'C', 'M', 'E', 'L'] }, { value: 'E' })
    assert.equal(toSdJwtVcClaims(subject([desc], [result]), { vct: VCT }).grade, 'E (I–L)')
  })

  test('a grade or extent with no scale or unit is the bare value', () => {
    const [desc, result] = grade({ resultType: 'RawScore' }, { value: '3' })
    const extentDesc = { id: 'urn:x#credits', name: 'Laajuus', resultType: 'RawScore' }
    const claims = toSdJwtVcClaims(subject([desc, extentDesc], [result, { resultDescription: 'urn:x#credits', value: 2.5 }]), { vct: VCT })
    assert.equal(claims.grade, '3')
    assert.equal(claims.extent, '2.5')
  })

  test('a completed status sends its result but no grade', () => {
    const [desc, result] = grade({ resultType: 'Status' }, { status: 'Completed' })
    const claims = toSdJwtVcClaims(subject([desc], [result]), { vct: VCT })
    assert.deepEqual(claims.result, [{ resultDescription: 'urn:x#grade', status: 'Completed' }])
    assert.equal('grade' in claims, false)
  })

  test('reads the plural descriptions of credentials stored before koski2openbadge 0.1.0', () => {
    const [desc, result] = grade({ resultType: 'RawScore', valueMin: '0', valueMax: '5' }, { value: '4' })
    assert.equal(toSdJwtVcClaims(subject([desc], [result], 'resultDescriptions'), { vct: VCT }).grade, '4 (0–5)')
  })

  test('a record without results has no result claims', () => {
    const claims = toSdJwtVcClaims(subject(undefined, undefined), { vct: VCT })
    for (const claim of ['result', 'grade', 'extent']) assert.equal(claim in claims, false, claim)
  })
})

describe('a student status', () => {
  const STATUS = {
    credentialSubject: {
      type: ['AchievementSubject'],
      id: 'urn:oid:1.2.3',
      activityStartDate: '2024-08-07T21:00:00.000Z',
      achievement: {
        id: 'urn:x:status',
        type: ['Achievement'],
        achievementType: 'ext:StudentStatus',
        name: 'Opiskelija: Lukiokoulutus',
        alignment: [{ type: ['Alignment'], targetCode: 'lukiokoulutus', targetName: 'Lukiokoulutus', targetUrl: 'https://koski.example/x' }],
        resultDescription: [{ id: 'urn:x:status#status', type: ['ResultDescription'], name: 'Opiskelutilanne', resultType: 'Status' }],
      },
      result: [{ type: ['Result'], resultDescription: 'urn:x:status#status', status: 'Enrolled' }],
    },
    validUntil: '2027-06-05T20:59:59.000Z',
  }

  test('expires in every envelope, dated when it is signed', () => {
    const before = Date.now()
    const vc = toVerifiableCredential(STATUS, ISSUER)
    assert.equal(vc.expirationDate, STATUS.validUntil)
    assert.ok(Date.parse(vc.issuanceDate) >= before)
    const vc2 = toVcdm2Credential(STATUS, ISSUER)
    assert.equal(vc2.validUntil, STATUS.validUntil)
    assert.ok(Date.parse(vc2.validFrom) >= before)
  })

  test('other credentials get no expiry', () => {
    assert.equal('expirationDate' in toVerifiableCredential(RECORD, ISSUER), false)
    assert.equal('validUntil' in toVcdm2Credential(RECORD, ISSUER), false)
  })

  test('carries its start and result as SD-JWT VC claims, without JSON-LD types or a grade', () => {
    const claims = toSdJwtVcClaims(STATUS, { vct: 'https://issuer.example/vct' })
    assert.equal(claims.activityStartDate, STATUS.credentialSubject.activityStartDate)
    assert.deepEqual(claims.result, [{ resultDescription: 'urn:x:status#status', status: 'Enrolled' }])
    assert.deepEqual(claims.achievement.alignment, [{ targetCode: 'lukiokoulutus', targetName: 'Lukiokoulutus', targetUrl: 'https://koski.example/x' }])
    for (const claim of ['awardedDate', 'validUntil', 'exp', 'grade', 'extent']) assert.equal(claim in claims, false, claim)
  })

  test('comes back from a stored credential with its expiry', () => {
    const vc = toVerifiableCredential(STATUS, ISSUER)
    assert.equal(recordFromCredential(vc).validUntil, STATUS.validUntil)
    assert.equal(recordFromCredential({ credentialSubject: {}, validUntil: STATUS.validUntil }).validUntil, STATUS.validUntil)
    assert.equal('validUntil' in recordFromCredential(toVerifiableCredential(RECORD, ISSUER)), false)
  })

  test('has expired once its validity has ended', () => {
    const end = Date.parse(STATUS.validUntil)
    assert.equal(hasExpired(STATUS, end - 1), false)
    assert.equal(hasExpired(STATUS, end), true)
    assert.equal(hasExpired({ expirationDate: STATUS.validUntil }, end + 1), true)
    assert.equal(hasExpired(RECORD), false)
  })
})

describe('toStudentStatusClaims', () => {
  const STATUS_VCT = 'https://issuer.example/vct/StudentStatus'
  const STATUS = {
    credentialSubject: {
      id: 'urn:oid:1.2.246.562.24.00000000001',
      activityStartDate: '2024-08-07T21:00:00.000Z',
      achievement: {
        achievementType: 'ext:StudentStatus',
        fieldOfStudy: 'Lukion oppimäärä',
        creator: {
          id: 'urn:oid:1.2.246.562.10.00000000002',
          name: 'Esimerkkilukio',
          otherIdentifier: [{ type: ['IdentifierEntry'], identifier: '00002', identifierType: 'identifier' }],
        },
        alignment: [
          { targetCode: 'lukiokoulutus', targetName: 'Lukiokoulutus', targetUrl: 'https://koski.example/koodisto/opiskeluoikeudentyyppi/latest' },
          { targetCode: '3', targetName: 'Toinen aste', targetUrl: 'https://koski.example/koodisto/kansallinenkoulutusluokitus2016koulutusastetaso1/latest' },
        ],
      },
      result: [{ status: 'Enrolled' }],
    },
    awardedOn: '2026-10-20T22:30:00.000Z',
    validUntil: '2027-06-05T20:59:59.000Z',
  }

  test('maps a student status to flat claims, dates as Finnish days', () => {
    const henkilö = { etunimet: 'Testi Matti', sukunimi: 'Opiskelija', syntymäaika: '2008-03-14' }
    assert.deepEqual(toStudentStatusClaims(STATUS, { vct: STATUS_VCT, henkilö }), {
      vct: STATUS_VCT,
      sub: 'urn:oid:1.2.246.562.24.00000000001',
      given_name: 'Testi Matti',
      family_name: 'Opiskelija',
      birthdate: '2008-03-14',
      enrolment_status: 'enrolled',
      institution_name: 'Esimerkkilukio',
      institution_id: 'urn:oid:1.2.246.562.10.00000000002',
      institution_code: '00002',
      education_level: '3',
      education_level_name: 'Toinen aste',
      education_type: 'lukiokoulutus',
      education_type_name: 'Lukiokoulutus',
      programme: 'Lukion oppimäärä',
      start_date: '2024-08-08',
      expiry_date: '2027-06-05',
      issuance_date: '2026-10-21',
      issuing_country: 'FI',
    })
  })

  test('leaves out what Koski does not have, never undefined', () => {
    const claims = toStudentStatusClaims(
      { credentialSubject: { achievement: { creator: { name: ' ' } } }, validUntil: STATUS.validUntil },
      { vct: STATUS_VCT, henkilö: { syntymäaika: '14.3.2008' } }
    )
    assert.deepEqual(Object.keys(claims), ['vct', 'enrolment_status', 'expiry_date', 'issuance_date', 'issuing_country'])
    assert.equal(studentStatusDisclosable(claims).length, 0)
  })

  test('discloses who and where, not the level, the status or the dates', () => {
    const claims = toStudentStatusClaims(STATUS, { vct: STATUS_VCT, henkilö: { etunimet: 'T', sukunimi: 'O', syntymäaika: '2008-03-14' } })
    assert.deepEqual(studentStatusDisclosable(claims), ['sub', 'given_name', 'family_name', 'birthdate', 'institution_name', 'institution_id', 'institution_code', 'programme'])
  })

  test('needs its vct', () => {
    assert.throws(() => toStudentStatusClaims(STATUS, {}), /OID4VCI_STUDENT_STATUS_VCT/)
  })
})
