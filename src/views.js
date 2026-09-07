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
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  a { color: #0b5fff; }
  form.koski-form { display: flex; gap: .5rem; margin: 1rem 0; }
  input[type=url] { flex: 1; padding: .5rem; font-size: 1rem; }
  button { padding: .5rem 1rem; font-size: 1rem; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  button.busy::after { content: '\\2026'; margin-left: .3em; }
  .error { background: #ffecec; border: 1px solid #e88; padding: .75rem; border-radius: 4px; margin: 1rem 0; }
  .muted { color: #666; font-size: .9rem; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { text-align: left; padding: .4rem .5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  th { font-size: .8rem; text-transform: uppercase; color: #666; }
  .sort-btn { background: none; border: none; padding: 0; margin: 0; font: inherit; font-size: .8rem; text-transform: uppercase; color: #666; cursor: pointer; display: inline-flex; align-items: center; gap: .3em; }
  .sort-btn .arrow { font-size: .75em; visibility: hidden; }
  th[aria-sort="ascending"] .arrow, th[aria-sort="descending"] .arrow { visibility: visible; }
  .link-btn { background: none; border: none; padding: 0; color: #0b5fff; text-decoration: underline; cursor: pointer; font-size: 1rem; text-align: left; }
  .badge { display: inline-block; font-size: .75rem; text-transform: uppercase; background: #eee; padding: .1rem .5rem; border-radius: 3px; white-space: nowrap; }
  .badge.signed { background: #dfd; }
  .row-error { color: #b00; font-size: .85rem; }
  dialog { border: none; border-radius: 6px; padding: 1.5rem; max-width: 32rem; width: 90%; }
  dialog::backdrop { background: rgba(0,0,0,.4); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1rem; margin: 1rem 0; }
  dt { font-weight: 600; }
`

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

<h1 lang="fi">Opintotodiste</h1>
<p lang="fi">Syötä Koski-opintotietojesi linkki nähdäksesi, mitkä osaamismerkit tiedoista voidaan myöntää.</p>

<div id="errorBox" class="error" hidden></div>

<form class="koski-form" id="koskiForm">
  <input type="url" name="koskiUrl" id="koskiUrlInput" placeholder="https://opintopolku.fi/koski/opinnot/..." value="${esc(koskiUrl)}" required>
  <button type="submit" id="submitBtn"><span lang="fi">Hae opinnot</span></button>
</form>

<p id="metaBox" class="muted" hidden></p>
<div id="tableContainer"></div>

<dialog id="detailDialog">
  <div id="detailDialogContent"></div>
  <form method="dialog"><button type="submit" lang="fi">Sulje</button></form>
</dialog>

<script>window.__INITIAL_DATA__ = ${embedJson(initialData)}</script>
<script src="/app.js" defer></script>
</body>
</html>`
}
