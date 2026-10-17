import { head, header, esc, embedJson } from './layout.js'

const icon = (shapes) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`
const ARROW_ICON = icon('<path d="M5 12h14M13 6l6 6-6 6"/>')
const SHARE_ICON = icon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>')
const WALLET_ICON = icon('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2M3 10h18"/>')

// Each step links to its guide page (task U3).
const STEPS = [
  { text: 'Luo jakolinkki Oma Opintopolussa', href: '/guide/studyinfo' },
  { text: 'Valitse suoritukset ja tallenna ne lompakkoon', href: '/guide/wallet' },
  { text: 'Kokoa ja jaa kokoelma työnantajalle', href: '/guide/sharing' },
]

export function page({ koskiUrl = '', initialData = null } = {}) {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Opintotodiste</title>', ['credentials', 'share', 'main'])}
</head>
<body class="page-main">
${header()}

<section class="hero">
  <div class="hero-main">
    <p class="hero-flow" aria-hidden="true"><span lang="fi">Koski</span>${ARROW_ICON}<span lang="fi">Osaamismerkit</span></p>
    <h1 lang="fi">Opintosi todennettaviksi osaamismerkeiksi</h1>
    <p class="lede" lang="fi">Syötä Koski-opintotietojesi linkki nähdäksesi, mitkä osaamismerkit tiedoista voidaan myöntää.</p>
    <form class="koski-form" id="koskiForm">
      <label for="koskiUrlInput" lang="fi">Koski-jakolinkki</label>
      <div class="field-row">
        <input type="url" name="koskiUrl" id="koskiUrlInput" placeholder="https://opintopolku.fi/koski/opinnot/..." value="${esc(koskiUrl)}" required>
        <button type="submit" class="primary" id="submitBtn"><span lang="fi">Hae opinnot</span></button>
      </div>
    </form>
    <div id="errorBox" class="error" role="alert" hidden></div>
  </div>
  <ol class="steps">
${STEPS.map(
  ({ text, href }, i) => `    <li>
      <span class="step-num">${i + 1}</span>
      <span class="step-body">
        <span lang="fi">${text}</span>
        <a href="${href}" lang="fi">Ohjeet →</a>
      </span>
    </li>`
).join('\n')}
  </ol>
</section>

<main class="panel" id="resultsPanel" hidden>
  <section aria-labelledby="resultsHeading">
    <div class="list-head">
      <h2 id="resultsHeading" lang="fi">Suoritukset</h2>
      <p id="metaBox" class="muted" hidden></p>
    </div>
    <div id="tableContainer"></div>
  </section>
</main>

<div id="bulkBar" class="selection-bar" role="region" aria-label="Valinnat" hidden>
  <span id="bulkCount" class="selection-count"></span>
  <button type="button" class="link-btn" id="bulkClearBtn"><span lang="fi">Poista valinnat</span></button>
  <span class="selection-spacer"></span>
  <button type="button" id="bulkShareBtn">${SHARE_ICON}<span lang="fi">Jaa</span></button>
  <button type="button" id="bulkCollectionBtn" disabled><span lang="fi">Lisää kokoelmaan</span></button>
  <button type="button" class="primary" id="bulkWalletBtn" disabled>${WALLET_ICON}<span lang="fi">Lisää lompakkoon</span></button>
</div>

<dialog id="detailDialog">
  <div id="detailDialogContent"></div>
  <form method="dialog"><button type="submit" lang="fi">Sulje</button></form>
</dialog>

<script>window.__INITIAL_DATA__ = ${embedJson(initialData)}</script>
<script src="/vendor/simplewebauthn-browser/index.umd.min.js" defer></script>
<script src="/auth.js" defer></script>
<script src="/wallet-offer.js" defer></script>
<script src="/share.js" defer></script>
<script src="/detail.js" defer></script>
<script src="/app.js" defer></script>
</body>
</html>`
}
