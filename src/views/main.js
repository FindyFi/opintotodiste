import { head, header, esc, embedJson } from './layout.js'

export function page({ koskiUrl = '', initialData = null } = {}) {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Opintotodiste</title>', ['credentials', 'main'])}
</head>
<body>
${header()}

<section class="hero">
  <div class="hero-main">
    <h1 lang="fi">Näytä, mitä <em>osaat.</em></h1>
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
    <li><span class="step-num">1</span><span lang="fi">Luo jakolinkki Oma Opintopolussa</span></li>
    <li><span class="step-num">2</span><span lang="fi">Valitse suoritukset ja tallenna ne lompakkoon</span></li>
    <li><span class="step-num">3</span><span lang="fi">Kokoa ja jaa kokoelma työnantajalle</span></li>
  </ol>
</section>

<main class="panel" id="resultsPanel" hidden>
  <div class="results">
    <section aria-labelledby="resultsHeading">
      <div class="list-head">
        <h2 id="resultsHeading" lang="fi">Suoritukset</h2>
        <p id="metaBox" class="muted" hidden></p>
      </div>
      <div id="tableContainer"></div>
    </section>
    <aside class="results-aside">
      <div id="bulkBar" class="action-card" hidden>
        <span id="bulkCount" class="eyebrow"></span>
        <p class="action-title" lang="fi">Mitä teet valituilla?</p>
        <button type="button" class="primary" id="bulkWalletBtn" disabled><span lang="fi">Lisää lompakkoon</span></button>
        <button type="button" id="bulkCollectionBtn" disabled><span lang="fi">Lisää kokoelmaan</span></button>
      </div>
      <div class="note-card">
        <h3 lang="fi">Työnantajalle</h3>
        <p lang="fi">Kokoelman jakolinkin avaaja näkee osaamismerkit ja voi ladata ne tarkistettaviksi ilman kirjautumista.</p>
      </div>
    </aside>
  </div>
</main>

<dialog id="detailDialog">
  <div id="detailDialogContent"></div>
  <form method="dialog"><button type="submit" lang="fi">Sulje</button></form>
</dialog>

<script>window.__INITIAL_DATA__ = ${embedJson(initialData)}</script>
<script src="/vendor/simplewebauthn-browser/index.umd.min.js" defer></script>
<script src="/auth.js" defer></script>
<script src="/wallet-offer.js" defer></script>
<script src="/app.js" defer></script>
</body>
</html>`
}
