import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { page } from '../src/views/main.js'

test('the main page lede links to Oma Opintopolku and the privacy notice, in both languages', async () => {
  const html = page()
  const lede = html.match(/<p class="lede" lang="fi">(.*?)<\/p>/s)[1]
  assert.match(lede, /<a href="https:\/\/opintopolku\.fi\/koski\/omattiedot">/)
  assert.match(lede, /<a href="\/policy">/)
  const dictionary = JSON.parse(await readFile(new URL('../public/translations.json', import.meta.url), 'utf8'))
  const en = dictionary[lede.replace(/<[^>]+>/g, '')]?.en
  assert.match(en, /<a href="https:\/\/opintopolku\.fi\/koski\/omattiedot">/)
  assert.match(en, /<a href="\/policy">/)
})
