import 'dotenv/config'
import './src/env-check.js'
import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import QRCode from 'qrcode'
import { convert } from 'koski2openbadge'
import { toApiUrl, fetchKoskiData, InvalidKoskiUrlError } from './src/koski.js'
import { toVerifiableCredential, toVcdm2Credential, toSdJwtVcClaims, recordFromCredential, signCredential } from './src/badges.js'
import { createOffer } from './src/oid4vci.js'
import { pool, runSchema } from './src/db.js'
import * as auth from './src/auth.js'
import * as collections from './src/collections.js'
import { trustedIssuers } from './src/trusted-issuers.js'
import * as views from './src/views/index.js'
import { ogLanguageMiddleware } from './src/views/og.js'

const app = express()
const PORT = process.env.PORT || 3000
const SUPPORTED_LANGS = ['fi', 'en']

app.use(ogLanguageMiddleware)
app.use(express.json())
app.use(express.static('public'))
app.use('/vendor/translate-element', express.static('node_modules/translate-element'))
app.use('/vendor/simplewebauthn-browser', express.static('node_modules/@simplewebauthn/browser/dist/bundle'))
app.use('/vendor/archivo', express.static('node_modules/@fontsource-variable/archivo'))
// bundle.js plus the JSON-LD contexts it loads next to itself; not its demo page.
app.use('/vendor/veri-good', express.static('node_modules/@digitalcredentials/veri-good/dist', { index: false }))
app.use(
  session({
    store: new (connectPgSimple(session))({ pool }),
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

// Only what convert() and the page use is kept in the session: the learner
// number and names, and the study records. Anything else Koski sends about the
// person (an identity code or a birth date, if a share link ever carries them)
// is dropped before the session is saved; /policy says so.
function minimalKoskiData(data) {
  const { oid, etunimet, sukunimi } = data.henkilö ?? {}
  return { henkilö: { oid, etunimet, sukunimi }, opiskeluoikeudet: data.opiskeluoikeudet }
}

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
    const data = minimalKoskiData(await fetchKoskiData(apiUrl))
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

// Hands an unsigned credential for `record` to the OID4VCI issuer and returns
// what the wallet dialog needs: the offer URI as a QR code, plus the tx code.
// With OID4VCI_CREDENTIAL_VCT set it's SD-JWT VC claims, otherwise VCDM 2.0.
async function createWalletOffer(record) {
  const vc = process.env.OID4VCI_CREDENTIAL_VCT
    ? toSdJwtVcClaims(record, { vct: process.env.OID4VCI_CREDENTIAL_VCT })
    : toVcdm2Credential(record, {
        issuerId: process.env.OID4VCI_CREDENTIAL_ISSUER_ID,
        issuerName: process.env.ISSUER_NAME,
      })
  const { offerUri, txCode, expiresIn } = await createOffer(vc, {
    baseUrl: process.env.OID4VCI_ISSUER_URL,
    tenant: process.env.OID4VCI_ISSUER_INSTANCE,
    token: process.env.OID4VCI_ISSUER_TOKEN,
    credentialConfigurationId: process.env.OID4VCI_CREDENTIAL_CONFIGURATION_ID || undefined,
  })
  const qrDataUrl = await QRCode.toDataURL(offerUri)
  return { offerUri, qrDataUrl, txCode, expiresIn }
}

// Unlike /sign, this never calls signCredential itself - it hands an
// unsigned VC to the OID4VCI issuer, which signs it only once a wallet
// actually completes the flow.
app.post('/credentials/:index/offer', async (req, res) => {
  const { index } = req.params
  const record = req.session.credentials?.[index]
  if (!record) return res.status(404).json({ error: 'Credential not found. Please load your Koski data again.' })

  try {
    res.json(await createWalletOffer(record))
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

app.delete('/auth/account', requireAuth, async (req, res) => {
  try {
    const deleted = await auth.deleteAccount(req.session.userId)
    req.session.destroy(() => res.json({ ok: true, passkey: deleted }))
  } catch (err) {
    console.error('Deleting an account failed:', err.message)
    res.status(500).json({ error: 'The account could not be deleted. Please try again.' })
  }
})

// Signs the session's Koski records at `indices` where needed (same as the
// "Add to wallet" bulk action) and saves each signed VC for the signed-in user.
// Per-index results, so one failure doesn't sink the rest.
async function saveFromSession(req, indices) {
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
      const saved = await collections.saveCredential(req.session.userId, record.signed)
      results.push({ index, name, credentialId: saved.id, signed: record.signed })
    } catch (err) {
      results.push({ index, name, error: err.message })
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

app.post('/saved-credentials', requireAuth, async (req, res) => {
  const indices = Array.isArray(req.body?.indices) ? req.body.indices : []
  res.json({ results: await saveFromSession(req, indices) })
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
// re-issued as a VCDM 2.0 credential for the wallet.
app.post('/saved-credentials/:id/offer', requireAuth, async (req, res) => {
  const credential = await collections.findSavedCredential(req.session.userId, req.params.id)
  if (!credential) return res.status(404).json({ error: 'Credential not found.' })

  try {
    res.json(await createWalletOffer(recordFromCredential(credential)))
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

// Adds saved credentials (`credentialIds`) and/or the session's Koski records
// (`indices`, saved first) to the collection.
app.post('/collections/:id/items', requireAuth, async (req, res) => {
  try {
    await collections.assertOwnedCollection(req.session.userId, req.params.id)
  } catch (err) {
    return sendCollectionsError(res, err)
  }

  const indices = Array.isArray(req.body?.indices) ? req.body.indices : []
  const credentialIds = Array.isArray(req.body?.credentialIds) ? req.body.credentialIds : []
  const results = [...(await saveFromSession(req, indices)), ...credentialIds.map((credentialId) => ({ credentialId }))]
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
// ?collectionId= or ?credentialId= (in the body for POST).
function shareTarget(source) {
  const collectionId = typeof source?.collectionId === 'string' ? source.collectionId : undefined
  const credentialId = typeof source?.credentialId === 'string' ? source.credentialId : undefined
  return collectionId ? { collectionId } : { credentialId }
}

app.get('/share-links', requireAuth, async (req, res) => {
  try {
    res.json({ links: await collections.listShareLinks(req.session.userId, shareTarget(req.query)) })
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

await runSchema()

app.listen(PORT, () => {
  console.log(`opintotodiste listening on http://localhost:${PORT}`)
})
