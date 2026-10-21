import 'dotenv/config'
import './src/env-check.js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import QRCode from 'qrcode'
import { convert, holderName } from 'koski2openbadge'
import { toApiUrl, fetchKoskiData, InvalidKoskiUrlError, mergedImport } from './src/koski.js'
import { toVerifiableCredential, toVcdm2Credential, toSdJwtVcClaims, sdJwtVcDisclosable, toStudentStatusClaims, studentStatusDisclosable, credentialPerson, recordFromCredential, signCredential, credentialKey, isStudentStatus, hasExpired } from './src/badges.js'
import { createOffer, offerStatuses } from './src/oid4vci.js'
import { pool, runSchema } from './src/db.js'
import { scheduleUnusedAccountSweep } from './src/retention.js'
import * as auth from './src/auth.js'
import * as collections from './src/collections.js'
import * as koskiImports from './src/koski-imports.js'
import { DEMO_KOSKI_URL, isDemoData } from './src/demo.js'
import { didDocument, signingKey } from './src/issuer-did.js'
import { trustedIssuers } from './src/trusted-issuers.js'
import * as views from './src/views/index.js'
import { ogLanguageMiddleware } from './src/views/og.js'
import { rateLimit } from './src/rate-limit.js'

const app = express()
const PORT = process.env.PORT || 3000
const SUPPORTED_LANGS = ['fi', 'en']

// Deployed behind one load balancer hop, which terminates TLS: req.secure
// (for the Secure cookie) and req.ip (for the rate limits) come from its
// X-Forwarded-* headers.
app.set('trust proxy', 1)

// On every response, static files included. frame-ancestors (with
// X-Frame-Options for older browsers) stops clickjacking, e.g. "delete account"
// in a hidden frame. No referrer at all: share-link tokens are in our URLs,
// including /verify?url=, and must not leak to other sites in Referer.
// script-src is not restricted: the pages still embed their data inline.
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  next()
})

app.use(ogLanguageMiddleware)
app.use(express.json())
app.use(express.static('public'))
app.use('/vendor/translate-element', express.static('node_modules/translate-element'))
app.use('/vendor/simplewebauthn-browser', express.static('node_modules/@simplewebauthn/browser/dist/bundle'))
app.use('/vendor/archivo', express.static('node_modules/@fontsource-variable/archivo'))
// bundle.js plus the JSON-LD contexts it loads next to itself; not its demo page.
app.use('/vendor/veri-good', express.static('node_modules/@digitalcredentials/veri-good/dist', { index: false }))
// Over HTTPS the cookie is Secure and `__Host-` prefixed, so neither a plain
// HTTP page nor a sibling *.findy.fi subdomain can set or overwrite it.
// localhost over http:// (development, tests) keeps the old name. The cookie has
// no expiry, so it goes when the browser closes; the server keeps the session
// for 24 hours after the last request (connect-pg-simple's default).
const HTTPS_ORIGIN = (process.env.ORIGIN || '').startsWith('https://')
const SESSION_COOKIE = HTTPS_ORIGIN ? '__Host-sid' : 'connect.sid'
const SESSION_COOKIE_OPTIONS = { path: '/', httpOnly: true, secure: HTTPS_ORIGIN, sameSite: 'lax' }

app.use(
  session({
    store: new (connectPgSimple(session))({ pool }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    name: SESSION_COOKIE,
    cookie: SESSION_COOKIE_OPTIONS,
    resave: false,
    saveUninitialized: false,
  })
)

// What an anonymous user's import puts in the session (a signed-in user's goes
// to the database). It goes after an hour without requests (someone who walked
// away from a shared computer), on "clear my data", on signing in (moved to
// the account) and with the session. `credentials` and `personName` are from
// sessions made before U18.
const KOSKI_SESSION_KEYS = ['koskiUrl', 'koskiData', 'removedRefs', 'signedRefs', 'koskiSeenAt', 'credentials', 'personName']
const KOSKI_IDLE_MS = 60 * 60 * 1000

function clearKoskiData(session) {
  for (const key of KOSKI_SESSION_KEYS) delete session[key]
}

app.use((req, res, next) => {
  if (req.session.koskiData) {
    const idle = Date.now() - (req.session.koskiSeenAt ?? 0)
    if (idle > KOSKI_IDLE_MS) clearKoskiData(req.session)
    // Saving the session on every request isn't needed for an hour's precision.
    else if (idle > 60 * 1000) req.session.koskiSeenAt = Date.now()
  }
  next()
})

// A fresh session id once someone signs in, so an id planted in their browser
// beforehand (session fixation) is worth nothing afterwards. Everything but
// the finished ceremony carries over: the imported Koski data, and the user.
function regenerateSession(req) {
  const keep = Object.fromEntries(
    Object.entries(req.session).filter(([key]) => !['cookie', 'pendingLogin', 'pendingRegistration'].includes(key))
  )
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err)
      Object.assign(req.session, keep)
      resolve()
    })
  })
}

