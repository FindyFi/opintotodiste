import { esc, head, header, footer } from './layout.js'

// A page for an address that leads nowhere: an expired or removed share link,
// a deleted credential, a mistyped URL. `message` is Finnish, with its English
// in translations.json like the rest of the UI.
export function notFoundPage(message = 'Sivua ei löytynyt.') {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Ei löytynyt – Opintotodiste</title>', ['policy'])}
</head>
<body class="page-not-found">
${header({ auth: false })}

<main class="policy">
  <h1 lang="fi">${esc(message)}</h1>
  <p><a href="/" lang="fi">Etusivulle</a></p>
</main>
${footer()}
</body>
</html>`
}
