const KOSKI_HOST = 'opintopolku.fi'
const OPINNOT_PATH_RE = /^\/koski\/(api\/)?opinnot\/([a-zA-Z0-9-]+)\/?$/

export class InvalidKoskiUrlError extends Error {}

// Accepts either the share link a person copies from Oma Opintopolku
// (.../koski/opinnot/<id>) or the JSON API link (.../koski/api/opinnot/<id>)
// and returns the API link. Restricted to opintopolku.fi so this can't be
// used to make the server fetch arbitrary URLs.
export function toApiUrl(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    throw new InvalidKoskiUrlError('Please enter a valid URL.')
  }
  if (url.hostname !== KOSKI_HOST) {
    throw new InvalidKoskiUrlError(`The URL must point to ${KOSKI_HOST}.`)
  }
  const match = url.pathname.match(OPINNOT_PATH_RE)
  if (!match) {
    throw new InvalidKoskiUrlError(
      'The URL must look like https://opintopolku.fi/koski/opinnot/<id> or https://opintopolku.fi/koski/api/opinnot/<id>.'
    )
  }
  const id = match[2]
  return `https://${KOSKI_HOST}/koski/api/opinnot/${id}`
}

// A study record is a few hundred kilobytes at most; the limit keeps a huge or
// endless response from filling the app's memory.
export const KOSKI_MAX_BYTES = 5 * 1024 * 1024
export const KOSKI_TIMEOUT_MS = 15_000

// Redirects are refused, not followed: toApiUrl's host check would mean nothing
// if opintopolku.fi could send the request on to another server (an open
// redirect there would let a link import an attacker's data, or reach an
// internal address).
export async function fetchKoskiData(apiUrl, { timeoutMs = KOSKI_TIMEOUT_MS, maxBytes = KOSKI_MAX_BYTES } = {}) {
  let res
  try {
    res = await fetch(apiUrl, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('Koski did not respond in time.')
    throw new Error('Could not reach Koski.')
  }
  if (!res.ok) {
    await res.body?.cancel()
    throw new Error(`Koski responded with ${res.status} ${res.statusText}`)
  }
  if (Number(res.headers.get('content-length')) > maxBytes) {
    await res.body?.cancel()
    throw new Error('The Koski response is too large.')
  }

  const chunks = []
  let size = 0
  try {
    for await (const chunk of res.body) {
      size += chunk.length
      if (size > maxBytes) throw new Error('The Koski response is too large.')
      chunks.push(chunk)
    }
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('Koski did not respond in time.')
    throw err
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('Koski did not return a study record.')
  }
}