// Per client IP; see src/rate-limit.js. Generous enough for a classroom behind
// one address.
const FIVE_MINUTES = 5 * 60 * 1000
const importLimit = rateLimit({ windowMs: FIVE_MINUTES, max: 60 })
const signingLimit = rateLimit({ windowMs: FIVE_MINUTES, max: 200 })
const authLimit = rateLimit({ windowMs: FIVE_MINUTES, max: 100 })
// The wallet dialog polls every few seconds while it is open.
const offerStatusLimit = rateLimit({ windowMs: FIVE_MINUTES, max: 1000 })

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please sign in with a passkey first.' })
  next()
}

app.get('/healthz', (req, res) => res.sendStatus(200))

app.get('/', async (req, res) => {
  const initialData = req.session.koskiData || req.session.userId ? await credentialsResponse(req) : null
  // The page embeds the imported records: no copy for the next person at a
  // shared computer to find in the cache or with the back button.
  res.set('Cache-Control', 'no-store')
  const koskiUrl = req.session.koskiUrl === DEMO_KOSKI_URL ? '' : req.session.koskiUrl
  res.send(views.page({ koskiUrl, initialData, signedIn: Boolean(req.session.userId) }))
})

// Only what convert() and the page use is kept in the session: the learner
// number and names (kutsumanimi is the name convert() prefers), and the study records. Anything else Koski sends about the
// person (an identity code or a birth date, if a share link ever carries them)
// is dropped before the session is saved; /policy says so.
function minimalKoskiData(data) {
  const { oid, kutsumanimi, etunimet, sukunimi } = data.henkilö ?? {}
  return { henkilö: { oid, kutsumanimi, etunimet, sukunimi }, opiskeluoikeudet: data.opiskeluoikeudet }
}

// A record's reference in URLs and request bodies: a hash of credentialKey, so
// it stays the same in every language and across imports (koski2openbadge
// derives every achievement id from the Koski record, never from its texts).
const recordRef = (record) => createHash('sha256').update(credentialKey(record)).digest('base64url').slice(0, 22)
const RECORD_REF = /^[A-Za-z0-9_-]{22}$/

// Where this request's Koski data is: the signed-in user's stored import, or
// an anonymous user's session.
// A session signed in before U18 still has its Koski data, and moves it now.
async function koskiSource(req) {
  if (req.session.userId) {
    await moveSessionImport(req)
    return koskiImports.findImport(req.session.userId)
  }
  if (!req.session.koskiData) return null
  return { koskiUrl: req.session.koskiUrl, data: req.session.koskiData, removed: req.session.removedRefs ?? [] }
}

// The records converted from `data` in the session's language, one per ref,
// with the removed ones left out.
function recordsOf(source, lang) {
  const removed = new Set(source.removed)
  const seen = new Set()
  const records = []
  for (const record of convert(source.data, { lang })) {
    const ref = recordRef(record)
    if (seen.has(ref) || removed.has(ref)) continue
    seen.add(ref)
    records.push({ ref, record })
  }
  return records
}

const sessionLang = (req) => (SUPPORTED_LANGS.includes(req.session.lang) ? req.session.lang : 'fi')

async function findRecord(req, ref) {
  if (typeof ref !== 'string' || !RECORD_REF.test(ref)) return null
  return recordIn(req, await koskiSource(req), ref)
}

function recordIn(req, source, ref) {
  return (source && recordsOf(source, sessionLang(req)).find((r) => r.ref === ref)?.record) ?? null
}

// Refusing to sign a student status, with a message for the user (409).
// Its message is Finnish, the UI's source language: the pages mark it
// lang="fi" and translate-element finds its English in
// public/translations.json, like any other text. `link` ({ text, href })
// makes `text` in the message a link.
class StudentStatusError extends Error {
  constructor(message, { link } = {}) {
    super(message)
    this.link = link
  }
}

