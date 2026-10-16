export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

// Safe to embed inside a <script> tag: escapes characters that could
// otherwise close the tag early or be sniffed as a comment/CDATA opener.
function embedJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

// A rosette: the badge mark used for the brand and for credential rows
// (public/app.js draws the same shape client-side).
const BADGE_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="M8.5 13.8 7 22l5-3 5 3-1.5-8.2"/></svg>`

// Mirrors public/app.js: whole qualifications get the stronger icon tint.
const MAJOR_ACHIEVEMENT_TYPES = /Degree|Diploma|Certificate|Certification|License/

// Koski's ISO dates (YYYY-MM-DD) in Finnish form (D.M.YYYY), the page's
// default language. Anything else passes through unchanged.
function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return match ? `${Number(match[3])}.${Number(match[2])}.${match[1]}` : iso
}

// Everything in <head> except the <title>. Styles live in public/styles.css;
// Archivo is self-hosted from @fontsource-variable/archivo (see index.js).
function head(title) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${title}
<link rel="stylesheet" href="/vendor/archivo/wdth.css">
<link rel="stylesheet" href="/vendor/translate-element/translate-element.css">
<link rel="stylesheet" href="/styles.css">
<script src="/vendor/translate-element/translate-element.js"></script>`
}

// Rendered on every page. With `auth` it also carries the login/account nav
// (main page, collections page). That nav is deliberately just a shell:
// public/auth.js owns populating #authNav from GET /auth/me and re-renders
// it after login/register/logout, so there is exactly one place
// (client-side) that knows how to draw the logged-in vs. logged-out state.
// translate-element sits here too, outside #authNav, so auth.js's re-renders
// never wipe the language switcher.
function header({ auth = true } = {}) {
  return `<header class="topbar">
  <a class="brand" href="/">${BADGE_ICON}<span lang="fi">Opintotodiste</span></a>
  <div class="topbar-right">
    ${auth ? '<nav id="authNav" class="auth-nav"></nav>' : ''}
    <translate-element src="/translations.json"></translate-element>
  </div>
</header>${
    auth
      ? `
<dialog id="authDialog">
  <div id="authDialogContent"></div>
</dialog>`
      : ''
  }`
}

export function page({ koskiUrl = '', initialData = null } = {}) {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Opintotodiste</title>')}
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

export function collectionsPage() {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Kokoelmani – Opintotodiste</title>')}
</head>
<body>
${header()}

<section class="page-hero">
  <h1 lang="fi">Kokoelmani</h1>
  <p class="lede" lang="fi">Kokoa osaamismerkit kokoelmiksi ja jaa ne linkillä esimerkiksi työnhakemuksen liitteenä.</p>
  <div id="errorBox" class="error" role="alert" hidden></div>
  <p id="loginPrompt" class="login-prompt" hidden>
    <span lang="fi">Kirjaudu sisään kulkuavaimella hallitaksesi kokoelmia.</span>
    <button type="button" class="primary" id="loginPromptBtn"><span lang="fi">Kirjaudu sisään</span></button>
  </p>
  <form class="new-collection" id="newCollectionForm" hidden>
    <input type="text" id="newCollectionName" placeholder="Kokoelman nimi" aria-label="Kokoelman nimi" required>
    <button type="submit" class="primary"><span lang="fi">Luo kokoelma</span></button>
  </form>
</section>

<main class="panel">
  <div id="collectionsContainer"></div>
</main>

<dialog id="detailDialog">
  <div id="detailDialogContent"></div>
  <form method="dialog"><button type="submit" lang="fi">Sulje</button></form>
</dialog>

<script src="/vendor/simplewebauthn-browser/index.umd.min.js" defer></script>
<script src="/auth.js" defer></script>
<script src="/wallet-offer.js" defer></script>
<script src="/collections.js" defer></script>
</body>
</html>`
}

export function sharedCollectionPage({ token, collection, items }) {
  const rows = items
    .map((item) => {
      const achievement = item.credential?.credentialSubject?.achievement || {}
      const meta = [achievement.achievementType, achievement.creator?.name, formatDate((item.credential?.issuanceDate ?? item.credential?.validFrom)?.slice(0, 10))].filter(Boolean)
      const iconClass = MAJOR_ACHIEVEMENT_TYPES.test(achievement.achievementType ?? '') ? 'credential-icon strong' : 'credential-icon'
      return `<li class="credential">
        <span class="${iconClass}">${BADGE_ICON}</span>
        <div class="credential-body">
          <span class="credential-name">${esc(achievement.name)}</span>
          <span class="credential-meta">${meta.map(esc).join(' · ')}</span>
        </div>
        <div class="credential-status"><a href="/c/${esc(token)}/items/${esc(item.id)}/download" lang="fi">Lataa</a></div>
      </li>`
    })
    .join('')

  return `<!doctype html>
<html lang="fi">
<head>
${head(`<title>${esc(collection.name)} – Opintotodiste</title>`)}
</head>
<body>
${header({ auth: false })}

<section class="page-hero">
  <span class="eyebrow" lang="fi">Jaettu kokoelma</span>
  <h1>${esc(collection.name)}</h1>
  <p class="lede" lang="fi">Kokoelman osaamismerkit ovat digitaalisesti allekirjoitettuja Open Badges 3.0 -todisteita. Lataa merkki tarkistaaksesi sen.</p>
</section>

<main class="panel">
${
  items.length
    ? `<ul class="credential-list">${rows}</ul>`
    : `<p class="empty" lang="fi">Kokoelmassa ei ole vielä kohteita.</p>`
}
</main>
</body>
</html>`
}
