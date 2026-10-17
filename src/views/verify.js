import { head, header, esc } from './layout.js'

// /verify: in-browser verification of a downloaded ldp_vc (or a VP holding
// one) with @digitalcredentials/veri-good, served from /vendor/veri-good.
// veri-good draws its own input and result UI in a shadow DOM, in English
// only; the text around it is fi/en sibling pairs for translate-element.
// Its "<holder> was awarded <name> by the <issuer>" stays empty for our
// credentials (no credentialSubject.name or top-level name), so the slots
// only label the issuer, which is the signer.
// SD-JWTs from wallets are out of scope (that needs OID4VP, see /employer).

const pair = (tag, attrs, fi, en) => `<${tag}${attrs} lang="fi">${fi}</${tag}><${tag}${attrs} lang="en">${en}</${tag}>`

// `issuers` is veri-good's issuer list ({ "<did>": { issuerName, url } }).
// It goes in a <template>, whose content the HTML parser decodes, so escaping
// the JSON as text is both safe and lossless. An empty list still has to be
// rendered: without the template veri-good falls back to its demo DIDs.
export function verifyPage({ issuers }) {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Tarkasta todiste – Opintotodiste</title>', ['recipient', 'verify'])}
<script type="module" src="/vendor/veri-good/bundle.js"></script>
<script src="/verify.js" defer></script>
</head>
<body class="page-verify page-recipient">
<div class="recipient-band">
${header({ auth: false, current: 'verify' })}

<section class="recipient-hero single">
  <div class="recipient-hero-text">
    ${pair('h1', '', 'Tarkasta osaamistodiste', 'Verify a credential')}
    ${pair(
      'p',
      ' class="lede"',
      'Lisää ladattu todiste: valitse tiedosto, liitä sen sisältö (JSON) tai linkki siihen. Tarkastus tehdään selaimessasi, eikä todistetta lähetetä palvelimelle.',
      'Add a downloaded credential: choose the file, or paste its content (JSON) or a link to it. The check runs in your browser, and the credential is not sent to any server.'
    )}
  </div>
</section>
</div>

<main class="verify">
  <div class="verifier">
    <veri-good>
      <div slot="header" class="verifier-header">${pair('span', '', 'Todisteen tarkastus', 'Credential verification')}</div>
      <span slot="wasAwarded"></span>
      <div slot="awardedBy" class="verifier-label">${pair('span', '', 'Allekirjoittaja', 'Signed by')}</div>
      <template id="issuer-dids">${esc(JSON.stringify(issuers))}</template>
    </veri-good>
  </div>

  <aside class="verify-notes">
    <div class="verify-note">
      ${pair('h2', '', 'Mitä tarkastetaan', 'What is checked')}
      ${pair(
        'ul',
        '',
        '<li>Allekirjoitus on kelvollinen, eli todistetta ei ole muutettu allekirjoittamisen jälkeen.</li><li>Allekirjoittaja on Opintotodiste-palvelu, joka on tehnyt todisteen Koski-palvelun tiedoista.</li><li>Todiste ei ole vanhentunut.</li>',
        '<li>The signature is valid, so the credential has not been changed since it was signed.</li><li>The signer is the Opintotodiste service, which made the credential from data in the Koski service.</li><li>The credential has not expired.</li>'
      )}
    </div>
    <div class="verify-note">
      ${pair('h2', '', 'Todiste mobiililompakossa?', 'A credential in a mobile wallet?')}
      ${pair(
        'p',
        '',
        'Tällä sivulla voi tarkastaa vain ladatut todisteet. Lompakosta esitetyn todisteen tarkastamiseen tarvitaan oma työkalu; katso <a href="/employer">Työnantajalle</a>-sivu.',
        'This page only checks downloaded credentials. A credential presented from a wallet needs a tool of its own; see the <a href="/employer">For employer</a> page.'
      )}
    </div>
  </aside>
</main>
</body>
</html>`
}