// A student status is confirmed against Koski whenever it is signed or sent to
// a wallet (K3): the import's share link is fetched again, and the status is
// signed only if the fresh data still has it, as of now. Only the fresh data
// counts, since the merged import also keeps study rights that Koski no
// longer returns (mergeKoskiData). The fetch is still merged into
// the import, like any other but without bringing removed records back. The
// demo data has no link and is converted as it is.
// Returns the fresh record and the person, with the birth date from that fetch
// (`syntymäaika`) for the wallet credential (K5). minimalKoskiData drops it,
// so it is never stored.
async function confirmedStatus(req, ref) {
  const source = await koskiSource(req)
  if (!source) throw new StudentStatusError('Koski-tietojasi ei ole ladattu, joten opiskelijatilannetta ei voitu tarkastaa. Lataa tietosi uudelleen.')
  if (source.koskiUrl === DEMO_KOSKI_URL) {
    return freshStatus(source.data, ref, sessionLang(req), { ...source.data.henkilö, syntymäaika: demoData.henkilö.syntymäaika })
  }
  let fetched
  try {
    fetched = await fetchKoskiData(toApiUrl(source.koskiUrl))
  } catch (err) {
    // The reason (e.g. "Koski responded with 404") goes to the log: the user's
    // next step is the same whatever it is.
    console.warn('Confirming a student status in Koski failed:', err.message)
    throw new StudentStatusError(
      'Opiskelijatilannettasi ei voitu tarkastaa Koskesta. Jos Koski-jakolinkkisi on vanhentunut, luo uusi Oma Opintopolussa ja lataa tietosi uudelleen.'
    )
  }
  const data = minimalKoskiData(fetched)
  await addImport(req, { koskiUrl: source.koskiUrl, data }, { restore: false })
  return freshStatus(data, ref, sessionLang(req), { ...data.henkilö, syntymäaika: fetched.henkilö?.syntymäaika })
}

// The student status `ref` in `data`. When it isn't there, the refusal says
// whether Koski still shows another enrolment (the study right's details
// changed, so its ref did too: the list has it under the new one) or none, so
// that the user isn't left retrying something that can't succeed.
function freshStatus(data, ref, lang, henkilö) {
  const records = recordsOf({ data, removed: [] }, lang)
  const fresh = records.find((r) => r.ref === ref)?.record
  if (fresh) return { record: fresh, henkilö }
  if (records.some((r) => isStudentStatus(r.record.credentialSubject))) {
    throw new StudentStatusError('Näiden opintojen tiedot ovat muuttuneet. Katso päivitetty lista.', { link: { text: 'lista', href: '/' } })
  }
  throw new StudentStatusError('Koskessa et ole enää läsnä näissä opinnoissa, joten opiskelijatodistetta ei allekirjoitettu.')
}

// The record as it is signed: a student status confirmed first, anything else
// as it is. `{ record, henkilö }`, the person only from a confirmation.
async function recordToSign(req, ref, record) {
  return isStudentStatus(record.credentialSubject) ? confirmedStatus(req, ref) : { record }
}

function sendSigningError(res, err, what) {
  if (err instanceof StudentStatusError) return res.status(409).json({ error: err.message, lang: 'fi', ...(err.link ? { link: err.link } : {}) })
  // A 502 here means a dependency refused the request, not that the user
  // did anything wrong - log it, or the only trace is a message in the
  // browser that nobody operating the service ever sees.
  console.error(`${what} failed:`, err.message)
  res.status(502).json({ error: err.message })
}

function signVerifiableCredential(record) {
  const vc = toVerifiableCredential(record, {
    issuerId: process.env.ISSUER_ID,
    issuerName: process.env.ISSUER_NAME,
  })
  return signCredential(vc, {
    baseUrl: process.env.SIGNING_SERVICE_URL,
    instanceId: process.env.SIGNING_SERVICE_INSTANCE_ID,
    suite: process.env.SIGNING_SERVICE_SUITE,
  })
}

// The signed credential for a record, made only when an action needs one and
// kept from then on: a signed-in user's in their saved credentials
// (`credentialId`), an anonymous user's in the session. A kept copy that has
// expired (a student status) is signed again in its place. `confirmed`: the
// record has already been through recordToSign.
async function signedRecord(req, ref, record, { confirmed = false } = {}) {
  const sign = async () => signVerifiableCredential(confirmed ? record : (await recordToSign(req, ref, record)).record)
  if (req.session.userId) {
    const existing = await collections.findSavedByRef(req.session.userId, ref)
    if (existing && !hasExpired(existing.credential)) return { credentialId: existing.id, signed: existing.credential }
    const signed = await sign()
    if (existing) {
      await collections.replaceSavedCredential(req.session.userId, existing.id, signed)
      return { credentialId: existing.id, signed }
    }
    return { credentialId: (await collections.saveCredential(req.session.userId, signed, ref)).id, signed }
  }
  req.session.signedRefs ??= {}
  const kept = req.session.signedRefs[ref]
  if (!kept || hasExpired(kept)) req.session.signedRefs[ref] = await sign()
  return { signed: req.session.signedRefs[ref] }
}

const storedEntry = (item) => ({ credentialId: item.id, ...recordFromCredential(item.credential), signed: true })

