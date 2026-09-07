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

export async function fetchKoskiData(apiUrl) {
  const res = await fetch(apiUrl, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`Koski responded with ${res.status} ${res.statusText}`)
  }
  return res.json()
}
