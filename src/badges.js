import { randomUUID } from 'node:crypto'
import { holderName } from 'koski2openbadge'

const VC_CONTEXT = 'https://www.w3.org/2018/credentials/v1'
const VC2_CONTEXT = 'https://www.w3.org/ns/credentials/v2'
const OB3_CONTEXT = 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'

// koski2openbadge's achievementType for a student status (K3). Its record has
// a `validUntil` and no `awardedOn`: it is dated when it is signed.
export const STUDENT_STATUS = 'ext:StudentStatus'

export const isStudentStatus = (credentialSubject) => credentialSubject?.achievement?.achievementType === STUDENT_STATUS

// Whether a record's or a stored credential's validity has ended.
export function hasExpired({ validUntil, expirationDate }, now = Date.now()) {
  const end = validUntil ?? expirationDate
  return Boolean(end) && Date.parse(end) <= now
}

// Wraps a koski2openbadge `credentialSubject` in the envelope a signing
// service expects: a full, unsigned Open Badges 3.0 Verifiable Credential.
export function toVerifiableCredential({ credentialSubject, awardedOn, validUntil }, { issuerId, issuerName }) {
  if (!issuerId) {
    throw new Error('The issuer is not configured (set ISSUER_ID).')
  }
  return {
    '@context': [VC_CONTEXT, OB3_CONTEXT],
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: issuerId,
      type: ['Profile'],
      name: issuerName,
    },
    ...(credentialSubject.achievement?.name ? { name: credentialSubject.achievement.name } : {}),
    issuanceDate: awardedOn ? new Date(awardedOn).toISOString() : new Date().toISOString(),
    ...(validUntil ? { expirationDate: validUntil } : {}),
    credentialSubject,
  }
}

// Like toVerifiableCredential, but a VCDM 2.0 credential (`validFrom`, v2
// context) for oid4vci-issuer to secure as an SD-JWT. Still unsigned, and
// `issuerId` must be the issuer's HTTPS URL, which the issuer checks.
export function toVcdm2Credential({ credentialSubject, awardedOn, validUntil }, { issuerId, issuerName }) {
  if (!issuerId) {
    throw new Error('The wallet issuer is not configured (set OID4VCI_CREDENTIAL_ISSUER_ID).')
  }
  return {
    '@context': [VC2_CONTEXT, OB3_CONTEXT],
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: issuerId,
      type: ['Profile'],
      name: issuerName,
    },
    ...(credentialSubject.achievement?.name ? { name: credentialSubject.achievement.name } : {}),
    validFrom: awardedOn ? new Date(awardedOn).toISOString() : new Date().toISOString(),
    ...(validUntil ? { validUntil } : {}),
    credentialSubject,
  }
}

// The claims of an IETF SD-JWT VC (`dc+sd-jwt`), which most wallets
// understand better than VCDM 2.0: flat claims identified by `vct`, with no
// JSON-LD (`@context`, `type`) and no credentialSubject wrapper. Still
// unsigned; oid4vci-issuer adds `iss`, `iat` and `cnf`.
// Claim names follow Open Badges 3.0, as the shared Open Badge type at
// https://openbadge.digicredential.eu/credentials/v1/OpenBadgeVCT defines.
// No top-level `name` here: SD-JWT VC has no registered claim for it, and a
// wallet's display name for this vct comes from the type metadata (F1), not
// per-instance data. The achievement's own `name` is still in `achievement`.
// The holder's name travels as Open Badges' `identifier` (G8), and also as
// flat `given_name` / `family_name` (G10) from the Koski person `henkilö`, for
// wallets that don't show nested claims. These and `sub` are selectively
// disclosable (see sdJwtVcDisclosable).
// Every record's `result` goes as it is (W6). Its values have no scale or
// unit (a bare "9"), and some wallets show nested claims as raw JSON, so the
// grade and the extent are also flat text claims (resultClaims).
// A student status also carries its start (`activityStartDate`); its expiry
// is no claim here but the offer's `validUntil`, which the issuer turns into
// `exp`.
export function toSdJwtVcClaims({ credentialSubject, awardedOn }, { vct, henkilö }) {
  if (!vct) {
    throw new Error('The wallet credential type is not configured (set OID4VCI_CREDENTIAL_VCT).')
  }
  return {
    vct,
    ...(credentialSubject.id ? { sub: credentialSubject.id } : {}),
    ...(credentialSubject.identifier ? { identifier: withoutJsonLdTypes(credentialSubject.identifier) } : {}),
    ...holderNameClaims(henkilö),
    ...(awardedOn ? { awardedDate: new Date(awardedOn).toISOString() } : {}),
    achievement: withoutJsonLdTypes(credentialSubject.achievement),
    ...(isStudentStatus(credentialSubject) && credentialSubject.activityStartDate
      ? { activityStartDate: credentialSubject.activityStartDate }
      : {}),
    ...(credentialSubject.result?.length ? { result: withoutJsonLdTypes(credentialSubject.result) } : {}),
    ...resultClaims(credentialSubject),
  }
}

