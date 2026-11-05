// EDC1 spike: one Koski degree (korkeakoulututkinto) as an unsigned European
// Digital Credential (ELM 3, EDC generic profile). Throwaway code: hand mapping
// of the fields in koski2openbadge's synthetic fixture, no error handling beyond
// "leave it out when Koski leaves it out".
//
// Usage: node koski2elm.mjs <koski-export.json> [out.jsonld] [--uploadable]
//   --uploadable wraps it as { credential } for the EDC Issuer's upload.

import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

// Findynet as issuer (the sealing organisation). The seal certificate's
// organizationIdentifier must match eIDASIdentifier.notation.
const ISSUER = {
  legalName: { fi: 'Findynet Osuuskunta', en: 'Findynet Cooperative' },
  businessId: '3213523-3',
  homepage: 'https://opintotodiste.fi/',
}

const LANG = { fi: 'FIN', sv: 'SWE', en: 'ENG' }
const urn = (kind) => `urn:epass:${kind}:${randomUUID()}`

const concept = (id, scheme, prefLabel) => ({
  id,
  type: 'Concept',
  inScheme: { id: scheme, type: 'ConceptScheme' },
  ...(prefLabel ? { prefLabel } : {}),
})
const language = (code) => concept(
  `http://publications.europa.eu/resource/authority/language/${code}`,
  'http://publications.europa.eu/resource/authority/language',
)
const country = (code) => concept(
  `http://publications.europa.eu/resource/authority/country/${code}`,
  'http://publications.europa.eu/resource/authority/country',
  { en: { FIN: 'Finland' }[code] ?? code },
)
const ECTS = concept(
  'http://data.europa.eu/snb/education-credit/6fcec5c5af',
  'http://data.europa.eu/snb/education-credit/25831c2',
  { en: 'European Credit Transfer System' },
)
const GENERIC = concept(
  'http://data.europa.eu/snb/credential/e34929035b',
  'http://data.europa.eu/snb/credential/25831c2',
  { en: 'Generic' },
)
// EQF level: Koski doesn't carry one. Bachelor's degree (koulutus 6xxxxx) = EQF 6,
// master's (7xxxxx) = EQF 7: a guess from the Statistics Finland code's first digit.
const eqf = (koulutusKoodi) => {
  const level = { 6: 6, 7: 7, 8: 8 }[String(koulutusKoodi)[0]]
  return level && concept(`http://data.europa.eu/snb/eqf/${level}`, 'http://data.europa.eu/snb/eqf/25831c2', { en: `Level ${level}` })
}

// Koski's { fi, sv, en } names → ELM LangString maps (same shape, drop empties)
const langString = (nimi) => nimi && Object.fromEntries(Object.entries(nimi).filter(([k, v]) => LANG[k] && v))

const location = () => ({
  id: urn('location'),
  type: 'Location',
  address: { id: urn('address'), type: 'Address', countryCode: country('FIN') },
})

const awardingBody = (org) => ({
  id: `urn:oid:${org.oid}`,
  type: 'Organisation',
  legalName: langString(org.nimi),
  location: location(),
  // GAP: ELM wants a legal identifier (registration); Koski gives only the
  // oppilaitos OID. Carried as a plain Identifier.
  identifier: { id: urn('identifier'), type: 'Identifier', schemeName: 'Opetushallituksen organisaatiopalvelu (OID)', notation: org.oid },
})

const awardedBy = (org, date) => ({
  id: urn('awardingProcess'),
  type: 'AwardingProcess',
  awardingBody: awardingBody(org),
  ...(date ? { awardingDate: `${date}T00:00:00Z` } : {}),
})

const credit = (laajuus) => laajuus?.arvo && laajuus.yksikkö?.koodiarvo === '2' // opintopiste = ECTS
  ? { id: urn('creditPoint'), type: 'CreditPoint', framework: ECTS, point: String(laajuus.arvo) }
  : undefined

const lastAssessment = (os) => os.arviointi?.at(-1)

