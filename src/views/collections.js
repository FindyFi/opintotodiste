import { head, header } from './layout.js'

export function collectionsPage() {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Kokoelmani – Opintotodiste</title>', ['credentials', 'share', 'collections'])}
</head>
<body>
${header()}

<section class="page-hero">
  <h1 lang="fi">Kokoelmani</h1>
  <p class="lede" lang="fi">Kokoa osaamismerkit kokoelmiksi ja jaa ne linkillä esimerkiksi työnhakemuksen liitteenä.</p>
  <div id="errorBox" class="error" role="alert" hidden></div>
  <p id="loginPrompt" class="login-prompt" hidden>
    <span lang="fi">Kirjaudu sisään pääsyavaimella hallitaksesi kokoelmia.</span>
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
<script src="/share.js" defer></script>
<script src="/collections.js" defer></script>
</body>
</html>`
}
