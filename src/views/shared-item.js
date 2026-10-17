import { head, header, esc } from './layout.js'
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
    .map(([term, value]) => `<dt lang="fi">${term}</dt><dd>${esc(value)}</dd>`)
    .join('')

  return `<!doctype html>
<html lang="fi">
<head>
${head(`<title>${esc(achievement.name)} – Opintotodiste</title>`, ['credentials'])}
</head>
<body>
${header({ auth: false })}

<section class="page-hero">
  <span class="eyebrow" lang="fi">Jaettu todiste</span>
  <h1>${esc(achievement.name)}</h1>
  <p class="lede" lang="fi">Tämä osaamismerkki on digitaalisesti allekirjoitettu Open Badges 3.0 -todiste. Voit tarkastaa sen aitouden ilman latausta; lataa todiste vain, jos haluat tallentaa sen.</p>
</section>

<main class="panel">
  <dl class="item-details">${details}</dl>
  <p class="item-actions">
    <a class="button primary" href="/c/${esc(token)}/items/${esc(itemId)}/download" lang="fi">Lataa todiste</a>
    <a class="button" href="/verify" lang="fi">Tarkasta todiste</a>
  </p>
</main>
</body>
</html>`
}
