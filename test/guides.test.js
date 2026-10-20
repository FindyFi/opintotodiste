import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { GUIDE_NAMES, guidePage } from '../src/views/guides.js'
import { WALLETS, WALLET_GROUPS } from '../src/wallets.js'

describe('guide pages', () => {
  test('are the three steps of the main page, in order', () => {
    assert.deepEqual(GUIDE_NAMES, ['studyinfo', 'wallet', 'sharing'])
  })

  test('hold their text as fi/en sibling pairs', () => {
    for (const name of GUIDE_NAMES) {
      const html = guidePage(name)
      assert.match(html, /<h1 lang="fi">[^<]+<\/h1><h1 lang="en">[^<]+<\/h1>/, name)
      assert.match(html, /<\/article><article lang="en">/, name)
      assert.equal((html.match(/<article lang="fi">/g) ?? []).length, 1, name)
    }
  })

  test('link to each other and mark the current one', () => {
    const html = guidePage('wallet')
    for (const name of GUIDE_NAMES) assert.ok(html.includes(`href="/guide/${name}"`), name)
    assert.match(html, /href="\/guide\/wallet" aria-current="page"/)
  })

  test('list the wallets sorted by name', () => {
    const names = WALLETS.map((w) => w.name)
    assert.deepEqual(names, names.toSorted((a, b) => a.localeCompare(b, 'en')))
  })

  test('list every wallet of a shown group with its store links, in both languages', () => {
    const html = guidePage('wallet')
    for (const wallet of WALLETS) {
      const group = WALLET_GROUPS.find((g) => g.id === wallet.group)
      assert.ok(group, wallet.name)
      assert.equal(html.split(`<h3>${wallet.name}</h3>`).length - 1, group.hidden ? 0 : 2, wallet.name)
      for (const key of ['appStore', 'googlePlay']) {
        if (wallet[key] && !group.hidden) assert.ok(html.includes(`href="${wallet[key]}"`), `${wallet.name} ${key}`)
      }
    }
    for (const group of WALLET_GROUPS) {
      assert.equal(html.includes(group.title.fi), !group.hidden, group.id)
    }
  })
})
