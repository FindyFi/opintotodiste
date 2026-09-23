// Test-only: makes the app's Koski fetch resolve to a fixture.
//
// `src/koski.js` restricts fetches to opintopolku.fi by design - that
// restriction is the app's SSRF boundary, and adding a configurable base URL
// to relax it in tests would put a hole in exactly the thing worth
// protecting. So the interception happens out here instead, in a module the
// test harness passes to the child process with `--import`. Production code
// has no idea this exists.
//
// KOSKI_STUB_FIXTURE names the file to serve; anything other than a Koski
// study-record URL falls through to the real fetch.
import { readFileSync } from 'node:fs'

const fixture = readFileSync(process.env.KOSKI_STUB_FIXTURE, 'utf8')
const KOSKI_RECORD = /^https:\/\/opintopolku\.fi\/koski\/api\/opinnot\/([a-zA-Z0-9-]+)$/

const realFetch = globalThis.fetch

globalThis.fetch = async function stubbedFetch(input, init) {
  const url = typeof input === 'string' ? input : input?.url
  const match = typeof url === 'string' && url.match(KOSKI_RECORD)

  if (!match) return realFetch(input, init)

  // `not-found` stands in for a share link that has lapsed, which is a real
  // failure mode worth being able to exercise.
  if (match[1] === 'not-found') {
    return new Response('Not Found', { status: 404, statusText: 'Not Found' })
  }

  return new Response(fixture, { status: 200, headers: { 'content-type': 'application/json' } })
}
