import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import QRCode from 'qrcode'
import { convert } from 'koski2openbadge'
import { toApiUrl, fetchKoskiData, InvalidKoskiUrlError } from './src/koski.js'
import { toVerifiableCredential, signCredential } from './src/badges.js'
import { createOffer } from './src/oid4vci.js'
import * as views from './src/views.js'

const app = express()
const PORT = process.env.PORT || 3000
const SUPPORTED_LANGS = ['fi', 'en']

app.use(express.json())
app.use(express.static('public'))
app.use('/vendor/translate-element', express.static('node_modules/translate-element'))
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
  })
)

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
    res.status(502).json({ error: err.message })
  }
})

app.get('/credentials/:index/download', (req, res) => {
  const record = req.session.credentials?.[req.params.index]
  if (!record?.signed) return res.status(404).send('No signed credential available yet.')
  res.setHeader('Content-Disposition', `attachment; filename="credential-${req.params.index}.json"`)
  res.json(record.signed)
})

app.listen(PORT, () => {
  console.log(`opintotodiste listening on http://localhost:${PORT}`)
})
