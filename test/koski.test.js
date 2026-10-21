import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { InvalidKoskiUrlError, fetchKoskiData, mergeKoskiData, mergedImport, toApiUrl } from '../src/koski.js'
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
      await assert.rejects(() => fetchKoskiData(`${koski.url}/koski/api/opinnot/missing`), (err) => err.detail === 'Koski responded with 404 Not Found' && /Jakolinkki voi olla vanhentunut/.test(err.message))
    } finally {
      await koski.stop()
    }
  })

  test('refuses to follow a redirect', async () => {
    const elsewhere = await startStubServer(() => ({ json: { henkilö: { oid: 'attacker' } } }))
    const koski = await startStubServer(() => ({ status: 302, text: '', headers: { location: `${elsewhere.url}/data` } }))
    try {
      await assert.rejects(() => fetchKoskiData(`${koski.url}/koski/api/opinnot/abc123`), /Koskeen ei saatu yhteyttä/)
      assert.equal(elsewhere.requests.length, 0)
    } finally {
      await koski.stop()
      await elsewhere.stop()
    }
  })

  test('gives up on a slow response', async () => {
    const koski = await startStubServer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return { json: {} }
    })
    try {
      await assert.rejects(() => fetchKoskiData(`${koski.url}/koski/api/opinnot/abc123`, { timeoutMs: 50 }), /Koski ei vastannut ajoissa/)
    } finally {
      await koski.stop()
    }
  })

  test('refuses a response over the size limit', async () => {
    const koski = await startStubServer(() => ({ json: { padding: 'x'.repeat(2000) } }))
    try {
      await assert.rejects(() => fetchKoskiData(`${koski.url}/koski/api/opinnot/abc123`, { maxBytes: 1000 }), /odottamattoman suuri/)
    } finally {
      await koski.stop()
    }
  })

  test('refuses a response that is not JSON', async () => {
    const koski = await startStubServer(() => ({ text: '<html>maintenance</html>' }))
    try {
      await assert.rejects(() => fetchKoskiData(`${koski.url}/koski/api/opinnot/abc123`), /Koski ei palauttanut opintotietoja/)
    } finally {
      await koski.stop()
    }
  })
})

describe('merging imports', () => {
  const person = { oid: '1.2.246.562.24.1', kutsumanimi: 'Tapaus', sukunimi: 'Opiskelija' }
  const studyRight = (oid, name) => ({ oid, oppilaitos: { nimi: { fi: name } } })

  test('keeps the study rights of both, the newer one where both have it', () => {
    const before = { henkilö: person, opiskeluoikeudet: [studyRight('a', 'old A'), studyRight('b', 'B')] }
    const after = { henkilö: person, opiskeluoikeudet: [studyRight('a', 'new A'), studyRight('c', 'C')] }
    const { data, replaced } = mergeKoskiData(before, after)
    assert.equal(replaced, false)
    assert.deepEqual(data.opiskeluoikeudet.map((oo) => oo.oppilaitos.nimi.fi), ['new A', 'B', 'C'])
  })

  test('replaces another person’s data instead of mixing it in', () => {
    const before = { henkilö: person, opiskeluoikeudet: [studyRight('a', 'A')] }
    const other = { henkilö: { ...person, oid: '1.2.246.562.24.2' }, opiskeluoikeudet: [studyRight('x', 'X')] }
    assert.deepEqual(mergeKoskiData(before, other), { data: other, replaced: true })
  })

  test('without learner numbers, the same names count as the same person', () => {
    const noOid = { kutsumanimi: 'Tapaus', sukunimi: 'Opiskelija' }
    const merged = mergeKoskiData({ henkilö: noOid, opiskeluoikeudet: [studyRight('a', 'A')] }, { henkilö: noOid, opiskeluoikeudet: [studyRight('b', 'B')] })
    assert.equal(merged.data.opiskeluoikeudet.length, 2)
    assert.equal(mergeKoskiData({ henkilö: noOid, opiskeluoikeudet: [] }, { henkilö: { ...noOid, sukunimi: 'Muu' }, opiskeluoikeudet: [] }).replaced, true)
  })

  test('a study right without an oid is kept once', () => {
    const data = { henkilö: person, opiskeluoikeudet: [{ oppilaitos: { nimi: { fi: 'no oid' } } }] }
    assert.equal(mergeKoskiData(data, structuredClone(data)).data.opiskeluoikeudet.length, 1)
  })

  // Virta (higher education) study rights have no oid; their status and
  // semester registrations change between imports (K4).
  const virtaRight = (id, institution, status) => ({
    lähdejärjestelmänId: { id, lähdejärjestelmä: { koodiarvo: 'virta' } },
    oppilaitos: { oid: institution },
    tila: { opiskeluoikeusjaksot: [{ alku: '2025-09-01', tila: { koodiarvo: status } }] },
  })
  const statuses = (data) => data.opiskeluoikeudet.map((oo) => oo.tila.opiskeluoikeusjaksot[0].tila.koodiarvo)

  test('takes a changed Virta study right from the new import, once', () => {
    const before = { henkilö: person, opiskeluoikeudet: [virtaRight('0602703', 'u1', '1')] }
    const after = { henkilö: person, opiskeluoikeudet: [virtaRight('0602703', 'u1', '3')] }
    assert.deepEqual(statuses(mergeKoskiData(before, after).data), ['3'])
  })

  test('keeps apart Virta study rights with the same id at two institutions', () => {
    const before = { henkilö: person, opiskeluoikeudet: [virtaRight('0602703', 'u1', '1')] }
    const after = { henkilö: person, opiskeluoikeudet: [virtaRight('0602703', 'u2', '3')] }
    assert.deepEqual(statuses(mergeKoskiData(before, after).data), ['1', '3'])
  })

  test('collapses copies that earlier imports kept apart into the latest', () => {
    const stale = { henkilö: person, opiskeluoikeudet: [virtaRight('0602703', 'u1', '1'), virtaRight('0602703', 'u1', '6')] }
    assert.deepEqual(statuses(mergeKoskiData(stale, { henkilö: person, opiskeluoikeudet: [] }).data), ['6'])
  })

  test('brings the new import’s records back onto the list, and forgets removals on another person', () => {
    const data = { henkilö: person, opiskeluoikeudet: [] }
    const previous = { data, removed: ['r1', 'r2'] }
    assert.deepEqual(mergedImport(previous, { koskiUrl: 'u', data, refs: ['r2'] }).removed, ['r1'])
    assert.deepEqual(mergedImport(previous, { koskiUrl: 'u', data, removed: ['r3'] }).removed, ['r1', 'r2', 'r3'])
    const other = { henkilö: { ...person, oid: '1.2.246.562.24.2' }, opiskeluoikeudet: [] }
    assert.deepEqual(mergedImport(previous, { koskiUrl: 'u', data: other }).removed, [])
  })
})