// The grade and the extent as text a wallet can show without the
// achievement's resultDescription: `grade` with its scale ("9 (4–10)",
// "E (I–L)"), `extent` with the unit koski2openbadge put in the description's
// name ("Laajuus (vuosiviikkotuntia)" → "25 vuosiviikkotuntia"). A `Completed`
// status gets no claim: the badge itself says that, and it has no value.
// koski2openbadge ends the description ids with #grade and #credits.
function resultClaims({ achievement, result }) {
  // Stored credentials from koski2openbadge before 0.1.0 have the plural.
  const descriptions = achievement?.resultDescription ?? achievement?.resultDescriptions ?? []
  const claims = {}
  for (const r of result ?? []) {
    if (r.value === undefined || r.value === null || r.value === '') continue
    const desc = descriptions.find((d) => d.id === r.resultDescription)
    const value = String(r.value)
    if (r.resultDescription?.endsWith('#grade')) {
      claims.grade = withScale(value, desc)
    } else if (r.resultDescription?.endsWith('#credits')) {
      const unit = typeof desc?.name === 'string' ? desc.name.match(/\(([^()]+)\)\s*$/)?.[1] : undefined
      claims.extent = unit ? `${value} ${unit}` : value
    }
  }
  return claims
}

function withScale(value, desc) {
  if (desc?.valueMin !== undefined && desc?.valueMax !== undefined) return `${value} (${desc.valueMin}–${desc.valueMax})`
  const allowed = desc?.allowedValue
  if (Array.isArray(allowed) && allowed.length > 1) return `${value} (${allowed[0]}–${allowed.at(-1)})`
  return value
}

// The claims of toSdJwtVcClaims that identify the holder, sent to
// oid4vci-issuer as `disclosable` so the wallet asks before presenting them:
// the holder's name and the oid. Only the ones the claims have, since the
// issuer refuses a claim that isn't there.
const HOLDER_CLAIMS = ['sub', 'identifier', 'given_name', 'family_name']

export function sdJwtVcDisclosable(claims) {
  return HOLDER_CLAIMS.filter((claim) => claim in claims)
}

// The claims of a student status in its own SD-JWT VC type, "Opiskelijatodiste"
// (K5, docs/student-status-wallet-credential.md): flat, PID-style claims a
// verifier can ask for directly, instead of an Open Badge. Dates are the
// calendar day in Finland. `birthdate` comes from `henkilö.syntymäaika`, which
// the app never stores: only a fresh Koski fetch has it. The issuer turns the
// offer's `validUntil` into `exp`; `expiry_date` is the same day for wallets
// and the card, which can't show `exp`.
export function toStudentStatusClaims({ credentialSubject, awardedOn, validUntil }, { vct, henkilö }) {
  if (!vct) {
    throw new Error('The student status credential type is not configured (set OID4VCI_STUDENT_STATUS_VCT).')
  }
  const achievement = credentialSubject.achievement ?? {}
  const creator = achievement.creator ?? {}
  const code = (codeSet) => achievement.alignment?.find((a) => a.targetUrl?.endsWith(`/${codeSet}/latest`))
  const level = code('kansallinenkoulutusluokitus2016koulutusastetaso1')
  const type = code('opiskeluoikeudentyyppi')
  const birthdate = nonEmpty(henkilö?.syntymäaika)
  return {
    vct,
    ...present({ sub: credentialSubject.id }),
    ...holderNameClaims(henkilö),
    ...(birthdate && /^\d{4}-\d{2}-\d{2}$/.test(birthdate) ? { birthdate } : {}),
    enrolment_status: 'enrolled',
    ...present({
      institution_name: creator.name,
      institution_id: creator.id,
      institution_code: creator.otherIdentifier?.find((entry) => entry.identifierType === 'identifier')?.identifier,
      education_level: level?.targetCode,
      education_level_name: level?.targetName,
      education_type: type?.targetCode,
      education_type_name: type?.targetName,
      programme: achievement.fieldOfStudy,
      start_date: credentialSubject.activityStartDate && finnishDay(credentialSubject.activityStartDate),
      expiry_date: validUntil && finnishDay(validUntil),
    }),
    issuance_date: finnishDay(awardedOn ?? Date.now()),
    issuing_country: 'FI',
  }
}

