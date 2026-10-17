import { head, header, esc } from './layout.js'
import { OG_PAGES } from './og.js'
import { WALLETS, WALLET_GROUPS } from '../wallets.js'

// The three guide pages (/guide/studyinfo, /guide/wallet, /guide/sharing).
// Long text is written as fi/en sibling elements, which translate-element
// shows one at a time without translations.json entries. No screenshots on
// purpose (user, 2026-10-17): the text is clear and images would clutter it.

// <tag lang="fi">fi</tag><tag lang="en">en</tag>: a same-tag sibling pair. The
// sibling wins over a translations.json entry for the same text (e.g. the main
// page's step texts), so English is shown once.
const pair = (tag, attrs, fi, en) =>
  `<${tag}${attrs} lang="fi">${fi}</${tag}><${tag}${attrs} lang="en">${en}</${tag}>`

// One numbered step: a heading and its text (HTML).
const step = ({ title, body }) => `<li>
  <h2>${title}</h2>
  <p>${body}</p>
</li>`

const steps = (list) => `<ol class="guide-steps">
${list.map(step).join('\n')}
</ol>`

// A UI label the reader looks for on screen.
const ui = (label) => `<strong>${label}</strong>`

const STUDYINFO_STEPS = {
  fi: [
    { title: 'Avaa Oma Opintopolku', body: `Mene osoitteeseen <a href="https://opintopolku.fi/koski/omattiedot">opintopolku.fi/koski/omattiedot</a>.` },
    { title: 'Kirjaudu Suomi.fi-tunnistuksella', body: 'Tunnistaudu verkkopankkitunnuksilla, mobiilivarmenteella tai varmennekortilla. Näet sen jälkeen opintosi.' },
    { title: `Valitse ${ui('Jaa suoritustietoja')}`, body: 'Pääset sivulle, jolla luot ja hallitset jakolinkkejäsi.' },
    { title: `Valitse ${ui('Luo uusi')}`, body: 'Aloitat uuden jakolinkin luomisen.' },
    { title: 'Pidä kattavat tiedot valittuina', body: `Jätä valituksi ${ui('Kattavat tiedot valituista suorituksista')}. Muut vaihtoehdot sisältävät vain perustiedot opinnoistasi, eivät yksittäisiä kursseja.` },
    { title: 'Valitse jaettavat opinnot', body: `Valitse opinnot, joista haluat osaamismerkit, ja sitten ${ui('Jaa valitsemasi opinnot')}.` },
    { title: 'Kopioi linkki', body: `Valitse ${ui('Kopioi linkki')} luomasi jakolinkin kohdalla. Linkki alkaa <code>https://opintopolku.fi/koski/opinnot/</code>.` },
    { title: 'Liitä linkki Opintotodisteeseen', body: `Palaa <a href="/">etusivulle</a>, liitä linkki ${ui('Koski-jakolinkki')}-kenttään ja valitse ${ui('Hae opinnot')}.` },
  ],
  en: [
    { title: 'Open My Studyinfo', body: `Go to <a href="https://opintopolku.fi/koski/omattiedot">opintopolku.fi/koski/omattiedot</a>. You can switch the service to English at the top of the page.` },
    { title: 'Log in with Suomi.fi identification', body: 'Identify yourself with Finnish online banking codes, a mobile certificate or a certificate card. You will then see your studies.' },
    { title: `Select ${ui('Share study information')}`, body: 'This opens the page where you create and manage your share links.' },
    { title: `Choose ${ui('Create new')}`, body: 'This starts a new share link.' },
    { title: 'Keep the full details selected', body: `Leave ${ui('Full details of the studies you select')} selected. The other options include only basic information about your studies, not individual courses.` },
    { title: 'Select the studies to share', body: `Select the studies you want badges for, then choose ${ui("Share the studies you've selected")}.` },
    { title: 'Copy the link', body: `Click ${ui('Copy link')} next to the share link you created. The link starts with <code>https://opintopolku.fi/koski/opinnot/</code>.` },
    { title: 'Paste the link here', body: `Go back to the <a href="/">front page</a>, paste the link into the ${ui('Koski share link')} field and choose ${ui('Fetch credentials')}.` },
  ],
}

