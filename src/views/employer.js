import { head, header, footer } from './layout.js'
import { OG_PAGES } from './og.js'

const EXTERNAL_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>'

// Long-form copy is authored as fi/en sibling blocks (same tag, side by
// side), which translate-element shows one at a time; only the short UI
// strings live in translations.json. The two blocks hold the same structure.
const COPY = {
  fi: {
    eyebrow: 'Työnantajalle',
    title: 'Rekrytoi osaamisen, ei pelkän tutkintonimikkeen perusteella',
    lede: 'Hakija lähetti sinulle linkin digitaalisiin osaamistodisteisiin. Tällä sivulla kerromme, mitä ne ovat, miten tarkastat ne ja miten ne voivat muuttaa tapaasi rekrytoida.',
    verify: 'Tarkasta todiste',
    contactAnchor: 'yhteys',
    contact: 'Ota yhteyttä',
    whatTitle: 'Mikä on digitaalinen osaamistodiste?',
    what: [
      'Osaamismerkki eli Open Badge kuvaa yhden suorituksen: tutkinnon, kurssin tai kokeen. Opintotodisteen merkit ovat Open Badges 3.0 -muotoisia, ja ne tehdään Koski-palvelun opintotiedoista, joihin oppilaitokset kirjaavat opiskelijoiden suoritukset.',
      'Opintotodiste hakee tiedot suoraan Koskesta, joten hakija ei voi muokata niitä. Jokainen merkki on sähköisesti allekirjoitettu: allekirjoituksesta näkee, kuka merkin myönsi ja ettei sitä ole muutettu jälkikäteen. Merkissä näkyy myös oppilaitos, joka suorituksen kirjasi.',
      'Merkki ei kuitenkaan osoita, että linkin lähettäjä on sama henkilö, jonka opinnoista on kyse: Opintotodiste ei tunnista henkilöä, joka tuo opintotietonsa palveluun. Varmista hakijan henkilöllisyys tarvittaessa muulla tavoin.',
    ],
    whyTitle: 'Taidot näkyviin tutkintojen takaa',
    why: [
      ['Näe koko osaaminen', 'Tutkintonimike kertoo vähän. Kurssit ja kokeet näyttävät, mitä hakija on oikeasti opiskellut ja missä hän on vahva.'],
      ['Arvioi taitoja, ei polkua', 'Kun osaaminen on todennettu suoritus kerrallaan, voit valita hakijan taitojen perusteella, vaikka tutkinto olisi vielä kesken.'],
      ['Luotettava ja nopea', 'Allekirjoitettu todiste kertoo myöntäjän ja pysyy muuttumattomana. Tarkastat sen hetkessä ilman yhteydenottoja oppilaitokseen.'],
    ],
    howTitle: 'Näin tarkastat todisteen',
    how: [
      'Avaa hakijan lähettämä linkki. Näet merkit ja niiden tiedot ilman kirjautumista.',
      'Valitse merkin kohdalta Tarkasta. Tarkastus tehdään selaimessasi, eikä merkkiä tarvitse ladata.',
      'Tarkastus näyttää, kuka merkin myönsi ja onko sitä muutettu. Jos sait merkin tiedostona, lisää se <a href="/verify">tarkastussivulle</a>.',
    ],
    ctaTitle: 'Haluatko vastaanottaa todisteita suoraan hakijoiden lompakoista?',
    cta: 'Hakijat voivat tallentaa merkkinsä myös digitaaliseen lompakkoon. Findynet auttaa löytämään työkalut, joilla voit pyytää ja tarkastaa digitaalisia todisteita osana rekrytointia.',
    findynet: 'Ota yhteyttä Findynetiin',
  },
  en: {
    eyebrow: 'For employer',
    title: 'Hire for skills, not just for a degree title',
    lede: 'An applicant has sent you a link to their digital credentials. This page explains what they are, how to check them, and how they can change the way you recruit.',
    verify: 'Verify a credential',
    contactAnchor: 'contact',
    contact: 'Contact us',
    whatTitle: 'What is a digital credential?',
    what: [
      'A badge, or Open Badge, describes one achievement: a degree, a course or an exam. Opintotodiste badges follow the Open Badges 3.0 standard and are made from the study records in Koski, the Finnish national register where schools record their students’ achievements.',
      'Opintotodiste fetches the records straight from Koski, so the applicant cannot edit them. Every badge is digitally signed: the signature shows who issued it and that it has not been changed since. The badge also names the school that recorded the achievement.',
      'A badge does not show, however, that whoever sent you the link is the person whose studies it describes: Opintotodiste does not identify the people who bring their study records into the service. Check the applicant\u2019s identity some other way if it matters.',
    ],
    whyTitle: 'See the skills behind the degree',
    why: [
      ['See everything they know', 'A degree title says little. Courses and exams show what the applicant actually studied and where they are strong.'],
      ['Judge skills, not paths', 'When skills are verified one achievement at a time, you can choose an applicant for what they can do, even if their degree is still in progress.'],
      ['Trustworthy and fast', 'A signed credential names its issuer and cannot be altered. You can check it in moments, without contacting the school.'],
    ],
    howTitle: 'How to check a credential',
    how: [
      'Open the link the applicant sent you. You can see the badges and their details without signing in.',
      'Choose Verify next to a badge. The check runs in your browser, and you don\u2019t need to download anything.',
      'The check shows who issued the badge and whether it has been changed. If you got a badge as a file, add it on the <a href="/verify">verification page</a>.',
    ],
    ctaTitle: 'Want to receive credentials straight from applicants’ wallets?',
    cta: 'Applicants can also keep their badges in a digital wallet. Findynet will help you find the tools to request and verify digital credentials as part of your recruitment.',
    findynet: 'Contact Findynet',
  },
}

