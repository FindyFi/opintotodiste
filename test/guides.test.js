import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
      assert.match(html, /<h1 lang="fi">[^<]+<\/h1>/, name)
      assert.match(html, /<\/article><article lang="en">/, name)
      assert.equal((html.match(/<article lang="fi">/g) ?? []).length, 1, name)
    }
  })

  // translate-element would add a second English copy next to the sibling.
  test('never pair a sibling with text that translations.json already has', () => {
    const dictionary = JSON.parse(readFileSync(new URL('../public/translations.json', import.meta.url), 'utf8'))
    for (const name of GUIDE_NAMES) {
      for (const [, , fi] of guidePage(name).matchAll(/<(\w+)[^>]* lang="fi">([\s\S]*?)<\/\1><\1[^>]* lang="en">/g)) {
        const text = fi.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        assert.ok(!Object.hasOwn(dictionary, text), `${name}: ${text}`)
      }
    }
  })

  test('link to each other and mark the current one', () => {
    const html = guidePage('wallet')
    for (const name of GUIDE_NAMES) assert.ok(html.includes(`href="/guide/${name}"`), name)
    assert.match(html, /href="\/guide\/wallet" aria-current="page"/)
  })

  test('list every wallet in its group, in both languages', () => {
    const html = guidePage('wallet')
    for (const wallet of WALLETS) {
      assert.ok(WALLET_GROUPS.some((g) => g.id === wallet.group), wallet.name)
      assert.equal(html.split(`<h3>${wallet.name}</h3>`).length - 1, 2, wallet.name)
      for (const key of ['appStore', 'googlePlay']) {
        if (wallet[key]) assert.ok(html.includes(`href="${wallet[key]}"`), `${wallet.name} ${key}`)
      }
    }
  })

  test('give wallets that are coming no store links', () => {
    for (const wallet of WALLETS.filter((w) => w.status === 'coming')) {
      assert.equal(wallet.appStore, undefined)
      assert.equal(wallet.googlePlay, undefined)
    }
  })

  test('show a screenshot only when its file exists', (t) => {
    const dir = new URL('../public/guide/', import.meta.url)
    const file = new URL('studyinfo-1.en.png', dir)
    if (existsSync(file) || existsSync(new URL('studyinfo-1.png', dir))) {
      return t.skip('a real studyinfo-1 screenshot exists')
    }
    assert.doesNotMatch(guidePage('studyinfo'), /studyinfo-1\./)
    const madeDir = !existsSync(dir)
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, '')
    try {
      const html = guidePage('studyinfo')
      assert.equal((html.match(/src="\/guide\/studyinfo-1\.en\.png"/g) ?? []).length, 1)
    } finally {
      rmSync(madeDir ? dir : file, { recursive: true })
    }
  })
})