// The page's one list: the records converted from the Koski data (`ref`), in
// the current language, plus for a signed-in user any saved credential no
// record matches (`credentialId` only, e.g. saved before U18). A record that
// has been signed carries its saved copy's id: by its ref, or for copies saved
// before refs, by credentialKey.
async function credentialsResponse(req) {
  const source = await koskiSource(req)
  const records = source ? recordsOf(source, sessionLang(req)) : []
  const demo = Boolean(source && isDemoData(source.data))
  const stored = req.session.userId ? await collections.listSavedCredentials(req.session.userId) : []
  const byRef = new Map(stored.filter((item) => item.recordRef).map((item) => [item.recordRef, item]))
  const byKey = new Map(stored.filter((item) => !item.recordRef).map((item) => [credentialKey(item.credential), item]))
  const shown = new Set()
  const entries = records.map(({ ref, record }) => {
    const item = byRef.get(ref) ?? byKey.get(credentialKey(record))
    if (item && shown.has(item.id)) return { ...record, ref, signed: false }
    if (item) shown.add(item.id)
    // An expired copy (a student status) gets signed again, so the row is unsigned.
    const kept = item?.credential ?? req.session.signedRefs?.[ref]
    return { ...record, ref, credentialId: item?.id, signed: Boolean(kept && !hasExpired(kept)) }
  })
  return {
    personName: source ? holderName(source.data.henkilö) ?? '' : undefined,
    koskiUrl: demo ? undefined : source?.koskiUrl,
    demo,
    credentials: [...entries, ...stored.filter((item) => !shown.has(item.id)).map(storedEntry)],
  }
}

app.get('/credentials', async (req, res) => {
  res.json(await credentialsResponse(req))
})

// A signed-in user's import is merged into their stored Koski data (see
// src/koski-imports.js); an anonymous user's into the session, the same way.
// Either way the records it holds come back onto the list, unless `restore` is
// false (a fetch made to confirm a student status).
async function addImport(req, { koskiUrl, data }, { restore = true } = {}) {
  const refs = restore ? convert(data, { lang: 'fi' }).map(recordRef) : []
  if (req.session.userId) return koskiImports.saveImport(req.session.userId, { koskiUrl, data, refs })
  const previous = req.session.koskiData ? { data: req.session.koskiData, removed: req.session.removedRefs ?? [] } : null
  const next = mergedImport(previous, { koskiUrl, data, refs })
  req.session.koskiUrl = next.koskiUrl
  req.session.koskiData = next.data
  req.session.removedRefs = next.removed
  req.session.koskiSeenAt = Date.now()
}

// Signing in keeps what was imported before it: the session's Koski data moves
// into the account, and the session keeps none.
async function moveSessionImport(req) {
  if (!req.session.koskiData) return
  const data = req.session.koskiData
  const refs = convert(data, { lang: 'fi' }).map(recordRef)
  const removed = req.session.removedRefs ?? []
  await koskiImports.saveImport(req.session.userId, { koskiUrl: req.session.koskiUrl, data, refs: refs.filter((ref) => !removed.includes(ref)), removed })
  clearKoskiData(req.session)
}

app.post('/credentials', importLimit, async (req, res) => {
  const koskiUrl = (req.body?.koskiUrl || '').trim()
  const lang = SUPPORTED_LANGS.includes(req.body?.lang) ? req.body.lang : 'fi'
  try {
    const apiUrl = toApiUrl(koskiUrl)
    const data = minimalKoskiData(await fetchKoskiData(apiUrl))
    await addImport(req, { koskiUrl, data })
    req.session.lang = lang
    res.json(await credentialsResponse(req))
  } catch (err) {
    const message = err instanceof InvalidKoskiUrlError ? err.message : `Could not load Koski data: ${err.message}`
    res.status(400).json({ error: message })
  }
})

// "Kokeile palvelua esittelytiedoilla": the bundled synthetic record goes in
// like a Koski import. Only when there is no import yet, so it can never
// replace someone's own data; a real import replaces it later (another
// henkilö.oid, see mergeKoskiData).
const demoData = JSON.parse(readFileSync(new URL('./src/demo-koski.json', import.meta.url), 'utf8'))
app.post('/demo', importLimit, async (req, res) => {
  if (await koskiSource(req)) return res.status(409).json({ error: 'Koski data has been loaded already.' })
  await addImport(req, { koskiUrl: DEMO_KOSKI_URL, data: minimalKoskiData(demoData) })
  req.session.lang = SUPPORTED_LANGS.includes(req.body?.lang) ? req.body.lang : 'fi'
  res.json(await credentialsResponse(req))
})

// "Clear my data": the imported Koski data goes. An anonymous session has
// nothing else, so it goes as a whole. For a signed-in user (no button for it
// yet) the stored Koski data goes; saved credentials, collections and links
// stay.
app.delete('/credentials', async (req, res) => {
  if (req.session.userId) {
    await koskiImports.deleteImport(req.session.userId)
    clearKoskiData(req.session)
    return res.json({ ok: true })
  }
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS)
    res.json({ ok: true })
  })
})

