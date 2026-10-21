# Student status in wallets: "Opiskelijatodiste"

**Status: approved by the user on 2026-10-21 (K5).** The decisions are listed at the end.

The student status credential (see [student-status-credential.md](student-status-credential.md)) goes to
wallets as an SD-JWT VC type of its own, not as an Open Badge. Downloads and collections stay the Open Badge
(`ldp_vc`) that K3 defined.

## Why a type of its own

- It should look different from course and degree badges: in the app's list, and in wallets.
- A VCT's `svg_templates` are variants of one card. A wallet chooses between them by `properties`
  (`orientation`, `color_scheme`, `contrast`), never by a claim's value. A second template in Open Badge VCT v2
  can't be tied to `achievementType: "ext:StudentStatus"`, and v2 is published and integrity-pinned anyway.
- Verifiers, such as a shop giving a student discount, want flat claims they can ask for directly ("is this
  person enrolled, and at what level?"). Digging through `achievement.alignment[]` is too much to ask.

## No common schema to follow yet

Checked on 2026-10-20:

- The EUDI attestation rulebook catalogue
  ([eudi-doc-attestation-rulebooks-catalog](https://github.com/eu-digital-identity-wallet/eudi-doc-attestation-rulebooks-catalog))
  has the PID and the mDL only, and no education or student attestation.
- The European Student Card had a verifiable-credential pilot in September to November 2025 (13 issuers,
  higher education only). Its claim names haven't been published. Its identifiers (European Student
  Identifier, card number) belong to the higher education institutions, so we couldn't issue them for a lukio
  pupil anyway.

So the proposal borrows the **PID rulebook's style**: snake_case names, `given_name` / `family_name` /
`birthdate`, and `expiry_date` / `issuance_date` as readable dates beside the JWT's `exp` / `iat`.
Selective disclosure is per attribute, as the rulebook template requires. If an EU student schema appears
later, it becomes a new version of this type.

## The type

- **vct:** `https://openbadge.digicredential.eu/credentials/student-status/v1/StudentStatusVCT`, published from
  openbadge-vct like the Open Badge VCT (frozen once released, `vct#integrity` pinned, the CI checks extended to
  it). It sits in a directory of its own, because `credentials/v1` and `v2` are versions of the Open Badge
  type. No `extends`: this isn't an Open Badge profile.
- **Display name:** fi "Opiskelijatodiste", en "Student status", sv "Studieintyg", de "Studienbescheinigung",
  fr "Attestation de scolarité", es "Certificado de matrícula", nl "Inschrijvingsbewijs". These are the same
  locales as the Open Badge VCT.
- **Description:** fi "Koski-tietovarannon mukaan läsnä oleva opiskelija", en "Enrolled as a student according
  to the Finnish national study records (Koski)".
- **`simple` rendering:** background `#ff1493` (a bold hot pink), text `#0d0342` (Findynet navy, `--fn-navy` in
  the Findynet design system), contrast 5.2:1. That is as far from the Open Badge's navy card with white text
  as it gets. Most wallets show only these colours and the name. The SVG card uses the same two colours.
- **SVG card** (`templates/svg/StudentStatus_v1.svg`): a student card rather than a medal. It shows the
  holder's name, the institution, the level and programme, and "valid until". As with the Open Badge card, the
  template has no fixed text, so one file serves every language. "Valid until" would need fixed text, so the
  card shows the date beside an hourglass icon instead.

## Claims

The record is K3's (`credentialSubject` with `achievement.creator`, the alignments, `activityStartDate`,
`result`, and the record's `validUntil`), plus the Koski person (`henkilö`) for the name.

| Claim | Example | From | Disclosable |
|---|---|---|---|
| `vct` | the URL above | | no |
| `iss`, `iat`, `exp`, `cnf` | | set by oid4vci-issuer; `exp` from the offer's `validUntil` | no |
| `sub` | `urn:oid:1.2.246.562.24.00000000001` | `credentialSubject.id` (oppijanumero) | **yes** |
| `given_name` | `Testi Matti` | `henkilö.etunimet` (all first names, as in G10) | **yes** |
| `family_name` | `Opiskelija` | `henkilö.sukunimi` | **yes** |
| `birthdate` | `2008-03-14` | `henkilö.syntymäaika` (*question 3*) | **yes** |
| `enrolment_status` | `enrolled` | always `enrolled`; the credential exists only then | no |
| `institution_name` | `Esimerkkilukio` | `achievement.creator.name` | **yes** |
| `institution_id` | `urn:oid:1.2.246.562.10.00000000002` | `achievement.creator.id` (Koski organisation oid) | **yes** |
| `institution_code` | `00000` | `oppilaitos.oppilaitosnumero` (Statistics Finland's 5-digit school number) | **yes** |
| `education_level` | `3` | the koulutusaste alignment's `targetCode` (Statistics Finland 2016, ISCED 2011 levels 0–8) | no |
| `education_level_name` | `Toinen aste` | its `targetName` | no |
| `education_type` | `lukiokoulutus` | the `opiskeluoikeudentyyppi` alignment's `targetCode` | no |
| `education_type_name` | `Lukiokoulutus` | its `targetName` | no |
| `programme` | `Lukion oppimäärä` | `achievement.fieldOfStudy` | **yes** |
| `start_date` | `2024-08-08` | `activityStartDate` (date only) | no |
| `expiry_date` | `2027-06-05` | the record's `validUntil`, as a date in Finnish time | no |
| `issuance_date` | `2026-10-20` | the signing date ("as of"), in Finnish time | no |
| `issuing_country` | `FI` | constant | no |

Each claim is left out when the record doesn't have it (never `undefined` or empty), except `enrolment_status`,
`institution_name`, `expiry_date` and `issuance_date`, which every student status has.

Why these choices:

- **Not `status`.** `status` is a registered SD-JWT VC claim (the Token Status List reference), so the
  enrolment is `enrolment_status`. Its only value is `enrolled`, in lower case like the other machine values.
  It is there so a verifier can ask for one explicit claim and not infer enrolment from the `vct`.
- **`expiry_date` and `issuance_date` as well as `exp` and `iat`.** Wallets render JWT times poorly or not at
  all, and an SVG card can only show claims. The PID does the same. The issuer still sets `exp` and `iat` from
  the same values, and `exp` is the one that counts.
- **What is disclosable:** whatever identifies the person (`sub`, the name, the birth date) or where they study
  (the institution, the programme). The level, the type, the status and the dates are always shown. A verifier
  can then check "enrolled at the second level until June 2027" without learning who or where. A shop that
  needs to match the person with an ID asks for the name too, and the wallet asks the holder.
- **Machine-readable level:** the Statistics Finland level is the only one every education code has (see K3).
  `education_type` tells a lukio pupil from a vocational student at the same level. Higher education's VIRTA type
  (bachelor's or master's) isn't a claim of its own: `education_type` is `korkeakoulutus` and
  `education_level` 6 or 7 already says it.
- **Three institution ids.** The Koski oid is what Finnish education systems use. The school number is what
  most others know (Statistics Finland, student unions, transport operators). Both are cheap, and both are
  disclosable. K3's record doesn't carry the school number, so koski2openbadge would add it as an
  `achievement.creator.otherIdentifier` (an OB 3.0 `IdentifierEntry`, `identifierType: "identifier"`), which
  the Open Badge in downloads then shows too.

### Labels (`claims[].display` in the VCT; fi and en also in the issuer configuration)

| Claim | fi | en |
|---|---|---|
| `given_name` | Etunimet | Given names |
| `family_name` | Sukunimi | Family name |
| `birthdate` | Syntymäaika | Date of birth |
| `enrolment_status` | Opiskelutilanne | Enrolment status |
| `institution_name` | Oppilaitos | Institution |
| `institution_id` | Oppilaitoksen tunniste (OID) | Institution identifier (OID) |
| `institution_code` | Oppilaitosnumero | Institution number |
| `education_level` | Koulutusaste (koodi) | Level of education (code) |
| `education_level_name` | Koulutusaste | Level of education |
| `education_type` | Koulutusmuoto (koodi) | Type of education (code) |
| `education_type_name` | Koulutusmuoto | Type of education |
| `programme` | Koulutus | Programme |
| `start_date` | Opinnot alkaneet | Studies started |
| `expiry_date` | Voimassa asti | Valid until |
| `issuance_date` | Tilanne päivältä | Status as of |
| `issuing_country` | Myöntäjämaa | Issuing country |
| `sub` | Oppijanumero | Learner number |

The VCT also gets de, es, fr, nl and sv labels, like the Open Badge VCT. `enrolment_status` stays `enrolled` in
every language. The VCT has no way to label a value, so the label carries the meaning.

## Issuance

- **oid4vci-issuer:** configuration only, unless it turns out to need more. A new configuration
  `StudentStatusSdJwtVc` (`dc+sd-jwt`, the vct above, `vct#integrity`, `cryptographic_binding_methods_supported:
  ["jwk"]`, ES256, `credential_metadata` with the fi/en name, the colours, the logo and the labels above). It
  goes into the compose file, the aws-environment development tfvars and the image builder's integration
  compose.
- **The app:** `achievementType: "ext:StudentStatus"` goes to the wallet as that configuration, and every other
  badge goes as the Open Badge one. Two new env vars:
  - `OID4VCI_STUDENT_STATUS_CONFIGURATION_ID` (optional, default `StudentStatusSdJwtVc`)
  - `OID4VCI_STUDENT_STATUS_VCT` (optional; without it a student status goes as an Open Badge, as in K3)

  Both go into `.env.example` and `APP_ENV_KEYS`. A new `toStudentStatusClaims(record, { vct, henkilö })` in
  src/badges.js builds the claims, with its own disclosable list. The offer's `validUntil` (K3) sets `exp`.
- **A saved copy sent to a wallet** (K3: it goes as it is) is built from the saved credential's subject and
  dates, the same way.

## In the app

- The list and the detail dialog show a student card icon instead of the medal.
- Student statuses come first in the list, with K3's "Vanhenee" / expired.
- The wallet guide gets a sentence on the student status if real wallets show it differently.

## Decisions (user, 2026-10-21)

1. PID-style snake_case claim names, as above.
2. Disclosable: the identity (`sub`, the name, `birthdate`), the institution and the programme. The level, the
   type, the status and the dates are always shown.
3. `birthdate` is included, disclosable.
4. `institution_code` (the school number) is added in K5: koski2openbadge puts it in
   `achievement.creator.otherIdentifier`.
5. The VCT lives in openbadge-vct, in a directory of its own:
   `credentials/student-status/v1/StudentStatusVCT`.
6. The display names as proposed. Colours: hot pink `#ff1493` with Findynet navy `#0d0342` text (the user
   wanted the card to stand out more than dark teal would).
