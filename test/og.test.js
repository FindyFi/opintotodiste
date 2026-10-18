import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import * as views from '../src/views/index.js'
import { ogLanguageMiddleware } from '../src/views/og.js'

process.env.ORIGIN = 'https://todiste.example/'

const tag = (html, key) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)?.[1]
const inLanguage = (lang, render) => {
  let html
  ogLanguageMiddleware({ query: { lang } }, {}, () => { html = render() })
  return html
}

const credential = (name, creator = 'Testikoulu') => ({
  credentialSubject: { achievement: { name, creator: { name: creator } } },
  issuanceDate: '2024-05-01T00:00:00Z',
})

describe('Open Graph tags', () => {
  test('every public view carries the full set, with absolute urls from ORIGIN', () => {
    const pages = {
      '/': views.page(),
      '/employer': views.employerPage(),
      '/verify': views.verifyPage({ issuers: {} }),
      '/guide/studyinfo': views.guidePage('studyinfo'),
      '/guide/wallet': views.guidePage('wallet'),
      '/guide/sharing': views.guidePage('sharing'),
      '/policy': views.policyPage(),
    }
    for (const [path, html] of Object.entries(pages)) {
      assert.equal(tag(html, 'og:url'), `https://todiste.example${path}`, path)
      for (const key of ['description', 'og:title', 'og:description', 'og:type', 'og:site_name', 'og:locale', 'twitter:card']) {
        assert.ok(tag(html, key), `${path} ${key}`)
      }
      assert.equal(tag(html, 'og:locale'), 'fi_FI')
      assert.equal(tag(html, 'og:locale:alternate'), 'en_GB')
    }
  })

  test('og:image points at the 1200x630 PNG, absolute from ORIGIN', () => {
    const html = views.page()
    assert.equal(tag(html, 'og:image'), 'https://todiste.example/icons/og-image-fi.png')
    assert.equal(tag(html, 'og:image:width'), '1200')
    assert.equal(tag(html, 'og:image:height'), '630')
    assert.equal(tag(html, 'twitter:card'), 'summary_large_image')
  })

  test('the private collections page gets only the generic site tags', () => {
    const html = views.collectionsPage()
    assert.equal(tag(html, 'og:title'), 'Opintotodiste')
  })

  test('?lang=en gives the English texts and locale', () => {
    const html = inLanguage('en', () => views.guidePage('wallet'))
    assert.equal(tag(html, 'og:title'), 'Save your badges in a wallet – Study credential')
    assert.equal(tag(html, 'og:locale'), 'en_GB')
    assert.equal(tag(html, 'og:locale:alternate'), 'fi_FI')
    assert.equal(tag(html, 'og:url'), 'https://todiste.example/guide/wallet?lang=en')
    assert.equal(tag(html, 'og:image'), 'https://todiste.example/icons/og-image-en.png')
    assert.equal(tag(html, 'og:image:alt'), 'Study credential – Own your skills')
  })

  test('a shared item carries its name and issuer, nothing else', () => {
    const html = views.sharedItemPage({ path: '/c/tok/items/i1', credential: credential('Tradenomi') })
    assert.equal(tag(html, 'og:title'), 'Tradenomi – Opintotodiste')
    assert.match(tag(html, 'og:description'), /myöntäjä Testikoulu/)
    assert.equal(tag(html, 'og:url'), 'https://todiste.example/c/tok/items/i1')
  })

  // The page shows the holder's name (G8); a link preview stays without it.
  test('a shared item shows the holder name on the page, not in the preview', () => {
    const named = credential('Tradenomi')
    named.credentialSubject.identifier = [{ type: 'IdentityObject', hashed: false, identityType: 'name', identityHash: 'Testi Opiskelija' }]
    const html = views.sharedItemPage({ token: 'tok', itemId: 'i1', credential: named })
    assert.match(html, /<dt lang="fi">Haltija<\/dt><dd>Testi Opiskelija<\/dd>/)
    const metas = html.split('\n').filter((line) => line.startsWith('<meta ') || line.startsWith('<title>'))
    for (const line of metas) assert.doesNotMatch(line, /Testi Opiskelija/, line)
  })

  test('a shared collection carries its name and size', () => {
    const items = [{ id: 'a', credential: credential('A') }, { id: 'b', credential: credential('B') }]
    const html = views.sharedCollectionPage({ token: 'tok', collection: { name: 'Hakemus' }, items })
    assert.equal(tag(html, 'og:title'), 'Hakemus – Opintotodiste')
    assert.match(tag(html, 'og:description'), /2 osaamismerkkiä/)
  })

  test('escapes names with quotes and angle brackets', () => {
    const name = `"><script>alert(1)</script> & 'x'`
    const html = views.sharedItemPage({ path: '/c/tok/items/i1', credential: credential(name, `"Koulu" <b>`) })
    const metas = html.split('\n').filter((line) => line.startsWith('<meta property="og:') || line.startsWith('<meta name="description"'))
    assert.ok(metas.length > 5)
    for (const line of metas) assert.doesNotMatch(line.slice(0, -2).replace(/^<meta \w+="[^"]*" content="/, ''), /["<>]/, line)
    assert.doesNotMatch(html, /<script>alert/)
  })
})