// ELM requires a rendered page image per display language (IndividualDisplay →
// DisplayDetail → MediaObject). The EDC Issuer draws one; we draw a plain SVG
// and rasterise it with rsvg-convert (production: resvg-js or similar).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
function pageImage({ title, name, org, date, courses, issuer }) {
  const rows = courses.map((c, i) => `<text x="80" y="${430 + i * 34}" font-size="22">${esc(c)}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" font-family="Helvetica, Arial, sans-serif">
<rect width="100%" height="100%" fill="#fff"/><rect x="30" y="30" width="1180" height="1694" fill="none" stroke="#1d3557" stroke-width="4"/>
<text x="80" y="160" font-size="44" font-weight="bold" fill="#1d3557">${esc(title)}</text>
<text x="80" y="240" font-size="30">${esc(name)}</text>
<text x="80" y="290" font-size="24">${esc(org)} · ${esc(date)}</text>
${rows}
<text x="80" y="1660" font-size="18" fill="#555">${esc(issuer)}</text></svg>`
  return execFileSync('rsvg-convert', ['-f', 'png'], { input: svg }).toString('base64')
}
const PNG = concept('http://publications.europa.eu/resource/authority/file-type/PNG', 'http://publications.europa.eu/resource/authority/file-type', { en: 'PNG' })
const BASE64 = concept('http://data.europa.eu/snb/encoding/6146cde7dd', 'http://data.europa.eu/snb/encoding/25831c2', { en: 'base64' })
const individualDisplay = (lang, content) => ({
  id: urn('individualDisplay'),
  type: 'IndividualDisplay',
  language: language(LANG[lang]),
  displayDetail: {
    id: urn('displayDetail'),
    type: 'DisplayDetail',
    page: 1,
    image: { id: urn('mediaObject'), type: 'MediaObject', content, contentEncoding: BASE64, contentType: PNG },
  },
})

function course(os, org) {
  const km = os.koulutusmoduuli
  const title = langString(km.tunniste?.nimi)
  const grade = lastAssessment(os)?.arvosana?.koodiarvo
  const creditPoint = credit(km.laajuus)
  return {
    id: urn('learningAchievement'),
    type: 'LearningAchievement',
    title,
    awardedBy: awardedBy(org, os.vahvistus?.päivä),
    ...(grade ? {
      provenBy: {
        id: urn('learningAssessment'),
        type: 'LearningAssessment',
        title,
        // virtaarvosana 0–5 / hyväksytty; the scale itself isn't in the export
        grade: { id: urn('note'), type: 'Note', noteLiteral: { fi: grade, en: grade } },
        awardedBy: awardedBy(org, os.vahvistus?.päivä),
      },
    } : {}),
    specifiedBy: {
      id: urn('learningAchievementSpecification'),
      type: 'LearningAchievementSpecification',
      title,
      ...(km.tunniste?.koodiarvo ? { identifier: { id: urn('identifier'), type: 'Identifier', schemeName: 'Opintojakson tunniste', notation: km.tunniste.koodiarvo } } : {}),
      ...(creditPoint ? { creditPoint } : {}),
    },
  }
}

export function koski2elm(koski) {
  const oo = koski.opiskeluoikeudet.find((o) => o.suoritukset?.some((s) => s.tyyppi?.koodiarvo === 'korkeakoulututkinto'))
  const s = oo.suoritukset.find((x) => x.tyyppi?.koodiarvo === 'korkeakoulututkinto')
  const org = s.vahvistus?.myöntäjäOrganisaatio ?? oo.oppilaitos
  const km = s.koulutusmoduuli
  const degreeTitle = langString(km.tunniste.nimi)
  const programme = langString(km.virtaNimi)
  const title = Object.fromEntries(Object.entries(degreeTitle).map(([l, t]) => [l, programme?.[l] ? `${t}, ${programme[l]}` : t]))
  const passed = (s.osasuoritukset ?? []).filter((os) => lastAssessment(os)?.hyväksytty)
  const totalCredits = passed.reduce((sum, os) => sum + (os.koulutusmoduuli.laajuus?.yksikkö?.koodiarvo === '2' ? os.koulutusmoduuli.laajuus.arvo ?? 0 : 0), 0)
  const h = koski.henkilö
  const givenName = h.kutsumanimi ?? h.etunimet
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const languages = Object.keys(title).map((l) => LANG[l])
  const fullName = [givenName, h.sukunimi].filter(Boolean).join(' ')
  const displays = Object.keys(title).map((l) => individualDisplay(l, pageImage({
    title: title[l],
    name: fullName,
    org: org.nimi?.[l] ?? org.nimi?.fi,
    date: s.vahvistus?.päivä,
    courses: passed.map((os) => {
      const km = os.koulutusmoduuli
      const n = km.tunniste?.nimi?.[l] ?? km.tunniste?.nimi?.fi
      return `${n}${km.laajuus?.arvo ? ` · ${km.laajuus.arvo} ECTS` : ''}${lastAssessment(os)?.arvosana?.koodiarvo ? ` · ${lastAssessment(os).arvosana.koodiarvo}` : ''}`
    }),
    issuer: `${ISSUER.legalName[l] ?? ISSUER.legalName.en} · Koski`,
  })))

  return {
    '@context': ['https://www.w3.org/2018/credentials/v1', 'http://data.europa.eu/snb/model/context/edc-ap'],
    id: `urn:credential:${randomUUID()}`,
    type: ['VerifiableCredential', 'EuropeanDigitalCredential'],
    credentialProfiles: GENERIC,
    credentialSchema: { id: 'http://data.europa.eu/snb/model/ap/edc-generic-full', type: 'ShaclValidator2017' },
    displayParameter: {
      id: urn('displayParameter'),
      type: 'DisplayParameter',
      title,
      // No ELM evidence type fits "copied from a national register" (the vocabulary
      // has Mandate, Conversion, Accreditation only), so the provenance goes here.
      description: {
        fi: `Tiedot on kopioitu oppijan pyynnöstä valtakunnallisesta Koski-tietovarannosta (Opetushallitus). Tutkinnon on myöntänyt ${org.nimi?.fi}; Findynet Osuuskunta vahvistaa sähköisellä leimallaan, että tiedot vastaavat Koskea.`,
        en: `Copied at the learner's request from the Finnish national education data register Koski (Finnish National Agency for Education). The degree was awarded by ${org.nimi?.en ?? org.nimi?.fi}; Findynet Cooperative's electronic seal certifies that the data is as it appears in Koski.`,
      },
      primaryLanguage: language('FIN'),
      language: languages.map(language),
      individualDisplay: displays,
    },
    issuer: {
      id: urn('org'),
      type: 'Organisation',
      legalName: ISSUER.legalName,
      // ETSI EN 319 412-1 semantics identifier, as in the seal certificate's
      // organizationIdentifier (NTR = national trade register).
      eIDASIdentifier: { id: urn('legalIdentifier'), type: 'LegalIdentifier', notation: `NTRFI-${ISSUER.businessId}`, spatial: country('FIN') },
      registration: { id: urn('legalIdentifier'), type: 'LegalIdentifier', notation: ISSUER.businessId, spatial: country('FIN') },
      location: location(),
      homepage: { id: urn('webResource'), type: 'WebResource', contentURL: ISSUER.homepage },
    },
    issuanceDate: now,
    issued: now,
    validFrom: s.vahvistus?.päivä ? `${s.vahvistus.päivä}T00:00:00Z` : now,
    credentialSubject: {
      id: `urn:oid:${h.oid}`,
      type: 'Person',
      ...(givenName ? { givenName: { fi: givenName } } : {}),
      ...(h.sukunimi ? { familyName: { fi: h.sukunimi } } : {}),
      fullName: { fi: fullName },
      identifier: { id: urn('identifier'), type: 'Identifier', schemeName: 'Oppijanumero (Koski)', notation: h.oid },
      hasClaim: {
        id: urn('learningAchievement'),
        type: 'LearningAchievement',
        title,
        awardedBy: awardedBy(org, s.vahvistus?.päivä),
        specifiedBy: {
          id: urn('qualification'),
          type: 'Qualification',
          title: degreeTitle,
          ...(eqf(km.tunniste.koodiarvo) ? { eqfLevel: eqf(km.tunniste.koodiarvo) } : {}),
          identifier: { id: urn('identifier'), type: 'Identifier', schemeName: 'Tilastokeskuksen koulutusluokitus', notation: km.tunniste.koodiarvo },
          // GAP: the degree's own extent isn't in the export; the sum of the passed courses is a lower bound
          ...(totalCredits ? { creditPoint: { id: urn('creditPoint'), type: 'CreditPoint', framework: ECTS, point: String(totalCredits) } } : {}),
        },
        ...(passed.length ? { hasPart: passed.map((os) => course(os, os.toimipiste ?? org)) } : {}),
      },
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const credential = koski2elm(JSON.parse(readFileSync(input, 'utf8')))
  const out = JSON.stringify(process.argv.includes('--uploadable') ? { credential } : credential, null, 2)
  if (output) writeFileSync(output, out + '\n')
  else console.log(out)
}
