import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test, { describe } from 'node:test'

// The UI's source language is Finnish. Text is marked lang="fi" and
// translate-element puts its English from public/translations.json in its
// place, or the English is hand-authored next to it (a lang="en" sibling, or
// i18n.js's t(fi, en)). These tests fail when user-visible text has neither,
// so untranslated text can't be merged. They read the source, so they see
// literals: text built at run time is the code's own responsibility.
const dictionary = JSON.parse(await readFile(new URL('../public/translations.json', import.meta.url), 'utf8'))
const LETTERS = /[A-Za-zÅÄÖåäö]{2}/

async function sources(dir) {
  const url = new URL(`../${dir}/`, import.meta.url)
  const files = (await readdir(url)).filter((file) => file.endsWith('.js'))
  return Promise.all(files.map(async (file) => ({ file: `${dir}/${file}`, text: await readFile(new URL(file, url), 'utf8') })))
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

describe('translations', () => {
  test('every dictionary entry has its English', () => {
    const missing = Object.entries(dictionary).filter(([, value]) => !value?.en?.trim()).map(([fi]) => fi)
    assert.deepEqual(missing, [])
  })

  test('text the pages write is Finnish with its English, or hand-authored in both', async () => {
    const problems = []
    for (const { file, text } of await sources('public')) {
      // el(tag, props, 'text'): a text child is lang 'fi' and in the
      // dictionary, or lang 'en' (the English sibling of a 'fi' one).
      for (const match of text.matchAll(/\bel\(\s*'\w+'\s*,\s*\{([^{}]*)\}\s*,\s*'((?:[^'\\]|\\.)+)'/g)) {
        const [, props, child] = match
        if (!LETTERS.test(child) || /lang: 'en'/.test(props)) continue
        const englishSibling = /^\s*\)\s*,\s*el\(\s*'\w+'\s*,\s*\{[^{}]*lang: 'en'/.test(text.slice(match.index + match[0].length))
        if (!/lang: 'fi'/.test(props)) problems.push(`${file}:${lineOf(text, match.index)}: "${child}" is not marked lang 'fi'`)
        else if (!englishSibling && !dictionary[child]?.en) problems.push(`${file}:${lineOf(text, match.index)}: "${child}" is not in translations.json`)
      }
      // A literal assigned as text can't be marked at all.
      for (const match of text.matchAll(/\.(?:textContent|innerText)\s*=\s*['`]([^'`]*)['`]/g)) {
        if (LETTERS.test(match[1])) problems.push(`${file}:${lineOf(text, match.index)}: "${match[1]}" is set as text, unmarked`)
      }
    }
    assert.deepEqual(problems, [])
  })

  test('text in the server-rendered pages is Finnish with its English, or hand-authored in both', async () => {
    const problems = []
    for (const { file, text } of await sources('src/views')) {
      for (const match of text.matchAll(/<(\w+)[^<>]*\blang="fi"[^<>]*>([^<>]*)<\/\1>/g)) {
        const content = match[2].trim()
        if (!LETTERS.test(content) || content.includes('${')) continue
        const englishSibling = /^\s*<\w+[^<>]*\blang="en"/.test(text.slice(match.index + match[0].length))
        if (!englishSibling && !dictionary[content]?.en) problems.push(`${file}:${lineOf(text, match.index)}: "${content}" has no English`)
      }
    }
    assert.deepEqual(problems, [])
  })

  test('the Finnish messages the server sends are in the dictionary, with their links', async () => {
    const index = await readFile(new URL('../index.js', import.meta.url), 'utf8')
    const messages = [...index.matchAll(/new StudentStatusError\(\s*'([^']+)'(?:\s*,\s*\{\s*link:\s*\{\s*text:\s*'([^']+)',\s*href:\s*'([^']+)'\s*\}\s*\})?/g)]
    assert.ok(messages.length >= 4, 'found the student status refusals')
    for (const [, fi, linkText, href] of messages) {
      assert.ok(dictionary[fi]?.en, `"${fi}" is not in translations.json`)
      if (linkText) {
        assert.ok(fi.includes(linkText), `"${linkText}" is not in "${fi}"`)
        assert.match(dictionary[fi].en, new RegExp(`<a href="${href}">[^<]+</a>`), `the English of "${fi}" links to ${href}`)
      }
    }
  })
})
