import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { after, before, describe } from 'node:test'

import { convert } from 'koski2openbadge'

import demoData from '../src/demo-koski.json' with { type: 'json' }
import { createClient, postgresUnavailable, startApp } from './helpers/app.js'

const skipReason = await postgresUnavailable()
const needsPostgres = skipReason ? { skip: skipReason } : {}

const FIXTURE = new URL('./fixtures/koski-sample.json', import.meta.url).pathname
const KOSKI_URL = 'https://opintopolku.fi/koski/opinnot/abc123'

describe('the demo record', () => {
  test('is fictional and complete enough to try every part of the page', () => {
    assert.equal(demoData.henkilö.hetu, undefined)
    // A made-up birth date, so the student status shows one in wallets (K5).
    assert.equal(demoData.henkilö.syntymäaika, '2001-04-12')
    for (const lang of ['fi', 'en']) {
      const records = convert(demoData, { lang })
      const ids = records.map((r) => r.credentialSubject.achievement.id)
      assert.equal(new Set(ids).size, ids.length, 'every credential has its own id')
      const types = new Set(records.map((r) => r.credentialSubject.achievement.achievementType))
      for (const type of ['Course', 'BachelorDegree', 'SecondarySchoolDiploma', 'Assessment', 'ext:StudentStatus']) assert.ok(types.has(type), type)
    }
  })
})

describe('the demo texts', () => {
  test('are in the dictionary, and the native dialogs get their language from i18n.js', async () => {
    const dictionary = JSON.parse(await readFile(new URL('../public/translations.json', import.meta.url), 'utf8'))
    for (const fi of ['Kokeile palvelua esittelytiedoilla', 'Esittelytiedot (kuvitteellinen henkilö)']) assert.ok(dictionary[fi]?.en, fi)
    const helper = await readFile(new URL('../public/i18n.js', import.meta.url), 'utf8')
    assert.match(helper, /function t\(fi, en\)/)
    for (const file of ['app.js', 'collections.js', 'share.js']) {
      const source = await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8')
      for (const [, args] of source.matchAll(/\b(?:confirm|prompt)\(([^\n]*)/g)) assert.match(args, /^t\(|^$|^question|^deleteConfirmation|^remove\.confirm/, `${file}: ${args}`)
    }
  })
})

describe('the demo button', needsPostgres, () => {
  let app

  before(async () => {
    app = await startApp({ koskiFixture: FIXTURE })
  })
  after(() => app?.stop())

  test('offers the button before anything is loaded, and not after', async () => {
    const client = createClient(app.baseUrl)
    const before = await (await client.request('/')).text()
    assert.match(before, /id="demoOffer"(?! hidden)/)
    assert.doesNotMatch(before, /Eikö linkkiä/)
    assert.match(before, /<script src="\/i18n\.js" defer>/)

    const res = await client.json('/demo', { method: 'POST', body: { lang: 'fi' } })
    assert.equal(res.status, 200)
    assert.equal(res.body.demo, true)
    assert.equal(res.body.koskiUrl, undefined)
    assert.equal(res.body.personName, 'Eeva Esimerkki')
    assert.equal(res.body.credentials.length, 23)

    const after = await (await client.request('/')).text()
    assert.match(after, /id="demoOffer" hidden/)
    assert.doesNotMatch(after, /demo:esittelytiedot/)
  })

  test('follows the language', async () => {
    const client = createClient(app.baseUrl)
    const res = await client.json('/demo', { method: 'POST', body: { lang: 'en' } })
    assert.ok(res.body.credentials.some((c) => c.credentialSubject.achievement.name === 'Bachelor of Science'))
  })

  test('is refused when Koski data is already there', async () => {
    const client = createClient(app.baseUrl)
    assert.equal((await client.json('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang: 'fi' } })).status, 200)
    const before = (await client.json('/credentials')).body
    assert.equal((await client.json('/demo', { method: 'POST', body: {} })).status, 409)
    assert.deepEqual((await client.json('/credentials')).body, before)
  })

  test("a person's own link replaces the demo data", async () => {
    const client = createClient(app.baseUrl)
    await client.json('/demo', { method: 'POST', body: { lang: 'fi' } })
    const res = await client.json('/credentials', { method: 'POST', body: { koskiUrl: KOSKI_URL, lang: 'fi' } })
    assert.equal(res.status, 200)
    assert.equal(res.body.demo, false)
    assert.equal(res.body.koskiUrl, KOSKI_URL)
    assert.ok(res.body.credentials.every((c) => !c.credentialSubject.id.endsWith('00000000100')))
    assert.ok(res.body.credentials.length > 0)
  })

  test('clearing the data brings the button back', async () => {
    const client = createClient(app.baseUrl)
    await client.json('/demo', { method: 'POST', body: { lang: 'fi' } })
    assert.equal((await client.json('/credentials', { method: 'DELETE' })).status, 200)
    assert.match(await (await client.request('/')).text(), /id="demoOffer"(?! hidden)/)
    assert.equal((await client.json('/demo', { method: 'POST', body: {} })).status, 200)
  })
})
