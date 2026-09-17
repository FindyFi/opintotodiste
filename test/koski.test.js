import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { InvalidKoskiUrlError, fetchKoskiData, toApiUrl } from '../src/koski.js'
import { startStubServer } from './helpers/stub-server.js'

describe('toApiUrl', () => {
  test('turns a share link into the api link', () => {
    assert.equal(
      toApiUrl('https://opintopolku.fi/koski/opinnot/abc123'),
      'https://opintopolku.fi/koski/api/opinnot/abc123'
    )
  })

  test('accepts an api link unchanged', () => {
    assert.equal(
      toApiUrl('https://opintopolku.fi/koski/api/opinnot/abc123'),
      'https://opintopolku.fi/koski/api/opinnot/abc123'
    )
  })

  test('tolerates a trailing slash', () => {
    assert.equal(
      toApiUrl('https://opintopolku.fi/koski/opinnot/abc123/'),
      'https://opintopolku.fi/koski/api/opinnot/abc123'
    )
  })

  test('ignores query strings and fragments', () => {
    assert.equal(
      toApiUrl('https://opintopolku.fi/koski/opinnot/abc123?lang=fi#top'),
      'https://opintopolku.fi/koski/api/opinnot/abc123'
    )
  })

  test('rejects a string that is not a url', () => {
    assert.throws(() => toApiUrl('not a url'), InvalidKoskiUrlError)
    assert.throws(() => toApiUrl(''), InvalidKoskiUrlError)
  })

  // This guard is what stops the endpoint being used to make the server
  // fetch arbitrary URLs on a caller's behalf.
  describe('restricts fetches to opintopolku.fi', () => {
    const elsewhere = [
      'https://evil.example/koski/opinnot/abc123',
      'https://opintopolku.fi.evil.example/koski/opinnot/abc123',
      'https://sub.opintopolku.fi/koski/opinnot/abc123',
      'http://169.254.169.254/koski/opinnot/abc123',
      'file:///etc/passwd',
    ]

    for (const url of elsewhere) {
      test(url, () => {
        assert.throws(() => toApiUrl(url), InvalidKoskiUrlError)
      })
    }
  })

  test('rejects a path that is not a study record', () => {
    assert.throws(() => toApiUrl('https://opintopolku.fi/'), InvalidKoskiUrlError)
    assert.throws(() => toApiUrl('https://opintopolku.fi/koski/opinnot/'), InvalidKoskiUrlError)
    assert.throws(() => toApiUrl('https://opintopolku.fi/koski/opinnot/abc/extra'), InvalidKoskiUrlError)
    assert.throws(() => toApiUrl('https://opintopolku.fi/koski/api/muu/abc123'), InvalidKoskiUrlError)
  })

  test('rejects an id with unexpected characters', () => {
    assert.throws(() => toApiUrl('https://opintopolku.fi/koski/opinnot/../../etc'), InvalidKoskiUrlError)
    assert.throws(() => toApiUrl('https://opintopolku.fi/koski/opinnot/abc_123'), InvalidKoskiUrlError)
  })
})

describe('fetchKoskiData', () => {
  test('returns the parsed study record', async () => {
    const koski = await startStubServer(() => ({ json: { henkilö: { oid: '1.2.3' } } }))
    try {
      const data = await fetchKoskiData(`${koski.url}/koski/api/opinnot/abc123`)

      assert.deepEqual(data, { henkilö: { oid: '1.2.3' } })
      assert.equal(koski.requests[0].headers.accept, 'application/json')
    } finally {
      await koski.stop()
    }
  })

  test('throws when Koski returns an error', async () => {
    const koski = await startStubServer(() => ({ status: 404, text: 'not found' }))
    try {
      await assert.rejects(() => fetchKoskiData(`${koski.url}/koski/api/opinnot/missing`), /Koski responded with 404/)
    } finally {
      await koski.stop()
    }
  })
})
