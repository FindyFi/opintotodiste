import { head, header, footer } from './layout.js'

// /policy: what the service stores, for how long, who sees shared links and
// how to delete one's data. Published as `policy_uri` in oid4vci-issuer's
// OpenID Federation metadata. Long text as fi/en sibling articles, like the
// guide pages.
//
// The text was drafted from the code (src/schema.sql, index.js, the session
// store's defaults, oid4vci-issuer's in-memory offer store) and has not been
// reviewed yet. `draft()` marks every statement the code alone can't confirm;
// drop the marks as the statements are confirmed, and the banner with the last.

const DRAFT_TAG = 'LUONNOS / DRAFT'

// An unconfirmed statement, visibly marked.
const draft = (html) => `<mark class="draft"><span class="draft-tag">${DRAFT_TAG}</span> ${html}</mark>`

const ui = (label) => `<strong>${label}</strong>`

const CONTACT = '<a href="mailto:info@findy.fi">info@findy.fi</a>'

const COPY = {
  fi: {
    title: 'Tietosuoja ja tietojesi säilytys',
    lede: 'Mitä tietoja Opintotodiste tallentaa, kuinka kauan se säilyttää niitä, kuka näkee jakamasi linkit ja miten poistat tietosi.',
    banner: 'Tämä sivu on luonnos, jota ei ole vielä tarkastettu. Merkityt kohdat odottavat vahvistusta.',
    sections: [
      {
        title: 'Kuka palvelua ylläpitää',
        body: `<p>Opintotodistetta ylläpitää Findynet. Tietosuojaa koskevat kysymykset ja pyynnöt voit lähettää osoitteeseen ${CONTACT}.</p>
<p>${draft('Findynetin virallinen nimi ja Y-tunnus lisätään tähän.')}</p>`,
      },
      {
        title: 'Lyhyesti',
        body: `<ul>
<li>Jos et kirjaudu sisään, tietosi ovat palvelimella vain istunnon ajan ja poistuvat viimeistään 24 tunnin kuluttua viimeisestä käynnistäsi.</li>
<li>Pysyvästi säilytetään vain se, minkä itse tallennat: pääsyavaintilisi ja kokoelmasi. Ne säilyvät, kunnes poistat ne.</li>
<li>Palvelu ei kysy sähköpostiosoitetta eikä salasanaa.</li>
<li>Palvelussa ei ole analytiikkaa, mainoksia eikä seurantaevästeitä.</li>
</ul>`,
      },
      {
        title: 'Kun haet opintosi',
        body: `<p>Kun liität Koski-jakolinkin ja valitset ${ui('Hae opinnot')}, palvelin hakee jakolinkin tiedot Koski-palvelusta (opintopolku.fi). Niissä ovat nimesi, oppijanumerosi ja jakamasi opinnot: oppilaitokset, suoritukset, arvosanat, laajuudet ja päivämäärät. ${draft('Jakolinkin tiedoissa ei ole henkilötunnusta.')}</p>
<p>Palvelin tallentaa istuntoosi jakolinkin, Koskesta saadut tiedot, niistä tehdyt osaamismerkit ja valitsemasi kielen. Istunto on palvelun tietokannassa, ja selaimesi tunnistetaan siihen evästeellä, joka on palvelun ainoa eväste.</p>
<p>Istunnon tiedot poistetaan 24 tunnin kuluttua viimeisestä sivunlatauksestasi tai heti, kun kirjaudut ulos. Eväste poistuu yleensä, kun suljet selaimen, mutta palvelimella olevat tiedot säilyvät silti 24 tuntia.</p>`,
      },
      {
        title: 'Pääsyavaintili',
        body: `<p>Kokoelmia varten luot tilin pääsyavaimella. Tilistä tallennetaan antamasi nimi ja satunnainen tunniste. Jokaisesta pääsyavaimesta tallennetaan sen tunniste, julkinen avain ja käyttölaskuri, tieto siitä, onko avain synkronoitu tai varmuuskopioitu, avaimen yhteystavat (esimerkiksi USB tai laitteen sisäinen) sekä luonti- ja viimeinen käyttöaika. Yksityinen avain pysyy laitteellasi, eikä palvelu näe sormenjälkeäsi tai laitteesi PIN-koodia.</p>
<p>Tili säilyy, kunnes se poistetaan. ${draft('Tiliä ei vielä voi poistaa itse palvelussa. Voit pyytää poistoa osoitteesta ' + CONTACT + '.')}</p>`,
      },
      {
        title: 'Kokoelmat ja jakolinkit',
        body: `<p>Kun lisäät osaamismerkin kokoelmaan, siitä tallennetaan allekirjoitettu kopio. Merkissä on suorituksen tiedot (nimi, kuvaus, arvosana, laajuus, oppilaitos ja päivämäärä) ja tunnisteena Koski-oppijanumerosi, mutta ei nimeäsi. Kokoelmasta tallennetaan lisäksi sen nimi, jakolinkki sekä luonti- ja muutosaika.</p>
<p>Kokoelma ja sen merkit säilyvät, kunnes poistat kokoelman. Yksittäistä merkkiä ei vielä voi poistaa kokoelmasta.</p>
<p>Jakolinkki on pitkä ja satunnainen, joten sitä ei voi arvata. Kuka tahansa linkin saanut voi kuitenkin avata sen kirjautumatta, nähdä kokoelman nimen ja merkit, ladata merkit tiedostoina ja tarkastaa ne. Jaa linkki vain niille, joille tarkoitat sen. ${draft('Jakosivuja ei ole erikseen kielletty hakukoneilta, joten julkisesti julkaistu linkki voi päätyä hakutuloksiin.')}</p>
<p>Kun valitset kokoelman kohdalta ${ui('Uusi jakolinkki')} tai poistat kokoelman, vanha linkki lakkaa toimimasta heti. Kopioita, jotka joku on jo ladannut, palvelu ei voi poistaa.</p>`,
      },
      {
        title: 'Allekirjoitus ja lompakkoon lisääminen',
        body: `<p>Kun lataat merkin tai lisäät sen kokoelmaan, palvelin lähettää merkin allekirjoituspalveluun, joka allekirjoittaa sen sähköisesti. ${draft('Allekirjoituspalvelu ei tallenna merkkejä.')}</p>
<p>Kun lisäät merkin lompakkoon, palvelin lähettää merkin tiedot lompakkopalveluun, joka luo QR-koodin ja vahvistuskoodin. Lompakkopalvelu pitää merkkiä muistissa vain sen ajan, että lompakkosi ehtii hakea sen: enintään 10 minuuttia ja haun jälkeen vielä minuutin. Se ei tallenna merkkiä tietokantaan tai levylle. Kuka tahansa, jolla on sekä QR-koodi että vahvistuskoodi, voi hakea merkin sinä aikana, joten älä näytä niitä muille.</p>
<p>Lompakkoon tallennettu merkki on sinun laitteellasi, ja siihen sovelletaan lompakkosovelluksen ehtoja. ${draft('Allekirjoitus- ja lompakkopalvelua ylläpitää Findynet.')}</p>`,
      },
      {
        title: 'Selaimeesi tallentuvat tiedot',
        body: `<p>Valitsemasi kieli tallennetaan selaimesi paikalliseen tallennustilaan, jotta se säilyy sivulta toiselle. Se säilyy, kunnes tyhjennät selaimen sivustotiedot.</p>
<p>Todisteen tarkastus tehdään selaimessasi, eikä tarkastettavaa todistetta lähetetä palvelimelle. LinkedIn-painikkeet avaavat LinkedInin vain, jos valitset ne, ja silloin LinkedIn saa jakamasi linkin.</p>`,
      },
      {
        title: 'Palvelimet ja lokit',
        body: `<p>${draft('Palvelu toimii Amazon Web Services -pilvessä EU:n alueella.')}</p>
<p>${draft('Palvelimet kirjaavat lokeihin virheilmoituksia sekä lompakkopalvelun pyyntöjen osoitteet, tilakoodit ja selaimen tunnisteen, mutta eivät merkkien sisältöä. Lokien säilytysaika lisätään tähän.')}</p>
<p>${draft('Tietokannan varmuuskopioiden säilytysaika lisätään tähän. Poistetut tiedot voivat säilyä varmuuskopioissa sen ajan.')}</p>`,
      },
      {
        title: 'Näin poistat tietosi',
        body: `<ul>
<li><strong>Istunto:</strong> valitse ${ui('Kirjaudu ulos')}, niin istunnon tiedot poistetaan heti. Muuten ne poistuvat 24 tunnin kuluttua viimeisestä käynnistäsi.</li>
<li><strong>Kokoelma:</strong> valitse <a href="/my/collections">Kokoelmani</a>-sivulla kokoelman kohdalta ${ui('Poista')}. Kokoelma, sen merkit ja jakolinkki poistetaan heti.</li>
<li><strong>Tili ja pääsyavaimet:</strong> ${draft('lähetä poistopyyntö osoitteeseen ' + CONTACT + '.')} Pääsyavain jää lisäksi laitteellesi; poista se laitteen tai salasanojen hallinnan asetuksista.</li>
<li><strong>Koski-jakolinkki:</strong> poista se Oma Opintopolussa. Se ei poista Opintotodisteeseen jo tallentamiasi merkkejä.</li>
<li><strong>Lompakossa olevat merkit:</strong> poista ne lompakkosovelluksessa.</li>
</ul>`,
      },
      {
        title: 'Oikeutesi',
        body: `<p>${draft('Tähän lisätään käsittelyn oikeusperuste ja tietosuojalainsäädännön mukaiset oikeutesi sekä se, miten käytät niitä.')} Kysymykset voit lähettää osoitteeseen ${CONTACT}.</p>`,
      },
    ],
  },
  en: {
    title: 'Privacy and how long we keep your data',
    lede: 'What Opintotodiste stores, how long it keeps it, who can see the links you share and how to delete your data.',
    banner: 'This page is a draft that has not been reviewed yet. The marked statements are awaiting confirmation.',
    sections: [
      {
        title: 'Who runs the service',
        body: `<p>Opintotodiste is run by Findynet. Send questions and requests about your data to ${CONTACT}.</p>
<p>${draft('Findynet’s official name and business ID will be added here.')}</p>`,
      },
      {
        title: 'In short',
        body: `<ul>
<li>If you don’t sign in, your data stays on the server only for your session and is deleted at most 24 hours after your last visit.</li>
<li>Only what you save yourself is kept: your passkey account and your collections. They are kept until you delete them.</li>
<li>The service doesn’t ask for an email address or a password.</li>
<li>There is no analytics, advertising or tracking cookies.</li>
</ul>`,
      },
      {
        title: 'When you fetch your studies',
        body: `<p>When you paste a Koski share link and choose ${ui('Fetch credentials')}, the server fetches the link’s data from the Koski service (opintopolku.fi). It holds your name, your learner number (oppijanumero) and the studies you shared: schools, achievements, grades, credits and dates. ${draft('The share link’s data does not include your personal identity code (henkilötunnus).')}</p>
<p>The server keeps the share link, the data from Koski, the badges made from it and your chosen language in your session. The session is stored in the service’s database, and a cookie connects your browser to it. It is the only cookie the service sets.</p>
<p>The session data is deleted 24 hours after your last page load, or as soon as you sign out. The cookie usually goes away when you close the browser, but the data on the server is still kept for those 24 hours.</p>`,
      },
      {
        title: 'Passkey account',
        body: `<p>To use collections you create an account with a passkey. For the account we store the name you give and a random identifier. For each passkey we store its identifier, public key and signature counter, whether it is synced or backed up, how it connects (for example USB or built into the device), and when it was created and last used. The private key stays on your device, and the service never sees your fingerprint or your device PIN.</p>
<p>The account is kept until it is deleted. ${draft('You can’t delete the account yourself in the service yet. You can ask for it to be deleted at ' + CONTACT + '.')}</p>`,
      },
      {
        title: 'Collections and share links',
        body: `<p>When you add a badge to a collection, a signed copy of it is stored. The badge holds the achievement’s details (name, description, grade, credits, school and date) and, as an identifier, your Koski learner number, but not your name. For the collection we also store its name, its share link and when it was created and last changed.</p>
<p>A collection and its badges are kept until you delete the collection. You can’t remove a single badge from a collection yet.</p>
<p>The share link is long and random, so it can’t be guessed. But anyone who gets the link can open it without signing in, see the collection’s name and badges, download the badges as files and verify them. Share the link only with the people you mean it for. ${draft('Share pages are not specifically excluded from search engines, so a link posted publicly may show up in search results.')}</p>
<p>When you choose ${ui('New share link')} next to the collection, or delete the collection, the old link stops working at once. The service can’t delete copies that someone has already downloaded.</p>`,
      },
      {
        title: 'Signing and adding to a wallet',
        body: `<p>When you download a badge or add it to a collection, the server sends it to a signing service, which signs it electronically. ${draft('The signing service does not store badges.')}</p>
<p>When you add a badge to a wallet, the server sends the badge to a wallet service, which creates the QR code and the confirmation code. The wallet service keeps the badge in memory only until your wallet can fetch it: at most 10 minutes, plus one minute after the fetch. It doesn’t write the badge to a database or to disk. Anyone who has both the QR code and the confirmation code can fetch the badge during that time, so don’t show them to others.</p>
<p>A badge saved in your wallet is on your device, and the wallet app’s own terms apply to it. ${draft('The signing service and the wallet service are run by Findynet.')}</p>`,
      },
      {
        title: 'Data kept in your browser',
        body: `<p>Your chosen language is saved in your browser’s local storage so that it stays the same from page to page. It stays until you clear the browser’s site data.</p>
<p>Credential verification runs in your browser, and the credential you check is not sent to the server. The LinkedIn buttons open LinkedIn only if you choose them, and LinkedIn then gets the link you share.</p>`,
      },
      {
        title: 'Servers and logs',
        body: `<p>${draft('The service runs on Amazon Web Services in the EU.')}</p>
<p>${draft('The servers log error messages and, for the wallet service, request paths, status codes and the browser’s user agent, but not the content of badges. How long logs are kept will be added here.')}</p>
<p>${draft('How long database backups are kept will be added here. Deleted data may remain in backups for that time.')}</p>`,
      },
      {
        title: 'How to delete your data',
        body: `<ul>
<li><strong>Session:</strong> choose ${ui('Sign out')} and the session data is deleted at once. Otherwise it is deleted 24 hours after your last visit.</li>
<li><strong>Collection:</strong> on the <a href="/my/collections">My collections</a> page, choose ${ui('Delete')} next to the collection. The collection, its badges and its share link are deleted at once.</li>
<li><strong>Account and passkeys:</strong> ${draft('send a deletion request to ' + CONTACT + '.')} The passkey also stays on your device; remove it in your device’s or password manager’s settings.</li>
<li><strong>Koski share link:</strong> delete it in My Studyinfo. This doesn’t delete badges you have already saved in Opintotodiste.</li>
<li><strong>Badges in a wallet:</strong> delete them in the wallet app.</li>
</ul>`,
      },
      {
        title: 'Your rights',
        body: `<p>${draft('The legal basis for processing and your rights under data protection law, and how to exercise them, will be added here.')} Send questions to ${CONTACT}.</p>`,
      },
    ],
  },
}

// The same markup for each language, as a same-tag sibling pair.
const sibling = (tag, attrs, render) =>
  `<${tag}${attrs} lang="fi">${render(COPY.fi)}</${tag}><${tag}${attrs} lang="en">${render(COPY.en)}</${tag}>`

export function policyPage() {
  return `<!doctype html>
<html lang="fi">
<head>
${head(`<title lang="fi">${COPY.fi.title} – Opintotodiste</title>`, ['policy'])}
</head>
<body class="page-policy">
${header({ auth: false })}

<section class="policy-hero">
${sibling('div', ' class="policy-intro"', (c) => `
  <h1>${c.title}</h1>
  <p class="lede">${c.lede}</p>
  <p class="draft-banner" role="note"><span class="draft-tag">${DRAFT_TAG}</span> ${c.banner}</p>`)}
</section>

<main class="policy">
${sibling('article', '', (c) => c.sections.map(({ title, body }) => `
  <section>
    <h2>${title}</h2>
    ${body}
  </section>`).join(''))}
</main>
${footer({ current: 'policy' })}
</body>
</html>`
}
