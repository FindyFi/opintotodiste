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

const STYLE = `
  body { font: 16px/1.5 system-ui, sans-serif; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  a { color: #0b5fff; }
  form.koski-form { display: flex; gap: .5rem; margin: 1rem 0; }
  input[type=url] { flex: 1; padding: .5rem; font-size: 1rem; }
  button { padding: .5rem 1rem; font-size: 1rem; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  button.busy::after { content: '\\2026'; margin-left: .3em; }
  .error { background: #ffecec; border: 1px solid #e88; padding: .75rem; border-radius: 4px; margin: 1rem 0; }
  .muted { color: #666; font-size: .9rem; }
  table { width: 100%; max-width: 64rem; border-collapse: collapse; margin: 1rem 0; }
  th, td { text-align: left; padding: .4rem .5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  th.select-col, td.select-col { width: 1%; }
  th { font-size: .8rem; text-transform: uppercase; color: #666; }
  .sort-btn { background: none; border: none; padding: 0; margin: 0; font: inherit; font-size: .8rem; text-transform: uppercase; color: #666; cursor: pointer; display: inline-flex; align-items: center; gap: .3em; }
  .sort-btn .arrow { font-size: .75em; visibility: hidden; }
  th[aria-sort="ascending"] .arrow, th[aria-sort="descending"] .arrow { visibility: visible; }
  .link-btn { background: none; border: none; padding: 0; color: #0b5fff; text-decoration: underline; cursor: pointer; font-size: 1rem; text-align: left; }
  .badge { display: inline-block; font-size: .75rem; text-transform: uppercase; background: #eee; padding: .1rem .5rem; border-radius: 3px; white-space: nowrap; }
  .badge.signed { background: #dfd; }
  .row-error { color: #b00; font-size: .85rem; }
  .bulk-bar { display: flex; align-items: center; gap: .75rem; padding: .5rem 0; }
  .wallet-offer + .wallet-offer { border-top: 1px solid #eee; margin-top: 1rem; padding-top: 1rem; }
  dialog { border: none; border-radius: 6px; padding: 1.5rem; max-width: 32rem; width: 90%; }
  dialog::backdrop { background: rgba(0,0,0,.4); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1rem; margin: 1rem 0; }
  dt { font-weight: 600; }
  .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: .75rem; border-bottom: 1px solid #eee; }
  .topbar-home { font-weight: 600; text-decoration: none; color: inherit; }
  .topbar-right { display: flex; align-items: center; gap: .5rem; }
  .collection-row { display: flex; align-items: center; gap: .75rem; padding: .6rem 0; border-bottom: 1px solid #eee; }
  .collection-row .name { font-weight: 600; flex: 1; }
  .share-link { font-family: ui-monospace, monospace; font-size: .85rem; word-break: break-all; }
`

// Rendered on every page that shows a login/account nav (main page,
// collections page). Deliberately just a shell: public/auth.js owns
// populating #authNav from GET /auth/me and re-renders it after
// login/register/logout, so there is exactly one place (client-side) that
// knows how to draw the logged-in vs. logged-out state.
function header() {
  return `<header class="topbar">
  <a class="topbar-home" href="/" lang="fi">Opintotodiste</a>
  <nav id="authNav" class="topbar-right"></nav>
</header>
<dialog id="authDialog">
  <div id="authDialogContent"></div>
</dialog>`
}

