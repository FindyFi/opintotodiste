# Student status credential

**Status: approved by the user on 2026-10-20 (K3).** The decisions are listed at the end.

A separate Open Badge saying that the holder is enrolled at an educational institution. It names the
institution and the level of the studies, so that a verifier can decide for itself whether, say, an upper
secondary school pupil counts as a student. It is issued only to people Koski shows as enrolled, and it stops
being valid at the expected end of the studies.

## What the credential says, and what it can't say

It says: *on <the date it was signed>, Koski recorded this person as enrolled in <level> at <institution>, with
studies expected to end on <date>.*

It works like a plastic student card: it is not revoked. Someone who drops out keeps a credential that stays
valid until the expected end date. The description says "as of <date>", and that is enough (user,
2026-10-20).

## Who gets one

One credential per study right (`opiskeluoikeus`) that is **active on the day it is signed**:

1. **The study right has started and not ended:** `alkamispäivä` ≤ that day, and no `päättymispäivä` before it.
2. **The latest status period that has started is an enrolled one.** Take the last
   `tila.opiskeluoikeusjaksot` entry with `alku` ≤ that day:
   - Koski's own records (`koskiopiskeluoikeudentila`): `lasna` only. `loma` (on leave) and `valiaikaisestikeskeytynyt`
     (temporarily interrupted) don't count.
   - Higher education from VIRTA (`virtaopiskeluoikeudentila`): `1` (aktiivinen).
   - Anything else (graduated, resigned, time limit expired, invalidated `mitatoity`, and so on) means not
     enrolled. A record without status periods (the matriculation examination) never qualifies.
3. **Higher education only: registered present for the current term.** The `lisätiedot.lukukausiIlmoittautuminen`
   entry whose `alku`–`loppu` covers that day must be `virtalukukausiilmtila/1` (Läsnä). VIRTA marks
   open-university and separate-right students `aktiivinen` without a registration ("Puuttuu"), and
   people who registered absent are not studying that term. This also matches who gets student benefits.
4. **Not pre-primary or basic education.** All other `opiskeluoikeudentyyppi` values count, and the verifier
   decides from the level. Pre-primary education (`esiopetus`) and basic education (`perusopetus`,
   `aikuistenperusopetus`) are left out, since a child's school enrolment is not what "student status" is for.

Checked against the two exports in the main checkout, as of 2026-10-20:

| Study right | Rule result |
|---|---|
| Samuel: EVTEK and HAMK degrees | ended (valmistunut) |
| Samuel: Metropolia and University of Helsinki open studies | ended (määräaika päättynyt) |
| Samuel: matriculation examination | no status periods |
| Touko: two basic education schools | ended (eronnut = a change of school; valmistunut) |
| Touko: Otaniemen lukio | **enrolled** (`lasna` since 2024-08-08) |
| Touko: Aalto separate right | ended 2026-01-01; a spring 2026 semester row ("Puuttuu") does not change that |

## Koski is fetched again at signing

The app keeps each user's Koski data and the share link it came from (`koski_imports.koski_url`, or the
session's `koskiUrl`). It converts that stored data on every request, so the list can only say "enrolled
according to the last fetch".

So **signing a student status credential fetches Koski again** through the stored share link. That covers
every kind of signing: the download, saving it to a collection, and an offer to a wallet. The fetch is merged
into the import like any other, the record is converted again as of now, and the credential is signed only if
the same study right is still enrolled. It is refused, with a reason, when:

- the share link has expired (`jakolinkki.voimassaAsti`) or Koski doesn't answer. The user is asked for a new
  share link from Oma Koski; stale data is never used as a fallback.
- the new data no longer makes the person enrolled. The list then drops the credential.

That makes every credential's "as of" the moment it was signed, so there is no freshness limit to enforce and
no fetch time to store. The demo data (`demo:esittelytiedot`) has no link and is signed from the stored
synthetic record.

## Validity

- **`validFrom`:** the moment of signing, which is also the moment of the fetch. koski2openbadge takes the date
  to judge enrolment by as an option (`convert(data, { lang, asOf })`, default now), so tests can pin it.
- **`validUntil`:** the end of the expected end date, 23:59:59 Finnish time, in UTC.
  - Koski's own records: `arvioituPäättymispäivä`.
  - Higher education (VIRTA rarely has an expected end date): the end (`loppu`) of the semester registration
    that makes the person present (rule 3). That is at most a term away. It follows the registration that
    actually makes someone a student, which the degree's normative time doesn't.
  - No end date at all: not issued.
