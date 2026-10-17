import { head, header, esc, embedJson, BADGE_ICON, SHARE_ICON, SHIELD_ICON } from './layout.js'

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
          <a class="credential-name" href="/c/${esc(token)}/items/${esc(item.id)}" data-item-id="${esc(item.id)}">${esc(achievement.name)}</a>
          <span class="credential-meta">${meta.map(esc).join(' · ')}</span>
        </div>
        <div class="credential-status"><a class="button" href="/verify?url=${esc(encodeURIComponent(`/c/${token}/items/${item.id}/download`))}" lang="fi">Tarkasta</a> <a href="/c/${esc(token)}/items/${esc(item.id)}/download" lang="fi">Lataa</a></div>
      </li>`
    })
    .join('')

  return `<!doctype html>
<html lang="fi">
<head>
${head(`<title>${esc(collection.name)} – Opintotodiste</title>`, ['credentials', 'recipient'])}
</head>
<body class="page-recipient">
<div class="recipient-band">
${header({ auth: false })}

<section class="recipient-hero">
  <div class="recipient-hero-text">
    <span class="recipient-pill">${SHARE_ICON}<span lang="fi">Jaettu kokoelma</span></span>
    <h1>${esc(collection.name)}</h1>
    <p class="lede" lang="fi">Kokoelman osaamismerkit ovat digitaalisesti allekirjoitettuja Open Badges 3.0 -todisteita. Avaa merkki nähdäksesi sen tiedot ja tarkastaaksesi sen aitouden.</p>
  </div>
  <div class="recipient-card">
    <h2>${SHIELD_ICON}<span lang="fi">Tarkasta aitous itse</span></h2>
    <p lang="fi">Valitse merkin kohdalta Tarkasta. Tarkastus tehdään selaimessasi, eikä kirjautumista tarvita.</p>
    <a href="/employer" lang="fi">Mitä osaamismerkit ovat ja miten ne tarkastetaan?</a>
  </div>
</section>
</div>

<main class="recipient-main">
  <div class="recipient-sheet">
    <div class="recipient-list-head"><h2 lang="fi">Osaamismerkit</h2></div>
${
  items.length
    ? `<ul class="credential-list">${rows}</ul>`
    : `<p class="empty" lang="fi">Kokoelmassa ei ole vielä kohteita.</p>`
}
  </div>
</main>

<dialog id="detailDialog">
  <div id="detailDialogContent"></div>
  <form method="dialog"><button type="submit" lang="fi">Sulje</button></form>
</dialog>

<script>window.__ITEMS__ = ${embedJson(items.map((item) => ({ id: item.id, credential: item.credential })))}</script>
<script src="/detail.js" defer></script>
<script src="/shared-collection.js" defer></script>
</body>
</html>`
}
