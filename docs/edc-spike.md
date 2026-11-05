# EDC1 spike: Koski data as a European Digital Credential

Status: done 2026-11-05. The spike succeeded; see the Recommendation.
The code is in `spike/edc/` and is throwaway. Nothing here runs in the app.

## Question

Can opintotodiste also issue its credentials as European Digital Credentials
(EDC), so that students can keep them in the Europass wallet? What would that
take: data mapping, signing stack, and seal?

## What an EDC is

The EU's samples are in
[european-commission-empl/European-Learning-Model](https://github.com/european-commission-empl/European-Learning-Model),
under `Credentials/JSON-LD Examples (ELM v3)`.

- **Payload:** a W3C VC Data Model **1.1** credential with the types
  `VerifiableCredential` and `EuropeanDigitalCredential`. It uses the contexts
  `https://www.w3.org/2018/credentials/v1` and
  `http://data.europa.eu/snb/model/context/edc-ap` (the ELM 3 vocabulary).
- **Rules:** the payload must conform to the published SHACL shapes. The
  `edc-generic-full` shapes import `edc-generic-no-cv` and add checks on the
  EU code lists. The version we used is dated 2023-09-28.
- **Seal:** the file is a JAdES signature in JWS JSON serialisation, with the
  payload enveloped and left unencoded (`b64: false`). The samples use RS256,
  `x5c`, `x5t#S256` and `sigT`, plus timestamps, certificates and revocation
  data in `etsiU`. They were made with EU DSS against DSS's own test PKI and
  test timestamping service.

## What we built

| File | What it does |
| --- | --- |
| `koski2elm.mjs` | Maps one Koski higher-education degree (`korkeakoulututkinto`) and its passed courses to ELM by hand. Its input is koski2openbadge's synthetic `koski-sample.json`. |
| `validate.py` | Checks a credential against the EDC shapes with pyshacl, offline. It accepts unsigned, sealed and "uploadable" files. |
| `test-pki.sh` | Creates a throwaway root CA and a seal certificate for `O=Findynet Osuuskunta, organizationIdentifier=NTRFI-3213523-3`, with a revocation list (CRL). |
| `sealer/Seal.java`, `seal.sh` | Seals with EU DSS 6.5.1: signs at level T, refreshes the CRL, then extends to LT or LTA. `Seal validate` validates a sealed file as a DSS-based verifier would. |
| `out/` | The unsigned credential and the sealed variants. |

## Results

1. **The mapping validates.** The credential conforms to `edc-generic-full`,
   including the code-list checks. A deliberately broken code list was
   rejected, so the checks are live. The EU sample also conforms. The ELM
   structure is:
   - the degree is a `LearningAchievement` specified by a `Qualification`
     (title, EQF level, Statistics Finland education code, ECTS credits);
   - each passed course is a `hasPart` `LearningAchievement` with a
     `LearningAssessment` (grade) and a `LearningAchievementSpecification`
     (course code, ECTS);
   - the school is the `awardingBody`, and Findynet is the `issuer`.
2. **ELM requires a rendered page image.** `displayParameter.individualDisplay`
   needs one image per display language. The EDC Issuer normally draws it. We
   render SVG to PNG; production would need a renderer such as resvg-js. The
   three PNGs make the file about 250 KB.
3. **Sealing works.** DSS 6.5.1 produces the same envelope as the samples. With
   the test root trusted, DSS validates the seal as `TOTAL_PASSED`. Without it
   (the Europass position), the result is `INDETERMINATE /
   NO_CERTIFICATE_CHAIN_FOUND`, the same as the EU sample.
4. **DSS 6 versus the samples.** DSS 6 writes the signing time as `iat` and the
   certificate digest as `x5t#o`; the samples have `sigT` and `x5t#S256`.
   Asking DSS 6.5 for `sigT` leaves `sigT` out of `crit`, and DSS then
   classifies its own output as `JSON-NOT-ETSI`. With `iat` (and `x5t#S256`),
   DSS recognises the file as JAdES baseline. Which form Europass accepts is
   part of step 4.
5. **Level LT needs fresh revocation data.** DSS classifies our LT file as
   `JAdES-BASELINE-T` (the EU sample also comes out as T). The CRLs of
   DigiCert's free timestamping service are not newer than the signing time.
   A trust service provider's timestamping service with OCSP should fix this;
   ask about it when getting quotes.

## Gaps in the Koski → ELM mapping

- **Legal identifier of the awarding body.** ELM expects one; Koski gives only
  the institution's OID. We carry the OID as a plain `Identifier`. A real
  converter needs a mapping from OID to business ID (Y-tunnus), which may come
  from the organisation service of the Finnish National Agency for Education
  (OPH).
- **EQF/NQF level.** Not in Koski. We guess it from the first digit of the
  Statistics Finland education code (6 = bachelor's, 7 = master's). A real
  converter needs an official mapping, and one for ISCED-F fields.
- **Degree extent.** Not in the export. We use the sum of the passed courses,
  which is only a lower bound.
- **Grading scale.** Grades are free-text `Note`s. The `virtaarvosana` scale
  (0–5, pass/fail) could become an ELM `GradingScheme`.
- **Provenance.** The `Evidence` vocabulary has only Mandate, Conversion and
  Accreditation. None of them means "copied from a national register at the
  learner's request", and Mandate would claim authorisation from the school
  that we don't have. The provenance statement therefore goes in
  `displayParameter.description`.
- **Who the learner is.** The subject is `urn:oid:<oppijanumero>` (the learner
  number in Koski) plus the name. There is no date of birth or national ID,
  in line with our Open Badges credentials.

## Signing stack for production

- **No reuse.** Neither digitalcredentials/signing-service (Data Integrity
  proofs) nor oid4vci-issuer (SD-JWT) can produce JAdES. We'd need a small
  Java service around EU DSS. The DSS libraries are about 25 MB of jars.
- **Its job:** take an unsigned payload, seal it with the seal key (on a token
  or HSM, or through the provider's remote sealing service, if Europass
  accepts remote sealing), timestamp it, and embed revocation data.
- **Image rendering:** the rendered page image (item 2 of the results) is
  needed as well.
- **Alternative:** the Commission's EDC Issuer accepts "uploadable" unsigned
  JSON (`{ "credential": … }`, see `--uploadable`) and seals it through NexU,
  a Windows-only desktop tool. That is manual, so it isn't an option for a
  service.

## Step 4: Europass upload

On 2026-11-05 the user uploaded all three sealed files (`-LT-iat`, `-LT`
and `-LTA`) to Europass. All three gave the same results:

| Check | Result |
| --- | --- |
| Format | OK |
| Validity | OK |
| Seal | failed, as expected: the test root is on no EU trusted list |
| Revocation | N/A |
| Accreditation | N/A |

So Europass accepts both signing-time forms (`iat` and `sigT`) and both
levels (LT and LTA). What is left to make the credential fully verifiable
is a seal certificate that chains to an EU trusted list.

## Recommendation

**Go.** The data and format side is solved, and a credential sealed with a
real trusted-list certificate should pass the Seal check too. Next, the
follow-ups listed in PLAN.md:

1. Ask EMPL-ELM-SUPPORT@ec.europa.eu two questions:
   - Is an advanced seal held on a remote or cloud sealing service
     acceptable?
   - Is a third-party re-issuer acceptable, with Findynet as issuer and
     sealer and the school as awarding body, but no mandate from the school?
     The "Mandate" evidence type doesn't fit our case.
2. Ask two or three trust service providers for quotes: a seal certificate
   for Findynet Osuuskunta (advanced or qualified) plus a timestamping
   service with OCSP, so the seal reaches LT level.

If both answers allow it, a production task would cover:

- `koski2elm`, either as a package or as part of koski2openbadge, covering
  all record types and the gaps above (the awarding body's business ID,
  EQF/ISCED-F levels, grading schemes);
- the rendered page images;
- a small DSS-based sealing service;
- a download button. Europass upload stays manual; there's no OID4VCI.
