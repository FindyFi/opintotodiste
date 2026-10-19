import { head, header, footer } from './layout.js'

export function collectionsPage() {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Kokoelmani – Opintotodiste</title>', ['credentials', 'share', 'collections'], { path: '/my/collections' })}
</head>
<body class="page-collections">
${header()}

<section class="collections-hero">
  <h1 lang="fi">Kokoelmani</h1>
  <p class="lede" lang="fi">Kokoa osaamismerkit kokoelmiksi ja jaa ne linkillä esimerkiksi työnhakemuksen liitteenä. Jokainen vastaanottaja saa oman linkin, jonka voit poistaa koska tahansa.</p>
  <div id="errorBox" class="error" role="alert" hidden></div>
  <p id="loginPrompt" class="login-prompt" hidden>
    <span lang="fi">Kirjaudu sisään pääsyavaimella hallitaksesi kokoelmia.</span>
    <button type="button" class="primary" id="loginPromptBtn"><span lang="fi">Kirjaudu sisään</span></button>
  </p>
  <form class="new-collection" id="newCollectionForm" hidden>
    <label for="newCollectionName" lang="fi">Kokoelman nimi</label>
    <div class="field-row">
      <input type="text" id="newCollectionName" required>
      <button type="submit" class="primary"><span lang="fi">Luo kokoelma</span></button>
    </div>
  </form>
</section>

<main class="panel">
  <div id="collectionsContainer"></div>
  <section id="sharedSection" class="shared-links" hidden>
    <h2 lang="fi">Jaetut todisteet</h2>
    <p class="muted" lang="fi">Todisteet ja kokoelmat, joihin on voimassa oleva jakolinkki, ja keille linkit on tehty. Jaa-painikkeesta voit lisätä ja poistaa linkkejä.</p>
    <div id="sharedContainer"></div>
  </section>
</main>

<dialog id="detailDialog">
  <div id="detailDialogContent"></div>
  <form method="dialog"><button type="submit" lang="fi">Sulje</button></form>
</dialog>

${footer()}
<script src="/vendor/simplewebauthn-browser/index.umd.min.js" defer></script>
<script src="/i18n.js" defer></script>
<script src="/auth.js" defer></script>
<script src="/wallet-offer.js" defer></script>
<script src="/share.js" defer></script>
<script src="/detail.js" defer></script>
<script src="/collections.js" defer></script>
</body>
</html>`
}