// "Poista" on a record takes it off the list until an import brings it back.
app.delete('/credentials/:ref', async (req, res) => {
  if (!(await findRecord(req, req.params.ref))) return res.status(404).json({ error: 'Credential not found. Please load your Koski data again.' })
  if (req.session.userId) await koskiImports.removeRecord(req.session.userId, req.params.ref)
  else req.session.removedRefs = [...(req.session.removedRefs ?? []), req.params.ref]
  res.status(204).end()
})

// The language the records are converted in (e.g. when the UI language
// switcher changes); the Koski data is converted again, with no round trip
// to Koski.
app.post('/credentials/lang', async (req, res) => {
  req.session.lang = SUPPORTED_LANGS.includes(req.body?.lang) ? req.body.lang : 'fi'
  res.json(await credentialsResponse(req))
})

// "Lataa": signs the record if it hasn't been yet; for a signed-in user that
// is their saved copy (credentialId).
app.post('/credentials/:ref/sign', signingLimit, async (req, res) => {
  const record = await findRecord(req, req.params.ref)
  if (!record) return res.status(404).json({ error: 'Credential not found. Please load your Koski data again.' })
  try {
    res.json(await signedRecord(req, req.params.ref, record))
  } catch (err) {
    sendSigningError(res, err, 'Signing')
  }
})

// Hands an unsigned credential for `record` to the OID4VCI issuer and returns
// what the wallet dialog needs: the offer URI as a QR code, its lifetime, and
// the pre-authorized code to ask for its status with (the offer URI leads to
// that code anyway).
// With OID4VCI_CREDENTIAL_VCT set it's SD-JWT VC claims, with the holder's
// name and oid selectively disclosable (G9) and the name's parts taken from
// the Koski person `henkilö` (G10), otherwise VCDM 2.0. A record's
// `validUntil` (a student status) becomes the credential's `exp`.
// With OID4VCI_STUDENT_STATUS_VCT set, a student status goes as its own type
// (K5), with its own configuration and disclosable claims; `henkilö` may then
// carry the birth date of a fresh fetch.
async function createWalletOffer(record, henkilö) {
  if (isStudentStatus(record.credentialSubject) && process.env.OID4VCI_STUDENT_STATUS_VCT) {
    const claims = toStudentStatusClaims(record, { vct: process.env.OID4VCI_STUDENT_STATUS_VCT, henkilö })
    return walletOffer(record, claims, {
      credentialConfigurationId: process.env.OID4VCI_STUDENT_STATUS_CONFIGURATION_ID || 'StudentStatusSdJwtVc',
      disclosable: studentStatusDisclosable(claims),
    })
  }
  const sdJwtVc = Boolean(process.env.OID4VCI_CREDENTIAL_VCT)
  const vc = sdJwtVc
    ? toSdJwtVcClaims(record, { vct: process.env.OID4VCI_CREDENTIAL_VCT, henkilö })
    : toVcdm2Credential(record, {
        issuerId: process.env.OID4VCI_CREDENTIAL_ISSUER_ID,
        issuerName: process.env.ISSUER_NAME,
      })
  return walletOffer(record, vc, {
    credentialConfigurationId: process.env.OID4VCI_CREDENTIAL_CONFIGURATION_ID || undefined,
    disclosable: sdJwtVc ? sdJwtVcDisclosable(vc) : undefined,
  })
}

async function walletOffer(record, vc, { credentialConfigurationId, disclosable }) {
  const { preAuthorizedCode, offerUri, txCode, expiresIn } = await createOffer(vc, {
    baseUrl: process.env.OID4VCI_ISSUER_URL,
    tenant: process.env.OID4VCI_ISSUER_INSTANCE,
    token: process.env.OID4VCI_ISSUER_TOKEN,
    credentialConfigurationId,
    disclosable,
    validUntil: record.validUntil,
  })
  const qrDataUrl = await QRCode.toDataURL(offerUri)
  return { offerUri, qrDataUrl, txCode, expiresIn, code: preAuthorizedCode }
}

const OFFER_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_OFFER_STATUS_CODES = 50

