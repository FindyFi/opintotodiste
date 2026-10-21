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

  // The server's messages for the user (src/user-error.js, U22): every error
  // it sends carries `lang`, and every Finnish message it can send is in the
  // dictionary. The messages are the literals passed to the user error
  // classes, refuse(), `fallback:` and notFoundPage(), and the constants
  // those take (UPPER_CASE = '...').
  test('every error the server sends is marked Finnish', async () => {
    const problems = []
    for (const { file, text } of [...(await sources('src')), { file: 'index.js', text: await readFile(new URL('../index.js', import.meta.url), 'utf8') }]) {
      for (const match of text.matchAll(/\{\s*error:[^}\n]*\}/g)) {
        if (!/lang: 'fi'/.test(match[0])) problems.push(`${file}:${lineOf(text, match.index)}: ${match[0]} has no lang`)
      }
      if (/\.send\(\s*['`]/.test(text)) problems.push(`${file}: sends plain text; use views.notFoundPage() or a view`)
    }
    assert.deepEqual(problems, [])
  })

  test("the server's Finnish messages are in the dictionary, with their links", async () => {
    const files = [...(await sources('src')), { file: 'index.js', text: await readFile(new URL('../index.js', import.meta.url), 'utf8') }]
    const messages = new Map()
    const add = (file, text, index, message) => messages.set(message, `${file}:${lineOf(text, index)}`)
    for (const { file, text } of files) {
      const call = /(?:new (?:UserError|StudentStatusError|NotFoundError|InvalidKoskiUrlError)\(|refuse\(res, \d+, |fallback: |notFoundPage\(|message = )\s*'([^']+)'/g
      for (const match of text.matchAll(call)) add(file, text, match.index, match[1])
      for (const match of text.matchAll(/^(?:export )?const [A-Z_]+ = '([^']*\s[^']*)'$/gm)) add(file, text, match.index, match[1])
    }
    assert.ok(messages.size >= 40, `found the server's messages (${messages.size})`)
    const missing = [...messages].filter(([fi]) => !dictionary[fi]?.en).map(([fi, where]) => `${where}: "${fi}"`)
    assert.deepEqual(missing, [])

    const index = files.at(-1).text
    for (const [, fi, linkText, href] of index.matchAll(/new StudentStatusError\(\s*'([^']+)',\s*\{\s*link:\s*\{\s*text:\s*'([^']+)',\s*href:\s*'([^']+)'\s*\}\s*\}/g)) {
      assert.ok(fi.includes(linkText), `"${linkText}" is not in "${fi}"`)
      assert.match(dictionary[fi].en, new RegExp(`<a href="${href}">[^<]+</a>`), `the English of "${fi}" links to ${href}`)
    }
  })
})