const WALLET_STEPS = {
  fi: [
    { title: 'Valitse merkit', body: `Hae opintosi <a href="/guide/studyinfo">Koski-jakolinkillä</a> ja rastita etusivun listasta merkit, jotka haluat lompakkoon.` },
    { title: `Valitse ${ui('Lisää lompakkoon')}`, body: 'Valinta on alareunan palkissa. Jokaiselle merkille näytetään oma QR-koodi ja vahvistuskoodi. Ne ovat voimassa vain hetken.' },
    { title: 'Skannaa QR-koodi', body: `Avaa lompakkosovellus ja skannaa koodi. Jos käytät Opintotodistetta samalla puhelimella, valitse koodin alta ${ui('Avaa lompakkosovelluksessa')}.` },
    { title: 'Syötä vahvistuskoodi', body: 'Lompakko kysyy vahvistuskoodia. Kirjoita Opintotodisteen näyttämä koodi ja hyväksy merkki.' },
  ],
  en: [
    { title: 'Select badges', body: `Fetch your studies with a <a href="/guide/studyinfo">Koski share link</a> and tick the badges you want in your wallet on the front page.` },
    { title: `Choose ${ui('Add to wallet')}`, body: 'You find it in the bar at the bottom. Each badge gets its own QR code and confirmation code. They are valid only for a short while.' },
    { title: 'Scan the QR code', body: `Open the wallet app and scan the code. If you are using this site on the same phone, choose ${ui('Open in wallet app')} below the code.` },
    { title: 'Enter the confirmation code', body: 'The wallet asks for a confirmation code. Type the code shown on this site and accept the badge.' },
  ],
}

const SHARING_STEPS = {
  fi: [
    { title: 'Kirjaudu pääsyavaimella', body: `Kokoelmat tallentuvat tiliisi. Valitse yläpalkista ${ui('Kirjaudu sisään')}. Jos sinulla ei vielä ole pääsyavainta, voit rekisteröidä sen samasta ikkunasta. Salasanaa ei tarvita: pääsyavain avataan samalla tavalla kuin puhelimesi tai tietokoneesi, esimerkiksi sormenjäljellä.` },
    { title: 'Lisää merkit kokoelmaan', body: `Rastita merkit etusivun listasta ja valitse alapalkista ${ui('Lisää kokoelmaan')}. Valitse kokoelma tai luo uusi. Nimeä se esimerkiksi haettavan työpaikan mukaan.` },
    { title: 'Avaa jakoikkuna', body: `Valitse <a href="/my/collections">Kokoelmani</a>-sivulla kokoelman kohdalta ${ui('Jaa')}. Ikkunassa on kokoelman linkki ja valmis viesti työnantajalle.` },
    { title: 'Lähetä linkki ja viesti', body: 'Kopioi viesti sähköpostiin tai työhakemukseen. Valitse viestin kieleksi suomi tai englanti sen mukaan, mitä työnantaja lukee.' },
  ],
  en: [
    { title: 'Sign in with a passkey', body: `Collections are saved to your account. Choose ${ui('Sign in')} in the top bar. If you don't have a passkey yet, you can register one in the same dialog. No password is needed: you unlock a passkey the same way you unlock your phone or computer, for example with your fingerprint.` },
    { title: 'Add badges to a collection', body: `Tick the badges on the front page and choose ${ui('Add to collection')} in the bottom bar. Pick a collection or create a new one. You could name it after the job you are applying for.` },
    { title: 'Open the share dialog', body: `On the <a href="/my/collections">My collections</a> page, choose ${ui('Share')} next to the collection. The dialog holds the collection's link and a ready-made message to the employer.` },
    { title: 'Send the link and the message', body: 'Copy the message into an email or a job application. Choose Finnish or English for the message, whichever the employer reads.' },
  ],
}

const STORE_LABELS = { appStore: 'App Store', googlePlay: 'Google Play' }

const ISSUES_URL = 'https://github.com/FindyFi/opintotodiste/issues'

const WALLET_DISCLAIMER = {
  fi: `Nämä lompakot on testattu toimiviksi Opintotodisteen kanssa. Jos lompakko ei saa todisteitasi tästä palvelusta, <a href="${ISSUES_URL}">kerro siitä GitHub-repositoriossamme</a>.`,
  en: `These wallets have been tested to work with Opintotodiste. If they fail to get your credentials from this service, <a href="${ISSUES_URL}">please file an issue in our GitHub repository</a>.`,
}