// Lets the wallet dialog show when an offer is picked up, so the user notices
// if someone else got to it first (threat analysis T11). Takes the codes from
// createWalletOffer and answers { <code>: 'waiting' | 'picked-up' | 'expired' }.
app.post('/wallet-offers/status', offerStatusLimit, async (req, res) => {
  const { codes } = req.body ?? {}
  if (
    !Array.isArray(codes) ||
    codes.length === 0 ||
    codes.length > MAX_OFFER_STATUS_CODES ||
    !codes.every((code) => typeof code === 'string' && OFFER_CODE.test(code))
  ) {
    return res.status(400).json({ error: `codes must be 1-${MAX_OFFER_STATUS_CODES} offer codes.` })
  }
  try {
    res.json(
      await offerStatuses(codes, {
        baseUrl: process.env.OID4VCI_ISSUER_URL,
        tenant: process.env.OID4VCI_ISSUER_INSTANCE,
      })
    )
  } catch (err) {
    console.error('Checking wallet offer status failed:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// The offer itself never needs signCredential - it hands an unsigned VC to the
// OID4VCI issuer, which signs it only once a wallet actually completes the
// flow. A signed-in user's record is still signed and saved, like any record
// that leaves the service; if that fails, the offer goes ahead without it.
app.post('/credentials/:ref/offer', signingLimit, async (req, res) => {
  const source = RECORD_REF.test(req.params.ref) ? await koskiSource(req) : null
  let record = recordIn(req, source, req.params.ref)
  if (!record) return res.status(404).json({ error: 'Credential not found. Please load your Koski data again.' })
  let henkilö = source.data.henkilö
  try {
    const confirmed = await recordToSign(req, req.params.ref, record)
    record = confirmed.record
    henkilö = confirmed.henkilö ?? henkilö
  } catch (err) {
    return sendSigningError(res, err, 'Confirming a student status')
  }

  let credentialId
  if (req.session.userId) {
    try {
      credentialId = (await signedRecord(req, req.params.ref, record, { confirmed: true })).credentialId
    } catch (err) {
      console.error('Saving a credential for a wallet offer failed:', err.message)
    }
  }
  try {
    res.json({ ...(await createWalletOffer(record, henkilö)), credentialId })
  } catch (err) {
    console.error('Creating a credential offer failed:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// An anonymous user's signed record (a signed-in user's is a saved credential,
// GET /saved-credentials/:id/download).
app.get('/credentials/:ref/download', (req, res) => {
  const signed = RECORD_REF.test(req.params.ref) ? req.session.signedRefs?.[req.params.ref] : undefined
  if (!signed) return res.status(404).send('No signed credential available yet.')
  res.setHeader('Content-Disposition', `attachment; filename="credential-${req.params.ref}.json"`)
  res.json(signed)
})

// --- Passkey auth ---------------------------------------------------------

app.get('/auth/me', async (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false })
  const passkeys = await auth.listPasskeys(req.session.userId)
  res.json({ loggedIn: true, displayName: req.session.displayName, passkeys })
})

app.post('/auth/register/options', authLimit, async (req, res) => {
  try {
    res.json(await auth.beginRegistration(req, req.body?.displayName))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/auth/register/verify', async (req, res) => {
  try {
    const user = await auth.completeRegistration(req, req.body)
    await regenerateSession(req)
    await moveSessionImport(req)
    res.json({ displayName: user.displayName })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/auth/login/options', authLimit, async (req, res) => {
  try {
    res.json(await auth.beginLogin(req))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/auth/login/verify', async (req, res) => {
  try {
    const user = await auth.completeLogin(req, req.body)
    await regenerateSession(req)
    await moveSessionImport(req)
    res.json({ displayName: user.displayName })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }))
})

app.delete('/auth/account', requireAuth, async (req, res) => {
  try {
    const deleted = await auth.deleteAccount(req.session.userId)
    req.session.destroy(() => res.json({ ok: true, passkey: deleted }))
  } catch (err) {
    console.error('Deleting an account failed:', err.message)
    res.status(500).json({ error: 'The account could not be deleted. Please try again.' })
  }
})

// Signs the records at `refs` where needed and returns each one's saved copy
// for the signed-in user. Per-record results, so one failure doesn't sink the
// rest.
async function saveRecords(req, refs) {
  const results = []
  for (const ref of refs) {
    const record = await findRecord(req, ref)
    if (!record) {
      results.push({ ref, error: 'Credential not found. Please load your Koski data again.' })
      continue
    }
    const name = record.credentialSubject?.achievement?.name ?? ''
    try {
      results.push({ ref, name, ...(await signedRecord(req, ref, record)) })
    } catch (err) {
      results.push({ ref, name, error: err.message })
    }
  }
  return results
}

function sendCollectionsError(res, err) {
  res.status(err instanceof collections.NotFoundError ? 404 : 400).json({ error: err.message })
}

// --- Saved credentials -----------------------------------------------------

app.get('/saved-credentials', requireAuth, async (req, res) => {
  res.json({ credentials: await collections.listSavedCredentials(req.session.userId) })
})

app.post('/saved-credentials', requireAuth, signingLimit, async (req, res) => {
  const refs = Array.isArray(req.body?.refs) ? req.body.refs : []
  res.json({ results: await saveRecords(req, refs) })
})

app.get('/saved-credentials/:id/download', requireAuth, async (req, res) => {
  const credential = await collections.findSavedCredential(req.session.userId, req.params.id)
  if (!credential) return res.status(404).send('Credential not found.')
  res.setHeader('Content-Disposition', `attachment; filename="credential-${req.params.id}.json"`)
  res.json(credential)
})

app.delete('/saved-credentials/:id', requireAuth, async (req, res) => {
  try {
    await collections.deleteSavedCredential(req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) {
    sendCollectionsError(res, err)
  }
})

// Owner only: with no holder binding, a public share link must not be able to
// put someone else's badge into the visitor's wallet. The stored ldp_vc is
// re-issued as a VCDM 2.0 credential for the wallet. The name's parts come
// from the owner's Koski import, if it is the credential's person.
// A student status is confirmed against Koski first, like one from the list
// (K5): the wallet gets the fresh status, never the saved snapshot, and
// nothing when Koski can't confirm it. Its ref comes from the credential
// itself (a status has no award date in its key), so copies saved before
// refs were stored are found too. The saved copy itself stays as it was.
app.post('/saved-credentials/:id/offer', requireAuth, signingLimit, async (req, res) => {
  const credential = await collections.findSavedCredential(req.session.userId, req.params.id)
  if (!credential) return res.status(404).json({ error: 'Credential not found.' })

  if (isStudentStatus(credential.credentialSubject)) {
    let confirmed
    try {
      confirmed = await confirmedStatus(req, recordRef({ credentialSubject: credential.credentialSubject }))
    } catch (err) {
      return sendSigningError(res, err, 'Confirming a student status')
    }
    try {
      return res.json(await createWalletOffer(confirmed.record, confirmed.henkilö))
    } catch (err) {
      console.error('Creating a credential offer failed:', err.message)
      return res.status(502).json({ error: err.message })
    }
  }

  // Any other saved copy goes to the wallet as it is, with the date it was
  // signed.
  if (hasExpired(credential)) return res.status(409).json({ error: 'This credential has expired.' })
  try {
    const source = await koskiSource(req)
    const henkilö = credentialPerson(credential.credentialSubject, source?.data.henkilö)
    res.json(await createWalletOffer(recordFromCredential(credential), henkilö))
  } catch (err) {
    console.error('Creating a credential offer failed:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// --- Collections -----------------------------------------------------------

app.get('/collections', requireAuth, async (req, res) => {
  res.json({ collections: await collections.listCollections(req.session.userId) })
})

app.post('/collections', requireAuth, async (req, res) => {
  try {
    res.json(await collections.createCollection(req.session.userId, req.body?.name))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.patch('/collections/:id', requireAuth, async (req, res) => {
  try {
    res.json(await collections.renameCollection(req.session.userId, req.params.id, req.body?.name))
  } catch (err) {
    sendCollectionsError(res, err)
  }
})

app.delete('/collections/:id', requireAuth, async (req, res) => {
  try {
    await collections.deleteCollection(req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) {
    sendCollectionsError(res, err)
  }
})

// Adds saved credentials (`credentialIds`) and/or records (`refs`, saved
// first) to the collection.
app.post('/collections/:id/items', requireAuth, signingLimit, async (req, res) => {
  try {
    await collections.assertOwnedCollection(req.session.userId, req.params.id)
  } catch (err) {
    return sendCollectionsError(res, err)
  }

  const refs = Array.isArray(req.body?.refs) ? req.body.refs : []
  const credentialIds = Array.isArray(req.body?.credentialIds) ? req.body.credentialIds : []
  const results = [...(await saveRecords(req, refs)), ...credentialIds.map((credentialId) => ({ credentialId }))]
  for (const result of results) {
    if (result.error) continue
    try {
      await collections.addItem(req.session.userId, req.params.id, result.credentialId)
    } catch (err) {
      result.error = err.message
    }
  }
  res.json({ results })
})

app.delete('/collections/:id/items/:credentialId', requireAuth, async (req, res) => {
  try {
    await collections.removeItem(req.session.userId, req.params.id, req.params.credentialId)
    res.status(204).end()
  } catch (err) {
    sendCollectionsError(res, err)
  }
})

app.get('/collections/:id/items', requireAuth, async (req, res) => {
  try {
    res.json({ items: await collections.listItems(req.session.userId, req.params.id) })
  } catch (err) {
    sendCollectionsError(res, err)
  }
})

// --- Share links -------------------------------------------------------------

// One link per recipient, to a collection or to one saved credential:
// ?collectionId= or ?credentialId= (in the body for POST). GET with neither
// lists all the owner's links.
function shareTarget(source) {
  const collectionId = typeof source?.collectionId === 'string' ? source.collectionId : undefined
  const credentialId = typeof source?.credentialId === 'string' ? source.credentialId : undefined
  return collectionId ? { collectionId } : { credentialId }
}

app.get('/share-links', requireAuth, async (req, res) => {
  try {
    const target = shareTarget(req.query)
    const links = target.collectionId || target.credentialId
      ? await collections.listShareLinks(req.session.userId, target)
      : await collections.listAllShareLinks(req.session.userId)
    res.json({ links })
  } catch (err) {
    sendCollectionsError(res, err)
  }
})

app.post('/share-links', requireAuth, async (req, res) => {
  try {
    res.json(await collections.createShareLink(req.session.userId, shareTarget(req.body), req.body?.label))
  } catch (err) {
    sendCollectionsError(res, err)
  }
})

app.delete('/share-links/:id', requireAuth, async (req, res) => {
  try {
    await collections.deleteShareLink(req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) {
    sendCollectionsError(res, err)
  }
})

// --- Public share links -----------------------------------------------------

// Shared collections and credentials are for the people the owner sends the
// link to, not for search results, even if someone posts a link publicly.
app.use(['/c/', '/i/'], (req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow')
  next()
})

function sendCredentialDownload(res, credential, name) {
  res.setHeader('Content-Disposition', `attachment; filename="credential-${name}.json"`)
  res.json(credential)
}

app.get('/c/:token', async (req, res) => {
  const found = await collections.findSharedCollection(req.params.token)
  if (!found) return res.status(404).send('Collection not found.')
  res.send(views.sharedCollectionPage({ token: req.params.token, ...found }))
})

app.get('/c/:token/items/:itemId', async (req, res) => {
  const credential = await collections.findSharedCollectionItem(req.params.token, req.params.itemId)
  if (!credential) return res.status(404).send('Credential not found.')
  res.send(views.sharedItemPage({ path: `/c/${req.params.token}/items/${req.params.itemId}`, credential }))
})

app.get('/c/:token/items/:itemId/download', async (req, res) => {
  const credential = await collections.findSharedCollectionItem(req.params.token, req.params.itemId)
  if (!credential) return res.status(404).send('Credential not found.')
  sendCredentialDownload(res, credential, req.params.itemId)
})

app.get('/i/:token', async (req, res) => {
  const credential = await collections.findSharedCredential(req.params.token)
  if (!credential) return res.status(404).send('Credential not found.')
  res.send(views.sharedItemPage({ path: `/i/${req.params.token}`, credential }))
})

app.get('/i/:token/download', async (req, res) => {
  const credential = await collections.findSharedCredential(req.params.token)
  if (!credential) return res.status(404).send('Credential not found.')
  sendCredentialDownload(res, credential, 'shared')
})

app.get('/employer', (req, res) => {
  res.send(views.employerPage())
})

app.get('/policy', (req, res) => {
  res.send(views.policyPage())
})

app.get('/my/collections', (req, res) => {
  res.send(views.collectionsPage())
})

app.get('/guide/:name', (req, res) => {
  if (!views.GUIDE_NAMES.includes(req.params.name)) return res.status(404).send('Guide not found.')
  res.send(views.guidePage(req.params.name))
})

app.get('/verify', async (req, res) => {
  const issuers = await trustedIssuers(
    {
      baseUrl: process.env.SIGNING_SERVICE_URL,
      instanceId: process.env.SIGNING_SERVICE_INSTANCE_ID,
      suite: process.env.SIGNING_SERVICE_SUITE,
    },
    { issuerName: process.env.ISSUER_NAME, url: process.env.ORIGIN }
  )
  res.send(views.verifyPage({ issuers }))
})

// The DID document of our ldp_vc issuer when signing-service signs as this
// site's did:web; 404 while it signs as a did:key. Verifiers anywhere fetch
// it (veri-good from the browser), hence CORS.
app.get('/.well-known/did.json', async (req, res) => {
  let key
  try {
    key = await signingKey({
      baseUrl: process.env.SIGNING_SERVICE_URL,
      instanceId: process.env.SIGNING_SERVICE_INSTANCE_ID,
      suite: process.env.SIGNING_SERVICE_SUITE,
    })
  } catch (err) {
    console.error('Could not learn the signing key for did.json:', err.message)
    return res.sendStatus(503)
  }
  const doc = didDocument(key, process.env.ORIGIN)
  if (!doc) return res.sendStatus(404)
  res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }).json(doc)
})

await runSchema()
scheduleUnusedAccountSweep(pool)

app.listen(PORT, () => {
  console.log(`opintotodiste listening on http://localhost:${PORT}`)
})