- **Never issued after `validUntil`.** A saved copy (downloads, collections) is kept while it is valid. Once it
  has expired, the next signing makes a new one in its place (same saved credential, so its collections and
  links follow). A saved copy sent to a wallet goes as it is, with its own date and expiry, like a copy of the
  same card; an expired one is refused.

## Open Badges 3.0 shape

koski2openbadge emits one more kind of record, `{ credentialSubject, awardedOn, validUntil }`. `awardedOn` is
the `asOf` date. `validUntil` is a new plain sibling fact, like `awardedOn`; other records don't have it.

```json
{
  "type": ["AchievementSubject"],
  "id": "urn:oid:1.2.246.562.24.00000000001",
  "identifier": [{ "type": "IdentityObject", "hashed": false, "identityType": "name", "identityHash": "Testi Opiskelija" }],
  "activityStartDate": "2024-08-08T00:00:00Z",
  "achievement": {
    "id": "urn:opintopolku2openbadge:…",
    "type": ["Achievement"],
    "achievementType": "ext:StudentStatus",
    "name": "Opiskelija: Lukiokoulutus",
    "description": "Läsnä oleva opiskelija, Esimerkkilukio, lukiokoulutus. Opinnot alkaneet 8.8.2024, arvioitu päättyminen 5.6.2027. Tilanne Opetushallituksen Koski-tietovarannossa 20.10.2026.",
    "criteria": { "narrative": "Myönnetty, kun Koski-tietovarannossa on alkanut opiskeluoikeus, jonka tila on läsnä (korkeakouluissa myös lukukausi-ilmoittautuminen läsnä olevaksi)." },
    "creator": { "id": "urn:oid:1.2.246.562.10.00000000002", "type": ["Profile"], "name": "Esimerkkilukio" },
    "fieldOfStudy": "Lukion oppimäärä",
    "alignment": [
      {
        "type": ["Alignment"],
        "targetFramework": "Koski: opiskeluoikeuden tyyppi",
        "targetCode": "lukiokoulutus",
        "targetName": "Lukiokoulutus",
        "targetUrl": "https://koski.opintopolku.fi/koski/dokumentaatio/koodisto/opiskeluoikeudentyyppi/latest"
      }
    ],
    "resultDescription": [
      { "id": "urn:opintopolku2openbadge:…#status", "type": ["ResultDescription"], "name": "Opiskelutilanne", "resultType": "Status" }
    ]
  },
  "result": [{ "type": ["Result"], "resultDescription": "urn:opintopolku2openbadge:…#status", "status": "Enrolled" }]
}
```

Field by field:

- **`achievementType: "ext:StudentStatus"`.** OB 3.0's `AchievementType` is extensible: values outside the
  list must start with `ext:`. The closest standard value, `Membership`, means a membership in an organisation,
  not enrolment.
- **`result[].status: "Enrolled"`.** OB 3.0's `ResultStatusType` already has `Enrolled`, so the status itself
  needs no extension. This gives verifiers a machine-readable check alongside the achievement type.
- **The institution:** `achievement.creator`, from `oppilaitos` (`urn:oid:` + its Koski oid), as the other
  records already do. Wallets show `achievement.creator.name` (it has a label in the Open Badge VCT).
- **The level, for people:** in `name` ("Opiskelija: Lukiokoulutus") and `description`. It is in the name
  because some wallets show little else.
- **The level, for machines:** `achievement.alignment`, one entry per code set:
  - the sector, from Koski's `opiskeluoikeudentyyppi` (e.g. `lukiokoulutus`, `korkeakoulutus`). Every study
    right has one.
  - for higher education, VIRTA's `virtaopiskeluoikeudentyyppi` (e.g. `1` "Ammattikorkeakoulututkinto"), which
    tells a bachelor's student from a master's student.
  - the level of education, when the study right's suoritus has a `koulutus/<6 digits>` code (see below).

### The level

Can it be deduced reliably? **Yes, from the education code, when there is one.** Koski's code service relates
each `koulutus` code to its level. For the four codes in the two exports
(`koodisto-service/rest/json/relaatio/sisaltyy-alakoodit/koulutus_<code>`):

