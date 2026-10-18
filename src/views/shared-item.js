import { head, header, footer, esc, BADGE_ICON, SHARE_ICON } from './layout.js'
import { formatDate } from './shared-collection.js'

// The public page for one credential: /i/:token (a link to that credential
// alone) or /c/:token/items/:itemId (one item of a shared collection). `path` is
// the page's own path; the download sits at `${path}/download`. It doesn't link
// to the collection: whoever shared one credential may not mean to share the rest.
export function sharedItemPage({ path, credential }) {
  const achievement = credential?.credentialSubject?.achievement || {}
  const awarded = formatDate((credential?.issuanceDate ?? credential?.validFrom)?.slice(0, 10))
  const holder = [].concat(credential?.credentialSubject?.identifier ?? [])
    .find((id) => id?.identityType === 'name' && id.hashed === false)?.identityHash
  const details = [
    ['Haltija', holder],
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
${head(`<title>${esc(achievement.name)} – Opintotodiste</title>`, ['credentials', 'recipient'], {
  path,
  title: { fi: `${achievement.name} – Opintotodiste`, en: `${achievement.name} – Study credential` },
  description: {
    fi: ['Osaamismerkki', achievement.creator?.name && `myöntäjä ${achievement.creator.name}`].filter(Boolean).join(', ') + '. Tarkasta merkin aitous Opintotodisteessa.',
    en: ['Badge', achievement.creator?.name && `issued by ${achievement.creator.name}`].filter(Boolean).join(', ') + '. Check it is genuine on Study credential.',
  },
})}
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
        <a class="button primary" href="/verify?url=${esc(encodeURIComponent(`${path}/download`))}" lang="fi">Tarkasta todiste</a>
        <a class="button" href="${esc(path)}/download" lang="fi">Lataa todiste</a>
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
${footer()}
</body>
</html>`
}