// Who the student is and where they study are disclosable. The level, the
// type, the status and the dates are always shown, so "enrolled at the second
// level until June 2027" can be proven without them.
const STUDENT_STATUS_DISCLOSABLE = ['sub', 'given_name', 'family_name', 'birthdate', 'institution_name', 'institution_id', 'institution_code', 'programme']

export function studentStatusDisclosable(claims) {
  return STUDENT_STATUS_DISCLOSABLE.filter((claim) => claim in claims)
}

// The claims whose value is a non-empty string, trimmed.
function present(claims) {
  return Object.fromEntries(Object.entries(claims).flatMap(([claim, value]) => (nonEmpty(value) ? [[claim, nonEmpty(value)]] : [])))
}

// The calendar day in Finland at `date`, as YYYY-MM-DD.
function finnishDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(date))
}

// The holder's name as the EU PID in SD-JWT VC has it (OpenID Connect claim
// names), so a verifier can compare it with a PID: all first names
// (etunimet), unlike the identifier's call name, and the surname. Each only
// when Koski has it.
function holderNameClaims(henkilö) {
  const given = nonEmpty(henkilö?.etunimet) ?? nonEmpty(henkilö?.kutsumanimi)
  const family = nonEmpty(henkilö?.sukunimi)
  return {
    ...(given ? { given_name: given } : {}),
    ...(family ? { family_name: family } : {}),
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ') : undefined
}

// The Koski person `henkilö` if a stored credential's subject is them: the
// same oid and the same name koski2openbadge put in the identifier. Otherwise
// null, and the credential gets no name parts that might not be its holder's.
export function credentialPerson(credentialSubject, henkilö) {
  if (!henkilö?.oid || credentialSubject?.id !== `urn:oid:${henkilö.oid}`) return null
  const name = credentialSubject.identifier?.find((identifier) => identifier.identityType === 'name')?.identityHash
  return name && name === holderName(henkilö) ? henkilö : null
}

function withoutJsonLdTypes(value) {
  if (Array.isArray(value)) return value.map(withoutJsonLdTypes)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'type').map(([key, v]) => [key, withoutJsonLdTypes(v)]))
}

// Inverse of toVerifiableCredential for a stored (signed) ldp_vc, so it can be
// rebuilt as another kind of credential.
export function recordFromCredential(vc) {
  const validUntil = vc.expirationDate ?? vc.validUntil
  return { credentialSubject: vc.credentialSubject, awardedOn: vc.issuanceDate ?? vc.validFrom, ...(validUntil ? { validUntil } : {}) }
}

// When two credentials are the same achievement of the same person: the same
// learner, achievement id and award date. koski2openbadge derives the
// achievement id from the Koski record, not from its texts, so a Finnish and an
// English conversion match. Without an achievement id, the whole
// credentialSubject has to match. Takes a VC or a Koski record (`awardedOn`,
// turned into the issuanceDate toVerifiableCredential would give it).
export function credentialKey({ credentialSubject, issuanceDate, validFrom, awardedOn }) {
  const date = issuanceDate ?? validFrom ?? (awardedOn ? new Date(awardedOn).toISOString() : null)
  const achievementId = credentialSubject?.achievement?.id
  return achievementId
    ? JSON.stringify(['achievement', credentialSubject.id ?? null, achievementId, date])
    : JSON.stringify(['subject', credentialSubject ?? null, date])
}

// Calls a https://github.com/digitalcredentials/signing-service instance to
// add a proof to an unsigned credential.
export async function signCredential(vc, { baseUrl, instanceId, suite = 'ed25519' }) {
  if (!baseUrl || !instanceId) {
    throw new Error('The signing service is not configured (set SIGNING_SERVICE_URL and SIGNING_SERVICE_INSTANCE_ID).')
  }
  const url = new URL(`/instance/${instanceId}/credentials/sign`, baseUrl)
  url.searchParams.set('suite', suite)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(vc),
  })
  if (!res.ok) {
    // Status only: the body may echo the credential we sent, and this message
    // is logged and shown to the user. The service logs the details itself.
    await res.body?.cancel()
    throw new Error(`Signing service responded with ${res.status} ${res.statusText}`)
  }
  return res.json()
}