| Code | Education | `kansallinenkoulutusluokitus2016koulutusastetaso1` | `isced2011koulutusastetaso1` | `eqf` |
|---|---|---|---|---|
| 309902 | Lukion oppimäärä | 3 Toinen aste | — | — |
| 351101 | a vocational upper secondary qualification | 3 Toinen aste | 3 Toinen aste | 4 |
| 651902 | Insinööri (AMK) | 6 Alempi korkeakouluaste | 6 | 6 |
| 750803 | Insinööri (ylempi AMK) | 7 Ylempi korkeakouluaste | 7 | 7 |

- **Statistics Finland's education classification (2016)** is the one that every code has, including the
  lukio syllabus. Its levels 0–8 follow the ISCED 2011 levels, and the level is the code's first digit (9 =
  unknown). So the converter can read it from the code with no lookup.
- **ISCED and EQF relations are missing for some codes.** The lukio syllabus has neither: it isn't a
  qualification, the matriculation examination is. So they can't be relied on.
- **Without a `koulutus` code there is no level.** Open-university and separate study rights (VIRTA types 13,
  18) carry their VIRTA type as the code, not a `koulutus` code. They are not enrolled by rule 3 anyway, so this
  costs nothing now. The sector and VIRTA type alignments are still there.

Added in K3 (user, 2026-10-20): `targetFramework` "Tilastokeskus: koulutusaste (ISCED 2011 -tasot)", `targetCode`
"3", `targetName` "Toinen aste", `targetUrl` the Koski page of the code set. No alignment has a `targetType`:
none of OB 3.0's values fits, and it is optional.

- **`fieldOfStudy`:** the programme or syllabus name when Koski has one (the suoritus's `koulutusmoduuli`, VIRTA
  `virtaNimi`).
- **`activityStartDate`:** `alkamispäivä`. There is no `activityEndDate`, because the activity hasn't ended;
  the expected end is `validUntil`.
- **`achievement.id`:** a hash of the study right (`oid` or `lähdejärjestelmänId`) and `"student-status"`, so
  it stays the same across imports and languages. A new fetch gives a new `awardedOn` and so a new credential
  (`credentialKey` includes the date), not a duplicate of the old one.

Every new term (`alignment` and the `Alignment` terms, `activityStartDate`) gets added to koski2openbadge's
OB 3.0 context test. The digitalcredentials signing service refuses unknown terms.

## Envelopes in the app

| Format | Validity from | Validity to |
|---|---|---|
| `ldp_vc` (VCDM 1.1, downloads and collections) | `issuanceDate` = `awardedOn` | `expirationDate` = `validUntil` |
| `vc+sd-jwt` (VCDM 2.0) | `validFrom` | `validUntil`; the issuer adds `exp` |
| `dc+sd-jwt` (flat claims) | `awardedDate` | `exp`, set by the issuer |

`dc+sd-jwt` claims are as for other badges (`toSdJwtVcClaims`), plus `activityStartDate` and `result`. Both
already have labels in Open Badge VCT v2, so the shared Open Badge VCT is kept. A VCT of its own (a label for
`alignment`, a card saying "student status") is left for later.

**Interface contract change in oid4vci-issuer (approved 2026-10-20):** the issuer reserves
`exp` and never sets it, so the app can't make a wallet credential expire. Proposal: the offer request
gets an optional `validUntil` (ISO date-time). The issuer sets `exp` from it in both SD-JWT formats. For
`vc+sd-jwt` it checks that the credential's own `validUntil` matches. It refuses a `validUntil` that is in the
past. The issuer still sets every JWT time claim itself; nothing in the credential overrides them.

## In the app

- The list shows the status credential with "valid until". It is not in the list when the import doesn't make
  the person enrolled.
- The demo data (`src/demo-koski.json`) gets an enrolled study right, so the demo shows one.
- Signing re-fetches Koski (see above). A refusal says why: the link expired, Koski is down, or the person is
  no longer enrolled.
- A saved credential past `validUntil` is marked as expired in the list.

## Decisions (user, 2026-10-20)

1. `loma` and `valiaikaisestikeskeytynyt` don't count as enrolled.
2. All levels except pre-primary and basic education.
3. Higher education ends with the current present-registration term.
4. No end date: not issued.
5. No freshness limit: signing fetches Koski again (the user's suggestion).
6. No revocation: like a plastic student card. "As of" in the description is enough.
7. `achievementType: "ext:StudentStatus"` and `result.status: "Enrolled"`.
8. The level from the education code goes in now (above).
9. No VCT of its own for now.
10. oid4vci-issuer: the offer's optional `validUntil` sets `exp`.
