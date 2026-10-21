import { UserError } from './user-error.js'

const KOSKI_HOST = 'opintopolku.fi'
const OPINNOT_PATH_RE = /^\/koski\/(api\/)?opinnot\/([a-zA-Z0-9-]+)\/?$/

export class InvalidKoskiUrlError extends UserError {}

// Accepts either the share link a person copies from Oma Opintopolku
// (.../koski/opinnot/<id>) or the JSON API link (.../koski/api/opinnot/<id>)
// and returns the API link. Restricted to opintopolku.fi so this can't be
// used to make the server fetch arbitrary URLs.
export function toApiUrl(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    throw new InvalidKoskiUrlError('Anna kelvollinen osoite.')
  }
  if (url.hostname !== KOSKI_HOST) {
    throw new InvalidKoskiUrlError('Osoitteen on oltava opintopolku.fi-palvelussa.')
  }
  const match = url.pathname.match(OPINNOT_PATH_RE)
  if (!match) {
    throw new InvalidKoskiUrlError(
      'Osoitteen on oltava muotoa https://opintopolku.fi/koski/opinnot/… tai https://opintopolku.fi/koski/api/opinnot/…'
    )
  }
  const id = match[2]
  return `https://${KOSKI_HOST}/koski/api/opinnot/${id}`
}

// A study record is a few hundred kilobytes at most; the limit keeps a huge or
// endless response from filling the app's memory.
export const KOSKI_MAX_BYTES = 5 * 1024 * 1024
export const KOSKI_TIMEOUT_MS = 15_000
const KOSKI_TIMEOUT = 'Koski ei vastannut ajoissa. Yritä hetken päästä uudelleen.'
const KOSKI_TOO_LARGE = 'Koskesta tuli odottamattoman suuri vastaus, eikä sitä ladattu.'

// Redirects are refused, not followed: toApiUrl's host check would mean nothing
// if opintopolku.fi could send the request on to another server (an open
// redirect there would let a link import an attacker's data, or reach an
// internal address).
// Failures are UserErrors with what the user can do about them; what Koski
// actually answered is their `detail`, for the log.
export async function fetchKoskiData(apiUrl, { timeoutMs = KOSKI_TIMEOUT_MS, maxBytes = KOSKI_MAX_BYTES } = {}) {
  let res
  try {
    res = await fetch(apiUrl, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err.name === 'TimeoutError') throw new UserError(KOSKI_TIMEOUT, { status: 502, detail: err.message })
    throw new UserError('Koskeen ei saatu yhteyttä. Yritä hetken päästä uudelleen.', { status: 502, detail: err.message })
  }
  if (!res.ok) {
    await res.body?.cancel()
    const detail = `Koski responded with ${res.status} ${res.statusText}`
    if (res.status === 404) {
      throw new UserError('Koski ei löytänyt jaettuja tietoja. Jakolinkki voi olla vanhentunut tai poistettu: luo uusi Oma Opintopolussa.', { status: 400, detail })
    }
    throw new UserError('Koski vastasi virheellä. Yritä hetken päästä uudelleen.', { status: 502, detail })
  }
  if (Number(res.headers.get('content-length')) > maxBytes) {
    await res.body?.cancel()
    throw new UserError(KOSKI_TOO_LARGE, { status: 502 })
  }

  const chunks = []
  let size = 0
  try {
    for await (const chunk of res.body) {
      size += chunk.length
      if (size > maxBytes) throw new UserError(KOSKI_TOO_LARGE, { status: 502 })
      chunks.push(chunk)
    }
  } catch (err) {
    if (err.name === 'TimeoutError') throw new UserError(KOSKI_TIMEOUT, { status: 502, detail: err.message })
    throw err
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new UserError('Koski ei palauttanut opintotietoja.', { status: 502 })
  }
}

// The same person: the same learner number, or with none, the same names.
function samePerson(a, b) {
  if (a?.oid || b?.oid) return a?.oid === b?.oid
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

// A study right's identity across imports: its Koski oid, or for one without
// (higher education from Virta has none), its source system, its id there and
// the institution. Only a study right with neither is matched by its whole
// content, so any change to it makes a second copy.
function studyRightKey(oo) {
  if (oo?.oid) return JSON.stringify(['oid', oo.oid])
  const source = oo?.lähdejärjestelmänId
  if (source?.id) return JSON.stringify(['source', source.lähdejärjestelmä?.koodiarvo ?? null, source.id, oo.oppilaitos?.oid ?? null])
  return JSON.stringify(oo)
}

// Adds a new import to an earlier one: a study right (opiskeluoikeus) in both
// is taken from the new one, the rest of both are kept. Another person's data
// replaces the earlier import instead of mixing with it (`replaced`). Copies
// of one study right that earlier imports kept apart collapse into the latest.
export function mergeKoskiData(previous, next) {
  if (!previous || !samePerson(previous.henkilö, next.henkilö)) return { data: next, replaced: Boolean(previous) }
  const studyRights = new Map((previous.opiskeluoikeudet ?? []).map((oo) => [studyRightKey(oo), oo]))
  for (const oo of next.opiskeluoikeudet ?? []) studyRights.set(studyRightKey(oo), oo)
  return { data: { henkilö: next.henkilö, opiskeluoikeudet: [...studyRights.values()] }, replaced: false }
}

// Puts the merged result in place of `previous`. The records of the new
// import (`refs`) come back onto the list; `removed` adds to what is off it.
export function mergedImport(previous, { koskiUrl, data, refs = [], removed = [] }) {
  const merged = mergeKoskiData(previous?.data, data)
  const keep = merged.replaced ? [] : previous?.removed ?? []
  const back = new Set(refs)
  return {
    koskiUrl,
    data: merged.data,
    removed: [...new Set([...keep.filter((ref) => !back.has(ref)), ...removed])],
  }
}
