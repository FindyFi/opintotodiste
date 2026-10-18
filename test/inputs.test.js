import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

// translate-element translates an element with a `lang` attribute by cloning
// it for each language and hiding the clones. A cloned input is a second form
// control that the page's code never reads, and when it's required, its hidden
// empty copy blocks the form. Inputs get their text from a <label lang> instead.
const SOURCES = ['public', 'src/views']
const LANG_INPUT = [/<(input|textarea)\b[^>]*\blang=/, /el\('(input|textarea)', \{[^}]*\blang:/]

test('no input or textarea carries a lang attribute', async () => {
  for (const dir of SOURCES) {
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.js'))) {
      const source = await readFile(`${dir}/${name}`, 'utf8')
      for (const pattern of LANG_INPUT) assert.doesNotMatch(source, pattern, `${dir}/${name}`)
    }
  }
})