function walletCard(wallet) {
  const stores = Object.entries(STORE_LABELS)
    .filter(([key]) => wallet[key])
    .map(([key, label]) => `<a class="store-link" href="${esc(wallet[key])}" aria-label="${esc(`${wallet.name}: ${label}`)}">${label}</a>`)
    .join('')
  return `<li class="wallet-card">
  <h3>${esc(wallet.name)}</h3>
  ${stores ? `<p class="store-links">${stores}</p>` : ''}
</li>`
}

const walletSections = (lang) =>
  WALLET_GROUPS.filter((group) => !group.hidden).map(
    (group) => `<section class="wallet-group">
  <h2>${esc(group.title[lang])}</h2>
  <p>${WALLET_DISCLAIMER[lang]}</p>
  <ul class="wallet-cards">
${WALLETS.filter((w) => w.group === group.id).map(walletCard).join('\n')}
  </ul>
</section>`
  ).join('\n')

const GUIDES = {
  studyinfo: {
    title: { fi: 'Luo jakolinkki Oma Opintopolussa', en: 'Create a share link in My Studyinfo' },
    lede: {
      fi: 'Opintotodiste lukee opintotietosi Koski-palvelusta jakolinkin avulla. Linkin luominen Oma Opintopolussa vie pari minuuttia.',
      en: 'Opintotodiste reads your study records from the Koski service through a share link. Creating the link in My Studyinfo (Oma Opintopolku) takes a couple of minutes.',
    },
    body: {
      fi: `<div class="guide-columns">
${steps(STUDYINFO_STEPS.fi)}
<aside class="guide-note">
  <h2>Hyvä tietää</h2>
  <p>Jakolinkillä näkyvät vain ne opinnot, jotka valitsit. Kuka tahansa linkin saanut voi nähdä ne, joten älä julkaise linkkiä.</p>
  <p>Voit poistaa linkin Oma Opintopolussa milloin tahansa. Jo tallentamasi osaamismerkit säilyvät.</p>
</aside>
</div>`,
      en: `<div class="guide-columns">
${steps(STUDYINFO_STEPS.en)}
<aside class="guide-note">
  <h2>Good to know</h2>
  <p>The share link shows only the studies you selected. Anyone who gets the link can see them, so don't post it publicly.</p>
  <p>You can delete the link in My Studyinfo at any time. Badges you have already saved stay as they are.</p>
</aside>
</div>`,
    },
  },
  wallet: {
    title: { fi: 'Tallenna osaamismerkit lompakkoon', en: 'Save your badges in a wallet' },
    lede: {
      fi: 'Digitaalinen lompakko on puhelinsovellus, johon tallennat osaamismerkit ja josta voit näyttää ne muille. Asenna ensin jokin alla olevista lompakoista.',
      en: 'A digital wallet is a phone app where you keep your badges and from which you can show them to others. First install one of the wallets below.',
    },
    body: {
      fi: `${walletSections('fi')}
<section class="wallet-howto">
  <h2>Näin lisäät merkit lompakkoon</h2>
  ${steps(WALLET_STEPS.fi)}
  <p class="guide-note">Merkit kokoelmistasi voit lähettää lompakkoon myös <a href="/my/collections">Kokoelmani</a>-sivulta.</p>
  <p class="guide-note"><strong>Vaihdoitko puhelinta?</strong> Merkit eivät siirry varmuuskopion mukana, koska ne on sidottu vanhan puhelimesi lompakkoon. Lisää ne uudelleen Opintotodisteesta.</p>
</section>`,
      en: `${walletSections('en')}
<section class="wallet-howto">
  <h2>How to add badges to your wallet</h2>
  ${steps(WALLET_STEPS.en)}
  <p class="guide-note">You can also send badges from your collections to a wallet on the <a href="/my/collections">My collections</a> page.</p>
  <p class="guide-note"><strong>Got a new phone?</strong> Badges don't move with a backup, because they are tied to the wallet on your old phone. Add them again from this site.</p>
</section>`,
    },
  },
  sharing: {
    title: { fi: 'Jaa osaamisesi työnantajalle', en: 'Share your skills with an employer' },
    lede: {
      fi: 'Kokoa työnhakuun sopivat merkit kokoelmaksi ja lähetä siitä linkki. Moni työnantaja ei vielä tunne digitaalisia osaamistodisteita, joten kerro lyhyesti, mitä linkin takaa löytyy.',
      en: "Gather the badges that fit a job application into a collection and send its link. Many employers don't know digital credentials yet, so tell them briefly what the link shows.",
    },
    body: {
      fi: `<div class="guide-columns">
${steps(SHARING_STEPS.fi)}
<aside class="guide-asides">
  <div class="guide-note dark">
    <h2>Mitä kerron työnantajalle?</h2>
    <ul>
      <li>Linkki näyttää osaamismerkkisi, eikä sen avaaminen vaadi kirjautumista.</li>
      <li>Merkit perustuvat Koski-palvelun virallisiin opintotietoihin.</li>
      <li>Ne on allekirjoitettu sähköisesti, ja niiden aitouden voi tarkastaa muutamassa sekunnissa.</li>
      <li>Lisätietoa on <a href="/employer">Työnantajalle</a>-sivulla.</li>
    </ul>
    <p>Jakoikkunassa on valmis viesti, jonka voit kopioida.</p>
  </div>
  <div class="guide-note">
    <h2>Linkki pysyy hallinnassasi</h2>
    <p>Kun haku on ohi, valitse kokoelman kohdalta ${ui('Uusi jakolinkki')}. Vanha linkki lakkaa silloin toimimasta.</p>
  </div>
</aside>
</div>`,
      en: `<div class="guide-columns">
${steps(SHARING_STEPS.en)}
<aside class="guide-asides">
  <div class="guide-note dark">
    <h2>What do I tell the employer?</h2>
    <ul>
      <li>The link shows your badges, and opening it needs no login.</li>
      <li>The badges are based on official study records from the Koski service.</li>
      <li>They are signed electronically, and anyone can check that they are genuine in a few seconds.</li>
      <li>There is more on the <a href="/employer">For employer</a> page.</li>
    </ul>
    <p>The share dialog has a ready-made message you can copy.</p>
  </div>
  <div class="guide-note">
    <h2>You stay in control of the link</h2>
    <p>When the application is over, choose ${ui('New share link')} next to the collection. The old link then stops working.</p>
  </div>
</aside>
</div>`,
    },
  },
}

