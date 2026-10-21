import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { describe } from 'node:test'

import * as views from '../src/views/index.js'
import { header } from '../src/views/layout.js'

// The top bar's children in order, by class, id or tag (U25: every page and
// sign-in state has the same slots in the same places).
function slots(html) {
  const bar = /<header class="topbar">([\s\S]*?)<\/header>/.exec(html)[1]
  return [...bar.matchAll(/^ {2}<([\w-]+)([^>]*)>/gm)].map(([, tag, attrs]) => /class="([^"]+)"/.exec(attrs)?.[1] ?? tag)
}

describe('top bar', () => {
  test('has the same slots with and without sign-in', () => {
    const expected = ['brand', 'site-nav', 'translate-element', 'auth-nav']
    assert.deepEqual(slots(header()), expected)
    assert.deepEqual(slots(header({ auth: false })), expected)
  })

  test('every page renders the same slots', () => {
    const pages = [
      views.page(),
      views.collectionsPage(),
      views.employerPage(),
      views.verifyPage({ issuers: {} }),
      views.guidePage('wallet'),
      views.policyPage(),
      views.notFoundPage(),
    ]
    for (const html of pages) assert.deepEqual(slots(html), ['brand', 'site-nav', 'translate-element', 'auth-nav'])
  })

  test('only pages with sign-in get #authNav and its dialog', () => {
    assert.match(header(), /<div id="authNav" class="auth-nav"><\/div>/)
    assert.match(header(), /<dialog id="authDialog">/)
    assert.doesNotMatch(header({ auth: false }), /id="authNav"|authDialog/)
  })

  test('the site nav always lists Kokoelmani and marks the current page', () => {
    for (const html of [header(), header({ auth: false })]) {
      assert.match(html, /<a href="\/my\/collections"><span lang="fi">Kokoelmani<\/span><\/a>/)
    }
    assert.match(views.collectionsPage(), /<a href="\/my\/collections" aria-current="page">/)
  })

  // public/auth.js fills #authNav; both states draw into the one slot and
  // registering moved into the sign-in dialog.
  test('auth.js draws sign-in and the account menu into #authNav only', async () => {
    const source = await readFile(new URL('../public/auth.js', import.meta.url), 'utf8')
    const render = /async function renderAuthNav\(\) \{[\s\S]*?\n\}/.exec(source)[0]
    assert.doesNotMatch(render, /Rekisteröi pääsyavain|Kokoelmani/, 'the bar no longer has register or collections buttons')
    assert.match(render, /'aria-expanded': 'false', 'aria-controls': 'accountMenu'/)
    for (const item of ['Tili', 'Lataa tietosi', 'Kirjaudu ulos']) assert.match(render, new RegExp(`item\\('${item}'`))
  })
})
