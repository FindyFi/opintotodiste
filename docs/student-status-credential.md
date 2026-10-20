# Student status credential

**Status: proposal (K3, step 1), waiting for approval.** Decisions still open are marked **Open**.

A separate Open Badge saying that the holder is enrolled at an educational institution. It names the
institution and the level of the studies, so that a verifier can decide for itself whether, say, an upper
secondary school pupil counts as a student. It is issued only to people Koski shows as enrolled, and it stops
being valid at the expected end of the studies.

## What the credential says, and what it can't say

It says: *on <the date the Koski data was fetched>, Koski recorded this person as enrolled in <level> at
<institution>, with studies expected to end on <date>.*

It cannot say that the person is still enrolled on the day it is presented. Someone who drops out keeps a
credential that is valid until the expected end date, because we have no revocation (S1 is not planned). The
description says "as of"; see Open 6.

## Who gets one

One credential per study right (`opiskeluoikeus`) that is **active on the fetch date**:

1. **The study right has started and not ended:** `alkamispäivä` ≤ fetch date, and no `päättymispäivä` before
   the fetch date.
2. **The latest status period that has started is an enrolled one.** Take the last
   `tila.opiskeluoikeusjaksot` entry with `alku` ≤ fetch date:
   - Koski's own records (`koskiopiskeluoikeudentila`): `lasna`. **Open 1:** `loma` (on leave) and
     `valiaikaisestikeskeytynyt` (temporarily interrupted). Proposal: not enrolled.
   - Higher education from VIRTA (`virtaopiskeluoikeudentila`): `1` (aktiivinen).
   - Anything else (graduated, resigned, time limit expired, invalidated `mitatoity`, and so on) means not
     enrolled. A record without status periods (the matriculation examination) never qualifies.
3. **Higher education only: registered present for the current term.** The `lisätiedot.lukukausiIlmoittautuminen`
   entry whose `alku`–`loppu` covers the fetch date must be `virtalukukausiilmtila/1` (Läsnä). VIRTA marks
   open-university and separate-right students `aktiivinen` without a registration ("Puuttuu"), and
   people who registered absent are not studying that term. This also matches who gets student benefits.
4. **The level is one we issue for.** **Open 2:** which `opiskeluoikeudentyyppi` values count. Proposal: issue
   for all levels and let the verifier decide from the level (the user's stated aim), but leave out
   pre-primary education (`esiopetus`) and basic education (`perusopetus`, `aikuistenperusopetus`), since a
   child's school enrolment is not what "student status" is for.

Checked against the two exports in the main checkout (fetch date 2026-10-20):

| Study right | Rule result |
|---|---|
| Samuel: EVTEK and HAMK degrees | ended (valmistunut) |
| Samuel: Metropolia and University of Helsinki open studies | ended (määräaika päättynyt) |
| Samuel: matriculation examination | no status periods |
| Touko: two basic education schools | ended (eronnut = a change of school; valmistunut) |
| Touko: Otaniemen lukio | **enrolled** (`lasna` since 2024-08-08) |
| Touko: Aalto separate right | ended 2026-01-01; a spring 2026 semester row ("Puuttuu") does not change that |

## Validity

- **`validFrom`:** when the Koski data was fetched. The app stores Koski data per user and converts it again
  on every request, so koski2openbadge takes the fetch date as an option (`convert(data, { lang, asOf })`) and
  judges enrolment as of then, not "now". The app needs to remember the fetch time; today `koski_imports` has
  only `updated_at` for the whole merged data.
- **`validUntil`:** the end of the expected end date, 23:59:59 Finnish time, in UTC.
  - Koski's own records: `arvioituPäättymispäivä`.
  - Higher education: VIRTA rarely has an expected end date. **Open 3.** Proposal: the end (`loppu`) of the
    semester registration that makes the person present (rule 3). That is at most a term away, and it follows
    the registration that actually makes someone a student. The degree's normative time doesn't do that.
  - No end date at all: **Open 4.** Proposal: don't issue (strict), rather than make up a date.
- **Never issued after `validUntil`.** The app refuses to sign or send a status credential whose `validUntil`
  has passed, including re-sending a saved one to a wallet. **Open 5:** also require a recent fetch, e.g. at
  most 30 days old? Proposal: yes, so that "as of" is never ancient on a new credential.

## Open Badges 3.0 shape

koski2openbadge emits one more kind of record, `{ credentialSubject, awardedOn, validUntil }`. `awardedOn` is
the fetch date. `validUntil` is a new plain sibling fact, like `awardedOn`; other records don't have it.

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
        "targetType": "ext:KoskiCode",
        "targetFramework": "Koski: opiskeluoikeudentyyppi",
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
  not enrolment. **Open 7:** the name (`ext:StudentStatus` or `ext:Enrolment`).
- **`result[].status: "Enrolled"`.** OB 3.0's `ResultStatusType` already has `Enrolled`, so the status itself
  needs no extension. This gives verifiers a machine-readable check alongside the achievement type.
- **The institution:** `achievement.creator`, from `oppilaitos` (`urn:oid:` + its Koski oid), as the other
  records already do. Wallets show `achievement.creator.name` (it has a label in the Open Badge VCT).
- **The level, for people:** in `name` ("Opiskelija: Lukiokoulutus") and `description`. It is in the name
  because some wallets show little else.
- **The level, for machines:** `achievement.alignment` with the Koski code set `opiskeluoikeudentyyppi`.
  Higher education gets a second alignment with `virtaopiskeluoikeudentyyppi`, e.g. `1` "Ammattikorkeakoulututkinto",
  which tells a bachelor's student from a master's student. There, the human-readable level is the VIRTA name. **Open 8:** also an ISCED 2011
  level alignment (from a small fixed table: upper secondary 3, vocational 3–4, higher education 6–8 by VIRTA type),
  for verifiers outside Finland. Proposal: yes, but in a follow-up.
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
already have labels in Open Badge VCT v2, so no new VCT is needed. **Open 9:** a VCT of its own
(`StudentStatusVCT`, with a label for `alignment` and a `display` saying "student status") would let wallets
show it as a different kind of card. Proposal: not now; same VCT.

**Interface contract change in oid4vci-issuer (needs approval, it is another repo):** the issuer reserves
`exp` and never sets it, so the app can't make a wallet credential expire. Proposal: the offer request
gets an optional `validUntil` (ISO date-time). The issuer sets `exp` from it in both SD-JWT formats. For
`vc+sd-jwt` it checks that the credential's own `validUntil` matches. It refuses a `validUntil` that is in the
past. The issuer still sets every JWT time claim itself; nothing in the credential overrides them.

## In the app

- The list shows the status credential with "valid until". It is not in the list when the import doesn't make
  the person enrolled.
- The demo data (`src/demo-koski.json`) gets an enrolled study right, so the demo shows one.
- After `validUntil`: the list marks the credential as expired, and signing or sending it is refused (Open 5).

## Open questions, in short

1. Does `loma` or `valiaikaisestikeskeytynyt` count as enrolled? Proposal: no.
2. Which levels? Proposal: all except pre-primary and basic education.
3. Higher education end date. Proposal: the end of the current present-registration term.
4. No end date. Proposal: don't issue.
5. Require a recent fetch to issue? Proposal: yes, at most 30 days old.
6. The "as of" wording. The credential can outlive the enrolment. Is the description enough, or do we want
   revocation (S1) first?
7. `ext:StudentStatus` or `ext:Enrolment`.
8. ISCED level alignment. Proposal: a follow-up.
9. A separate VCT. Proposal: not now.
10. The oid4vci-issuer `validUntil` → `exp` contract change. Proposal: yes, as above.
