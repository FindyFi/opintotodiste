import { head, header, esc, BADGE_ICON, SHARE_ICON } from './layout.js'
import { formatDate } from './shared-collection.js'

// The public page for one credential (/c/:token/items/:itemId). It doesn't link
// to the collection: whoever shared one credential may not mean to share the rest.
export function sharedItemPage({ token, itemId, credential }) {
  const achievement = credential?.credentialSubject?.achievement || {}
  const awarded = formatDate((credential?.issuanceDate ?? credential?.validFrom)?.slice(0, 10))
  const details = [
    ['Tyyppi', achievement.achievementType],
    ['Myöntäjä', achievement.creator?.name],
    ['Myönnetty', awarded],
    ['Koulutusala', achievement.fieldOfStudy],
    ['Koodi', achievement.humanCode],
  ]
    .filter(([, value]) => value)
    .map(([term, value]) => `<div><dt lang="fi">${term}</dt><dd>${esc(value)}</dd></div>`)
    .join('')

  return `<!doctype html>
<html lang="fi">
<head>
${head(`<title>${esc(achievement.name)} – Opintotodiste</title>`, ['credentials', 'recipient'])}
</head>
<body class="page-recipient">
<div class="recipient-band">
${header({ auth: false })}

<section class="recipient-hero single">
  <div class="recipient-item">
    <span class="recipient-item-icon">${BADGE_ICON}</span>
    <div class="recipient-hero-text">
      <span class="recipient-pill">${SHARE_ICON}<span lang="fi">Jaettu todiste</span></span>
      <h1>${esc(achievement.name)}</h1>
      <p class="lede" lang="fi">Tämä osaamismerkki on digitaalisesti allekirjoitettu Open Badges 3.0 -todiste. Voit tarkastaa sen aitouden ilman latausta; lataa todiste vain, jos haluat tallentaa sen.</p>
      <p class="recipient-actions">
        <a class="button primary" href="/verify?url=${esc(encodeURIComponent(`/c/${token}/items/${itemId}/download`))}" lang="fi">Tarkasta todiste</a>
        <a class="button" href="/c/${esc(token)}/items/${esc(itemId)}/download" lang="fi">Lataa todiste</a>
      </p>
    </div>
  </div>
</section>
</div>

<main class="recipient-main recipient-item-main">
  <dl class="item-details recipient-sheet">${details}</dl>
  <aside class="recipient-aside recipient-sheet">
    <h2 lang="fi">Mikä on osaamismerkki?</h2>
    <p lang="fi">Osaamismerkki kuvaa yhden suorituksen. Sen allekirjoituksesta näkee, kuka sen myönsi ja ettei sitä ole muutettu.</p>
    <a href="/employer" lang="fi">Mitä osaamismerkit ovat ja miten ne tarkastetaan?</a>
  </aside>
</main>
</body>
</html>`
}