export const GUIDE_NAMES = Object.keys(GUIDES)

// Links to all three guides, with the current one marked.
function guideNav(current) {
  return `<nav class="guide-nav">
  <ol>
${GUIDE_NAMES.map((name, i) => {
  const { title } = GUIDES[name]
  const attrs = name === current ? ' aria-current="page"' : ''
  return `    <li><a href="/guide/${name}"${attrs}><span class="step-num">${i + 1}</span>${pair('span', '', esc(title.fi), esc(title.en))}</a></li>`
}).join('\n')}
  </ol>
</nav>`
}

export function guidePage(name) {
  const guide = GUIDES[name]
  const n = GUIDE_NAMES.indexOf(name) + 1
  return `<!doctype html>
<html lang="fi">
<head>
${head(`<title lang="fi">${esc(guide.title.fi)} – Opintotodiste</title>`, ['guide'], { path: `/guide/${name}`, title: { fi: `${guide.title.fi} – Opintotodiste`, en: `${guide.title.en} – Study credential` }, description: OG_PAGES[name].description })}
</head>
<body class="page-guide">
${header()}

<section class="guide-hero">
  <span class="guide-num" aria-hidden="true">${n}</span>
  <div class="guide-intro">
    <p class="crumbs"><a href="/">${pair('span', '', 'Etusivu', 'Home')}</a> / ${pair('span', '', `Ohje ${n}/3`, `Guide ${n}/3`)}</p>
    ${pair('h1', '', esc(guide.title.fi), esc(guide.title.en))}
    ${pair('p', ' class="lede"', esc(guide.lede.fi), esc(guide.lede.en))}
  </div>
</section>

<main class="guide">
${pair('article', '', guide.body.fi, guide.body.en)}
${guideNav(name)}
</main>

<script src="/vendor/simplewebauthn-browser/index.umd.min.js" defer></script>
<script src="/auth.js" defer></script>
</body>
</html>`
}
