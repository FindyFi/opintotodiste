import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import QRCode from 'qrcode'
import { convert } from 'koski2openbadge'
import { toApiUrl, fetchKoskiData, InvalidKoskiUrlError } from './src/koski.js'
import { toVerifiableCredential, signCredential } from './src/badges.js'
import { createOffer } from './src/oid4vci.js'
import { pool, runSchema } from './src/db.js'
import * as auth from './src/auth.js'
import * as collections from './src/collections.js'
import * as views from './src/views.js'

const app = express()
const PORT = process.env.PORT || 3000
const SUPPORTED_LANGS = ['fi', 'en']

app.use(express.json())
app.use(express.static('public'))
app.use('/vendor/translate-element', express.static('node_modules/translate-element'))
app.use('/vendor/simplewebauthn-browser', express.static('node_modules/@simplewebauthn/browser/dist/bundle'))
app.use(
  session({
    store: new (connectPgSimple(session))({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
  })
)

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please sign in with a passkey first.' })
  next()
}

app.get('/healthz', (req, res) => res.sendStatus(200))

app.get('/', (req, res) => {
  const initialData = req.session.credentials
    ? {
        personName: req.session.personName,
        koskiUrl: req.session.koskiUrl,
        credentials: req.session.credentials,
      }
    : null
  res.send(views.page({ koskiUrl: req.session.koskiUrl, initialData }))
})

function credentialsResponse(req) {
  return {
    personName: req.session.personName,
    koskiUrl: req.session.koskiUrl,
    credentials: req.session.credentials,
  }
}

app.post('/credentials', async (req, res) => {
  const koskiUrl = (req.body?.koskiUrl || '').trim()
  const lang = SUPPORTED_LANGS.includes(req.body?.lang) ? req.body.lang : 'fi'
  try {
    const apiUrl = toApiUrl(koskiUrl)
    const data = await fetchKoskiData(apiUrl)
    const records = convert(data, { lang })

    req.session.koskiUrl = koskiUrl
    req.session.koskiData = data
    req.session.lang = lang
    req.session.personName = [data.henkilö?.etunimet, data.henkilö?.sukunimi].filter(Boolean).join(' ')
    req.session.credentials = records.map((record) => ({ ...record, signed: null }))

    res.json(credentialsResponse(req))
  } catch (err) {
    const message = err instanceof InvalidKoskiUrlError ? err.message : `Could not load Koski data: ${err.message}`
    res.status(400).json({ error: message })
  }
})

// Re-runs the converter against the already-fetched Koski data in the
// requested language (e.g. when the UI language switcher changes), without
// another round trip to Koski. Signed statuses carry over by position, since
// convert() produces the same records in the same order regardless of lang.
app.post('/credentials/lang', (req, res) => {
  const lang = SUPPORTED_LANGS.includes(req.body?.lang) ? req.body.lang : 'fi'
  if (!req.session.koskiData) {
    return res.status(404).json({ error: 'No Koski data loaded yet.' })
  }

  const records = convert(req.session.koskiData, { lang })
  req.session.lang = lang
  req.session.credentials = records.map((record, index) => ({
    ...record,
    signed: req.session.credentials?.[index]?.signed ?? null,
  }))

  res.json(credentialsResponse(req))
})

app.post('/credentials/:index/sign', async (req, res) => {
  const { index } = req.params
  const record = req.session.credentials?.[index]
  if (!record) return res.status(404).json({ error: 'Credential not found. Please load your Koski data again.' })

  try {
    const vc = toVerifiableCredential(record, {
      issuerId: process.env.ISSUER_ID,
      issuerName: process.env.ISSUER_NAME,
    })
    record.signed = await signCredential(vc, {
      baseUrl: process.env.SIGNING_SERVICE_URL,
      instanceId: process.env.SIGNING_SERVICE_INSTANCE_ID,
      suite: process.env.SIGNING_SERVICE_SUITE,
    })
    res.json({ signed: record.signed })
  } catch (err) {
    // A 502 here means a dependency refused the request, not that the user
    // did anything wrong - log it, or the only trace is a message in the
    // browser that nobody operating the service ever sees.
    console.error('Signing failed:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// Unlike /sign, this never calls signCredential itself - it hands an
// unsigned VC to the OID4VCI issuer, which signs it only once a wallet
// actually completes the flow.
app.post('/credentials/:index/offer', async (req, res) => {
  const { index } = req.params
  const record = req.session.credentials?.[index]
  if (!record) return res.status(404).json({ error: 'Credential not found. Please load your Koski data again.' })

  try {
    const vc = toVerifiableCredential(record, {
      issuerId: process.env.ISSUER_ID,
      issuerName: process.env.ISSUER_NAME,
    })
    const { offerUri, txCode, expiresIn } = await createOffer(vc, {
      baseUrl: process.env.OID4VCI_ISSUER_URL,
      tenant: process.env.OID4VCI_ISSUER_INSTANCE,
      token: process.env.OID4VCI_ISSUER_TOKEN,
    })
    const qrDataUrl = await QRCode.toDataURL(offerUri)
    res.json({ offerUri, qrDataUrl, txCode, expiresIn })
  } catch (err) {
    console.error('Creating a credential offer failed:', err.message)
    res.status(502).json({ error: err.message })
  }
})

app.get('/credentials/:index/download', (req, res) => {
  const record = req.session.credentials?.[req.params.index]
  if (!record?.signed) return res.status(404).send('No signed credential available yet.')
  res.setHeader('Content-Disposition', `attachment; filename="credential-${req.params.index}.json"`)
  res.json(record.signed)
})

// --- Passkey auth ---------------------------------------------------------

app.get('/auth/me', async (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false })
  const passkeys = await auth.listPasskeys(req.session.userId)
  res.json({ loggedIn: true, displayName: req.session.displayName, passkeys })
})

app.post('/auth/register/options', async (req, res) => {
  try {
    res.json(await auth.beginRegistration(req, req.body?.displayName))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/auth/register/verify', async (req, res) => {
  try {
    const user = await auth.completeRegistration(req, req.body)
    res.json({ displayName: user.displayName })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/auth/login/options', async (req, res) => {
  try {
    res.json(await auth.beginLogin(req))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/auth/login/verify', async (req, res) => {
  try {
    const user = await auth.completeLogin(req, req.body)
    res.json({ displayName: user.displayName })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }))
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
    res.status(err instanceof collections.NotFoundError ? 404 : 400).json({ error: err.message })
  }
})

app.delete('/collections/:id', requireAuth, async (req, res) => {
  try {
    await collections.deleteCollection(req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) {
    res.status(err instanceof collections.NotFoundError ? 404 : 400).json({ error: err.message })
  }
})

app.post('/collections/:id/share-token/regenerate', requireAuth, async (req, res) => {
  try {
    res.json(await collections.regenerateShareToken(req.session.userId, req.params.id))
  } catch (err) {
    res.status(err instanceof collections.NotFoundError ? 404 : 400).json({ error: err.message })
  }
})

// Auto-signs any unsigned selected credentials first (same as the "Add to
// wallet" bulk action), then snapshots each signed VC into the collection.
app.post('/collections/:id/items', requireAuth, async (req, res) => {
  try {
    await collections.assertOwnedCollection(req.session.userId, req.params.id)
  } catch (err) {
    return res.status(err instanceof collections.NotFoundError ? 404 : 400).json({ error: err.message })
  }

  const indices = Array.isArray(req.body?.indices) ? req.body.indices : []
  const results = []
  for (const index of indices) {
    const record = req.session.credentials?.[index]
    if (!record) {
      results.push({ index, error: 'Credential not found. Please load your Koski data again.' })
      continue
    }
    const name = record.credentialSubject?.achievement?.name ?? ''
    try {
      if (!record.signed) {
        const vc = toVerifiableCredential(record, {
          issuerId: process.env.ISSUER_ID,
          issuerName: process.env.ISSUER_NAME,
        })
        record.signed = await signCredential(vc, {
          baseUrl: process.env.SIGNING_SERVICE_URL,
          instanceId: process.env.SIGNING_SERVICE_INSTANCE_ID,
          suite: process.env.SIGNING_SERVICE_SUITE,
        })
      }
      const item = await collections.addItem(req.session.userId, req.params.id, record.signed)
      results.push({ index, name, itemId: item.id, signed: record.signed })
    } catch (err) {
      results.push({ index, name, error: err.message })
    }
  }
  res.json({ results })
})

// --- Public share links -----------------------------------------------------

app.get('/c/:token', async (req, res) => {
  const found = await collections.findByShareToken(req.params.token)
  if (!found) return res.status(404).send('Collection not found.')
  res.send(views.sharedCollectionPage({ token: req.params.token, ...found }))
})

app.get('/c/:token/items/:itemId/download', async (req, res) => {
  const credential = await collections.findItemByShareToken(req.params.token, req.params.itemId)
  if (!credential) return res.status(404).send('Credential not found.')
  res.setHeader('Content-Disposition', `attachment; filename="credential-${req.params.itemId}.json"`)
  res.json(credential)
})

app.get('/my/collections', (req, res) => {
  res.send(views.collectionsPage())
})

await runSchema()

app.listen(PORT, () => {
  console.log(`opintotodiste listening on http://localhost:${PORT}`)
})
