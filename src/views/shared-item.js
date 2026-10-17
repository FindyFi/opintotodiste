import { head, header, esc } from './layout.js'
import { formatDate } from './shared-collection.js'

// The public page for one credential in a shared collection (/c/:token/items/:itemId).
export function sharedItemPage({ token, itemId, credential, collectionName }) {
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
  <span class="eyebrow"><a href="/c/${esc(token)}">${esc(collectionName)}</a></span>
  <h1>${esc(achievement.name)}</h1>
  <p class="lede" lang="fi">Tämä osaamismerkki on digitaalisesti allekirjoitettu Open Badges 3.0 -todiste. Lataa se tarkistaaksesi sen aitouden.</p>
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
