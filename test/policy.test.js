import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import * as views from '../src/views/index.js'
import { GUIDE_NAMES } from '../src/views/guides.js'

const collection = { id: 'c1', name: 'Hakemus', createdAt: new Date() }

// Every page the app renders, with the smallest data each one needs.
const PAGES = {
  main: () => views.page({ initialData: null }),
  collections: () => views.collectionsPage(),
  guide: () => views.guidePage(GUIDE_NAMES[0]),
  employer: () => views.employerPage(),
  verify: () => views.verifyPage({ issuers: {} }),
  sharedCollection: () => views.sharedCollectionPage({ token: 't', collection, items: [] }),
  sharedItem: () =>
    views.sharedItemPage({
      token: 't',
      itemId: 'i',
      credential: { issuanceDate: '2024-05-31T00:00:00.000Z', credentialSubject: { achievement: { name: 'Matematiikka' } } },
    }),
  policy: () => views.policyPage(),
}

describe('policy page', () => {
  test('holds its text as one fi/en sibling pair', () => {
    const html = views.policyPage()
    assert.match(html, /<div class="policy-intro" lang="fi">\s*<h1>[^<]+<\/h1>/)
    assert.match(html, /<\/div><div class="policy-intro" lang="en">\s*<h1>[^<]+<\/h1>/)
    assert.equal((html.match(/<article lang="fi">/g) ?? []).length, 1)
    assert.match(html, /<\/article><article lang="en">/)
  })

  test('has the same sections in both languages', () => {
    const [fi, en] = views.policyPage().split('<article lang="en">')
    const count = (s) => (s.match(/<h2>/g) ?? []).length
    assert.ok(count(fi) > 0)
    assert.equal(count(fi), count(en))
  })

  test('names the contact address', () => {
    assert.match(views.policyPage(), /href="mailto:info@findy\.fi"/)
  })
})

describe('the footer', () => {
  for (const [name, render] of Object.entries(PAGES)) {
    test(`links to the policy page from the ${name} page`, () => {
      const html = render()
      assert.match(html, /<footer class="site-footer">[\s\S]*href="\/policy"/, name)
      assert.equal(html.includes('href="/policy" aria-current="page"'), name === 'policy', name)
    })
  }
})