const sibling = (tag, attrs, render) =>
  Object.entries(COPY)
    .map(([lang, copy]) => `<${tag} lang="${lang}"${attrs}>${render(copy)}</${tag}>`)
    .join('\n')

export function employerPage() {
  return `<!doctype html>
<html lang="fi">
<head>
${head('<title lang="fi">Työnantajalle – Opintotodiste</title>', ['employer'], { path: '/employer', ...OG_PAGES.employer })}
</head>
<body class="page-employer">
${header({ auth: false, current: 'employer' })}

<section class="employer-hero">
${sibling('div', ' class="employer-hero-body"', (c) => `
  <span class="eyebrow">${c.eyebrow}</span>
  <h1>${c.title}</h1>
  <p class="lede">${c.lede}</p>
  <p class="employer-actions">
    <a class="button primary" href="/verify">${c.verify}</a>
    <a class="button" href="#${c.contactAnchor}">${c.contact}</a>
  </p>`)}
</section>

<main class="employer">
${sibling('div', ' class="employer-body"', (c) => `
  <section class="employer-split">
    <h2>${c.whatTitle}</h2>
    <div class="employer-text">${c.what.map((p) => `<p>${p}</p>`).join('')}</div>
  </section>

  <section class="employer-why">
    <h2>${c.whyTitle}</h2>
    <ol class="employer-cards">${c.why
      .map(([title, body], i) => `
      <li><span class="employer-card-num" aria-hidden="true">${i + 1}</span><h3>${title}</h3><p>${body}</p></li>`)
      .join('')}
    </ol>
  </section>

  <section class="employer-split">
    <h2>${c.howTitle}</h2>
    <ol class="employer-steps">${c.how.map((step) => `<li>${step}</li>`).join('')}</ol>
  </section>

  <section class="employer-cta" id="${c.contactAnchor}">
    <div class="employer-cta-text">
      <h2>${c.ctaTitle}</h2>
      <p>${c.cta}</p>
    </div>
    <p class="employer-cta-links">
      <a class="button cyan" href="https://osaaja.todiste.fi/">osaaja.todiste.fi${EXTERNAL_ICON}</a>
      <a class="button on-navy" href="https://findynet.fi/yhteys/">${c.findynet}${EXTERNAL_ICON}</a>
    </p>
  </section>`)}
</main>
${footer()}
</body>
</html>`
}
