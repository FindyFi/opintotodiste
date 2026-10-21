import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, before, describe } from 'node:test'

import { createAuthenticator } from './helpers/authenticator.js'
import { createClient, postgresUnavailable, startApp } from './helpers/app.js'
import { startStubServer } from './helpers/stub-server.js'

// A student status (K3) is confirmed against Koski whenever it is signed or
// sent to a wallet. The Koski stub reads its fixture on every request, so
// these tests change what Koski says between the import and the signing.
const skipReason = await postgresUnavailable()
const needsPostgres = skipReason ? { skip: skipReason } : {}

const KOSKI_URL = 'https://opintopolku.fi/koski/opinnot/status123'
const VCT = 'https://issuer.example/vct/OpenBadgeCredential'
const SIGNED = (vc) => ({ ...vc, proof: { type: 'Ed25519Signature2020', proofValue: 'z-stub' } })

// Upper secondary school, present since 2024 and expected to end in 2099, plus
// a completed course so there is a record that isn't a status.
function koskiExport({ status = 'lasna' } = {}) {
  return {
    henkilö: { oid: '1.2.246.562.24.00000000009', etunimet: 'Testi', sukunimi: 'Opiskelija', syntymäaika: '2008-03-14' },
    opiskeluoikeudet: [
      {
        oid: '1.2.246.562.15.00000000009',
        tyyppi: { koodiarvo: 'lukiokoulutus', nimi: { fi: 'Lukiokoulutus', en: 'General upper secondary education' } },
        oppilaitos: { oid: '1.2.246.562.10.00000000019', oppilaitosnumero: { koodiarvo: '00019' }, nimi: { fi: 'Esimerkkilukio' } },
        alkamispäivä: '2024-08-08',
        arvioituPäättymispäivä: '2099-06-05',
        tila: {
          opiskeluoikeusjaksot: [
            { alku: '2024-08-08', tila: { koodiarvo: 'lasna', koodistoUri: 'koskiopiskeluoikeudentila' } },
            ...(status === 'lasna' ? [] : [{ alku: '2025-01-01', tila: { koodiarvo: status, koodistoUri: 'koskiopiskeluoikeudentila' } }]),
          ],
        },
        suoritukset: [
          {
            tyyppi: { koodiarvo: 'lukionoppimaara' },
            koulutusmoduuli: { tunniste: { koodiarvo: '309902', nimi: { fi: 'Lukion oppimäärä' }, koodistoUri: 'koulutus' } },
            osasuoritukset: [
              {
                koulutusmoduuli: { tunniste: { koodiarvo: 'MAA2', nimi: { fi: 'Funktiot' } } },
                arviointi: [{ arvosana: { koodiarvo: '9', koodistoUri: 'arviointiasteikkoyleissivistava' }, hyväksytty: true }],
                vahvistus: { päivä: '2025-01-15' },
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('the student status', needsPostgres, () => {
  const dir = mkdtempSync(join(tmpdir(), 'opintotodiste-status-'))
  const fixture = join(dir, 'koski.json')
  const koskiSays = (data) => writeFileSync(fixture, JSON.stringify(data))
  let app
  let signer
  let issuer

  before(async () => {
    koskiSays(koskiExport())
    signer = await startStubServer((req) => ({ json: SIGNED(req.body) }))
    issuer = await startStubServer(() => ({
      json: { preAuthorizedCode: randomUUID(), offerUri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fstub', expiresIn: 600 },
    }))
    app = await startApp({
      koskiFixture: fixture,
      env: {
        SIGNING_SERVICE_URL: signer.url,
        SIGNING_SERVICE_INSTANCE_ID: 'test',
        SIGNING_SERVICE_SUITE: 'ed25519',
        OID4VCI_ISSUER_URL: issuer.url,
        OID4VCI_ISSUER_INSTANCE: 'test',
        OID4VCI_ISSUER_TOKEN: 'stub-token',
        OID4VCI_CREDENTIAL_CONFIGURATION_ID: 'OpenBadgeCredentialSdJwtVc',
        OID4VCI_CREDENTIAL_VCT: VCT,
      },
    })
  })

  after(async () => {
    await app?.stop()
    await signer?.stop()
    await issuer?.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  // A new session with the data imported while Koski says `data`.
  async function imported(data = koskiExport()) {
    koskiSays(data)
    const client = createClient(app.baseUrl)
    const res = await client.json('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang: 'fi' } })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const status = res.body.credentials.find((c) => c.credentialSubject.achievement.achievementType === 'ext:StudentStatus')
    const course = res.body.credentials.find((c) => c !== status)
    return { client, status, course }
  }

  test('is on the list with its expiry and no award date', async () => {
    const { status } = await imported()
    assert.ok(status, 'expected a student status')
    assert.equal(status.validUntil, '2099-06-05T20:59:59.000Z')
    assert.equal(status.awardedOn, undefined)
  })

  test('is not on the list when Koski shows no enrolment', async () => {
    const { status, course } = await imported(koskiExport({ status: 'valmistunut' }))
    assert.equal(status, undefined)
    assert.ok(course)
  })

  test('is signed with its expiry and the signing time when Koski still shows it', async () => {
    const { client, status } = await imported()
    const before = Date.now()
    const res = await client.json(`/credentials/${status.ref}/sign`, { method: 'POST' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.signed.expirationDate, '2099-06-05T20:59:59.000Z')
    assert.ok(Date.parse(res.body.signed.issuanceDate) >= before)
  })

  test('is refused when Koski no longer shows the enrolment', async () => {
    const { client, status } = await imported()
    koskiSays(koskiExport({ status: 'eronnut' }))
    const signedBefore = signer.requests.length
    const res = await client.json(`/credentials/${status.ref}/sign`, { method: 'POST' })
    assert.equal(res.status, 409)
    assert.match(res.body.error, /no longer shows you as enrolled/)
    assert.equal(signer.requests.length, signedBefore, 'nothing was signed')
  })

  test('is refused when the share link has lapsed, and says what to do', async () => {
    const { client, status } = await imported()
    rmSync(fixture)
    try {
      const res = await client.json(`/credentials/${status.ref}/sign`, { method: 'POST' })
      assert.equal(res.status, 409)
      assert.match(res.body.error, /Koski responded with 404.*create a new one/)
    } finally {
      koskiSays(koskiExport())
    }
  })

  test('other records are signed without asking Koski again', async () => {
    const { client, course } = await imported()
    rmSync(fixture)
    try {
      assert.equal((await client.json(`/credentials/${course.ref}/sign`, { method: 'POST' })).status, 200)
    } finally {
      koskiSays(koskiExport())
    }
  })

  test('goes to the wallet with its expiry, start and result', async () => {
    const { client, status } = await imported()
    const res = await client.json(`/credentials/${status.ref}/offer`, { method: 'POST' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const { body } = issuer.requests.at(-1)
    assert.equal(body.validUntil, '2099-06-05T20:59:59.000Z')
    assert.equal(body.unsignedCredential.activityStartDate, status.credentialSubject.activityStartDate)
    assert.deepEqual(body.unsignedCredential.result.map((r) => r.status), ['Enrolled'])
    assert.equal(body.unsignedCredential.achievement.achievementType, 'ext:StudentStatus')
  })

  test('is not sent to a wallet when Koski no longer shows the enrolment', async () => {
    const { client, status } = await imported()
    koskiSays(koskiExport({ status: 'eronnut' }))
    const offersBefore = issuer.requests.length
    try {
      assert.equal((await client.json(`/credentials/${status.ref}/offer`, { method: 'POST' })).status, 409)
      assert.equal(issuer.requests.length, offersBefore)
    } finally {
      koskiSays(koskiExport())
    }
  })

  test('confirming it does not bring back a removed record', async () => {
    const { client, status, course } = await imported()
    assert.equal((await client.json(`/credentials/${course.ref}`, { method: 'DELETE' })).status, 204)
    assert.equal((await client.json(`/credentials/${status.ref}/sign`, { method: 'POST' })).status, 200)
    const refs = (await client.json('/credentials')).body.credentials.map((c) => c.ref)
    assert.ok(refs.includes(status.ref))
    assert.ok(!refs.includes(course.ref), 'the removed record stays off the list')
  })
})

// With OID4VCI_STUDENT_STATUS_VCT set, a student status goes to wallets as its
// own type (K5), with the birth date of the fresh Koski fetch.
describe('the student status as its own wallet type', needsPostgres, () => {
  const STATUS_VCT = 'https://issuer.example/vct/StudentStatus'
  const dir = mkdtempSync(join(tmpdir(), 'opintotodiste-status-vct-'))
  const fixture = join(dir, 'koski.json')
  let app
  let signer
  let issuer

  before(async () => {
    writeFileSync(fixture, JSON.stringify(koskiExport()))
    signer = await startStubServer((req) => ({ json: SIGNED(req.body) }))
    issuer = await startStubServer(() => ({
      json: { preAuthorizedCode: randomUUID(), offerUri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fstub', expiresIn: 600 },
    }))
    app = await startApp({
      koskiFixture: fixture,
      env: {
        SIGNING_SERVICE_URL: signer.url,
        SIGNING_SERVICE_INSTANCE_ID: 'test',
        SIGNING_SERVICE_SUITE: 'ed25519',
        OID4VCI_ISSUER_URL: issuer.url,
        OID4VCI_ISSUER_INSTANCE: 'test',
        OID4VCI_ISSUER_TOKEN: 'stub-token',
        OID4VCI_CREDENTIAL_CONFIGURATION_ID: 'OpenBadgeCredentialSdJwtVc',
        OID4VCI_CREDENTIAL_VCT: VCT,
        OID4VCI_STUDENT_STATUS_VCT: STATUS_VCT,
      },
    })
  })

  after(async () => {
    await app?.stop()
    await signer?.stop()
    await issuer?.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  test('goes to the wallet as flat claims under its own configuration', async () => {
    const client = createClient(app.baseUrl)
    const list = await client.json('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang: 'fi' } })
    const status = list.body.credentials.find((c) => c.credentialSubject.achievement.achievementType === 'ext:StudentStatus')
    const course = list.body.credentials.find((c) => c !== status)

    const res = await client.json(`/credentials/${status.ref}/offer`, { method: 'POST' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const { body } = issuer.requests.at(-1)
    assert.equal(body.credentialConfigurationId, 'StudentStatusSdJwtVc')
    assert.equal(body.validUntil, '2099-06-05T20:59:59.000Z')
    const { issuance_date: issued, ...claims } = body.unsignedCredential
    assert.match(issued, /^\d{4}-\d{2}-\d{2}$/)
    assert.deepEqual(claims, {
      vct: STATUS_VCT,
      sub: 'urn:oid:1.2.246.562.24.00000000009',
      given_name: 'Testi',
      family_name: 'Opiskelija',
      birthdate: '2008-03-14',
      enrolment_status: 'enrolled',
      institution_name: 'Esimerkkilukio',
      institution_id: 'urn:oid:1.2.246.562.10.00000000019',
      institution_code: '00019',
      education_level: '3',
      education_level_name: 'Toinen aste',
      education_type: 'lukiokoulutus',
      education_type_name: 'Lukiokoulutus',
      programme: 'Lukion oppimäärä',
      start_date: '2024-08-08',
      expiry_date: '2099-06-05',
      issuing_country: 'FI',
    })
    assert.deepEqual(body.disclosable, ['sub', 'given_name', 'family_name', 'birthdate', 'institution_name', 'institution_id', 'institution_code', 'programme'])

    // Other badges still go as Open Badges.
    assert.equal((await client.json(`/credentials/${course.ref}/offer`, { method: 'POST' })).status, 200)
    assert.equal(issuer.requests.at(-1).body.credentialConfigurationId, 'OpenBadgeCredentialSdJwtVc')
    assert.equal(issuer.requests.at(-1).body.unsignedCredential.vct, VCT)
  })

  test('the birth date is not kept', async () => {
    const client = createClient(app.baseUrl)
    const list = await client.json('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang: 'fi' } })
    const status = list.body.credentials.find((c) => c.credentialSubject.achievement.achievementType === 'ext:StudentStatus')
    assert.equal((await client.json(`/credentials/${status.ref}/offer`, { method: 'POST' })).status, 200)
    const page = await client.request('/')
    assert.doesNotMatch(await page.text(), /2008-03-14/)
  })

  test('a saved copy gets the birth date from Koski, and goes without it when Koski does not answer', async () => {
    const client = createClient(app.baseUrl)
    const authenticator = createAuthenticator({ rpId: 'localhost', origin: app.baseUrl })
    const options = await client.json('/auth/register/options', { method: 'POST', body: { displayName: 'Opiskelija' } })
    await client.json('/auth/register/verify', { method: 'POST', body: authenticator.register(options.body) })
    const list = await client.json('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang: 'fi' } })
    const status = list.body.credentials.find((c) => c.credentialSubject.achievement.achievementType === 'ext:StudentStatus')
    const saved = await client.json('/saved-credentials', { method: 'POST', body: { refs: [status.ref] } })
    const { credentialId } = saved.body.results[0]
    assert.ok(credentialId, JSON.stringify(saved.body))

    const offer = await client.json(`/saved-credentials/${credentialId}/offer`, { method: 'POST' })
    assert.equal(offer.status, 200, JSON.stringify(offer.body))
    const { body } = issuer.requests.at(-1)
    assert.equal(body.credentialConfigurationId, 'StudentStatusSdJwtVc')
    assert.equal(body.unsignedCredential.birthdate, '2008-03-14')
    assert.equal(body.unsignedCredential.given_name, 'Testi')

    rmSync(fixture)
    try {
      const again = await client.json(`/saved-credentials/${credentialId}/offer`, { method: 'POST' })
      assert.equal(again.status, 200, JSON.stringify(again.body))
      const claims = issuer.requests.at(-1).body.unsignedCredential
      assert.equal('birthdate' in claims, false)
      assert.equal(claims.given_name, 'Testi')
    } finally {
      writeFileSync(fixture, JSON.stringify(koskiExport()))
    }
  })
})