export function page({ koskiUrl = '', initialData = null } = {}) {
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title lang="fi">Opintotodiste</title>
<link rel="stylesheet" href="/vendor/translate-element/translate-element.css">
<script src="/vendor/translate-element/translate-element.js"></script>
<style>${STYLE}</style>
</head>
<body>
<translate-element src="/translations.json"></translate-element>
${header()}

<h1 lang="fi">Opintotodiste</h1>
<p lang="fi">Syötä Koski-opintotietojesi linkki nähdäksesi, mitkä osaamismerkit tiedoista voidaan myöntää.</p>

<div id="errorBox" class="error" hidden></div>

<form class="koski-form" id="koskiForm">
  <input type="url" name="koskiUrl" id="koskiUrlInput" placeholder="https://opintopolku.fi/koski/opinnot/..." value="${esc(koskiUrl)}" required>
  <button type="submit" id="submitBtn"><span lang="fi">Hae opinnot</span></button>
</form>

<p id="metaBox" class="muted" hidden></p>
<div id="tableContainer"></div>
<div id="bulkBar" class="bulk-bar" hidden>
  <span id="bulkCount" class="muted"></span>
  <button type="button" id="bulkWalletBtn" disabled><span lang="fi">Lisää lompakkoon</span></button>
  <button type="button" id="bulkCollectionBtn" disabled><span lang="fi">Lisää kokoelmaan</span></button>
</div>

<dialog id="detailDialog">
  <div id="detailDialogContent"></div>
  <form method="dialog"><button type="submit" lang="fi">Sulje</button></form>
</dialog>

<script>window.__INITIAL_DATA__ = ${embedJson(initialData)}</script>
<script src="/vendor/simplewebauthn-browser/index.umd.min.js" defer></script>
<script src="/auth.js" defer></script>
<script src="/app.js" defer></script>
</body>
</html>`
}

export function collectionsPage() {
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title lang="fi">Kokoelmani – Opintotodiste</title>
<link rel="stylesheet" href="/vendor/translate-element/translate-element.css">
<script src="/vendor/translate-element/translate-element.js"></script>
<style>${STYLE}</style>
</head>
<body>
<translate-element src="/translations.json"></translate-element>
${header()}

<h1 lang="fi">Kokoelmani</h1>

<div id="errorBox" class="error" hidden></div>
<p id="loginPrompt" class="muted" hidden>
  <span lang="fi">Kirjaudu sisään kulkuavaimella hallitaksesi kokoelmia.</span>
  <button type="button" id="loginPromptBtn"><span lang="fi">Kirjaudu sisään</span></button>
</p>

<form class="koski-form" id="newCollectionForm" hidden>
  <input type="text" id="newCollectionName" placeholder="Kokoelman nimi" required>
  <button type="submit"><span lang="fi">Luo kokoelma</span></button>
</form>

<div id="collectionsContainer"></div>

<script src="/vendor/simplewebauthn-browser/index.umd.min.js" defer></script>
<script src="/auth.js" defer></script>
<script src="/collections.js" defer></script>
</body>
</html>`
}

export function sharedCollectionPage({ token, collection, items }) {
  const rows = items
    .map((item) => {
      const achievement = item.credential?.credentialSubject?.achievement || {}
      return `<tr>
        <td>${esc(achievement.name)}</td>
        <td><span class="badge">${esc(achievement.achievementType)}</span></td>
        <td>${esc(achievement.creator?.name)}</td>
        <td>${esc(item.credential?.awardedOn)}</td>
        <td><a href="/c/${esc(token)}/items/${esc(item.id)}/download" lang="fi">Lataa</a></td>
      </tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(collection.name)} – Opintotodiste</title>
<link rel="stylesheet" href="/vendor/translate-element/translate-element.css">
<script src="/vendor/translate-element/translate-element.js"></script>
<style>${STYLE}</style>
</head>
<body>
<translate-element src="/translations.json"></translate-element>

<h1>${esc(collection.name)}</h1>
<p class="muted" lang="fi">Jaettu kokoelma</p>

${
  items.length
    ? `<table>
  <thead><tr><th lang="fi">Nimi</th><th lang="fi">Tyyppi</th><th lang="fi">Myöntäjä</th><th lang="fi">Myönnetty</th><th lang="fi">Tila</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`
    : `<p class="muted" lang="fi">Kokoelmassa ei ole vielä kohteita.</p>`
}
</body>
</html>`
}
