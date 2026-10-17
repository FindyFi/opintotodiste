import { head, header, esc, BADGE_ICON } from './layout.js'

// Mirrors public/app.js: whole qualifications get the stronger icon tint.
const MAJOR_ACHIEVEMENT_TYPES = /Degree|Diploma|Certificate|Certification|License/

// Koski's ISO dates (YYYY-MM-DD) in Finnish form (D.M.YYYY), the page's
// default language. Anything else passes through unchanged.
export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return match ? `${Number(match[3])}.${Number(match[2])}.${match[1]}` : iso
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
          <a class="credential-name" href="/c/${esc(token)}/items/${esc(item.id)}">${esc(achievement.name)}</a>
          <span class="credential-meta">${meta.map(esc).join(' · ')}</span>
        </div>
        <div class="credential-status"><a href="/c/${esc(token)}/items/${esc(item.id)}/download" lang="fi">Lataa</a></div>
      </li>`
    })
    .join('')

  return `<!doctype html>
<html lang="fi">
<head>
${head(`<title>${esc(collection.name)} – Opintotodiste</title>`, ['credentials'])}
</head>
<body>
${header({ auth: false })}

<section class="page-hero">
  <span class="eyebrow" lang="fi">Jaettu kokoelma</span>
  <h1>${esc(collection.name)}</h1>
  <p class="lede" lang="fi">Kokoelman osaamismerkit ovat digitaalisesti allekirjoitettuja Open Badges 3.0 -todisteita. Avaa merkki nähdäksesi sen tiedot ja tarkastaaksesi sen aitouden.</p>
  <p><a href="/employer" lang="fi">Mitä osaamismerkit ovat ja miten ne tarkastetaan?</a></p>
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
