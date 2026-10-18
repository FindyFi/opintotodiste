import { head, header, footer } from './layout.js'

// /policy: the privacy notice (tietosuojaseloste) and the terms of use.
// Published as `policy_uri` in oid4vci-issuer's OpenID Federation metadata.
// Long text as fi/en sibling articles, like the guide pages.
//
// The privacy notice covers what GDPR articles 13 and 14 require, in the
// order of the annex to the transparency guidelines published on
// tietosuoja.fi (Läpinäkyvyys, WP260), with the most important facts first
// ("Lyhyesti"), as those guidelines recommend.
//
// Facts come from the code (src/schema.sql, index.js, the session store's
// defaults, oid4vci-issuer's in-memory offers) and from aws-environment (log
// retention, region). `draft()` marks what still waits for a decision; drop
// the marks as they are settled, and the banner with the last.

const DRAFT_TAG = 'LUONNOS / DRAFT'

// An unsettled statement, visibly marked.
const draft = (html) => `<mark class="draft"><span class="draft-tag">${DRAFT_TAG}</span> ${html}</mark>`

const ui = (label) => `<strong>${label}</strong>`

const CONTACT = '<a href="mailto:info@findy.fi">info@findy.fi</a>'

const COPY = {
  fi: {
    title: 'Tietosuojaseloste ja käyttöehdot',
    lede: 'Mitä tietoja Opintotodiste käsittelee, mihin ja kuinka kauan, kuka näkee jakamasi linkit, miten poistat tietosi ja millä ehdoilla palvelua käytetään.',
    updated: `${draft('Päivitetty 18.10.2026.')}`,
    banner: 'Tämä sivu on luonnos, jota ei ole vielä tarkastettu. Merkityt kohdat odottavat vahvistusta.',
    sections: [
      {
        title: 'Lyhyesti',
        body: `<ul>
<li>Opintotodisteen rekisterinpitäjä on Findynet Osuuskunta. Yhteystiedot ovat alla.</li>
<li>Palvelu tekee Koski-palvelun opintotiedoistasi osaamismerkkejä, jotka voit ladata, tallentaa lompakkoon tai jakaa linkillä.</li>
<li>Jos et kirjaudu sisään, tietosi poistetaan palvelimelta viimeistään 24 tunnin kuluttua viimeisestä käynnistäsi.</li>
<li>Pääsyavaintilisi ja kokoelmasi säilyvät, kunnes poistat ne.</li>
<li><strong>Huomaa:</strong> kuka tahansa jakolinkin saanut näkee kokoelman merkit kirjautumatta.</li>
<li>Voit tarkastaa ja poistaa tietosi. Katso <a href="#oikeudet">Oikeutesi</a>.</li>
<li>Palvelussa ei ole analytiikkaa, mainoksia eikä seurantaevästeitä.</li>
</ul>`,
      },
      {
        title: 'Rekisterinpitäjä',
        body: `<p>Findynet Osuuskunta (Y-tunnus 3213523-3)<br>Sähköposti: ${CONTACT}</p>
<p>Findynet ylläpitää koko palvelua, myös osaamismerkkien allekirjoituspalvelua ja lompakkopalvelua, jotka mainitaan alla.</p>
<p>${draft('Postiosoite lisätään tähän. Tietosuojavastaavan yhteystiedot lisätään, jos sellainen on nimetty.')}</p>`,
      },
      {
        title: 'Mihin tietojasi käytetään',
        body: `<ul>
<li>Osaamismerkkien tekeminen Koski-tiedoistasi ja niiden näyttäminen sinulle.</li>
<li>Merkkien allekirjoittaminen, jotta niiden aitouden voi tarkastaa.</li>
<li>Merkkien toimittaminen lompakkosovellukseesi, kun pyydät sitä.</li>
<li>Kirjautuminen pääsyavaimella sekä kokoelmien tallentaminen ja jakaminen.</li>
<li>Palvelun ylläpito ja vikojen selvittäminen (lokit).</li>
</ul>
<p>${draft('Oikeusperuste, ehdotus: käsittely on tarpeen palvelun tarjoamiseksi, kun käytät sitä (sopimus, tietosuoja-asetuksen 6 artiklan 1 kohdan b alakohta). Lokien osalta peruste on rekisterinpitäjän oikeutettu etu pitää palvelu toimivana ja turvallisena (f alakohta).')}</p>`,
      },
      {
        title: 'Mitä tietoja käsitellään ja mistä ne saadaan',
        body: `<p><strong>Koski-palvelusta</strong> (Opetushallituksen ylläpitämä, opintopolku.fi) jakolinkillä, jonka itse annat: nimesi, oppijanumerosi ja jakamasi opinnot, eli oppilaitokset, suoritukset, arvosanat, laajuudet ja päivämäärät. Jos Koski lähettää sinusta muita tietoja, esimerkiksi henkilötunnuksen tai syntymäajan, ne poistetaan heti eikä niitä tallenneta. Palvelu vain hakee tietoja Koskesta, eikä lähetä sinne mitään.</p>
<p><strong>Sinulta:</strong> tilin nimi, jonka annat pääsyavainta luodessasi, pääsyavaimen julkiset tiedot ja kokoelmien nimet.</p>
<p><strong>Palvelun käytöstä:</strong> osaamismerkit, joissa on suorituksen tiedot ja tunnisteena oppijanumerosi, kokoelmien jakolinkit, aikaleimat ja lokit.</p>`,
      },
      {
        title: 'Kuinka kauan tietoja säilytetään',
        body: `<ul>
<li><strong>Istunto</strong> (jakolinkki, Koskesta saadut tiedot, niistä tehdyt merkit ja kielivalinta): 24 tuntia viimeisestä sivunlatauksestasi, tai kunnes kirjaudut ulos. Istunto on palvelun tietokannassa, ja selaimesi tunnistetaan siihen evästeellä. Eväste poistuu yleensä, kun suljet selaimen, mutta palvelimella olevat tiedot säilyvät silti 24 tuntia.</li>
<li><strong>Tili ja pääsyavaimet</strong> (nimi, satunnainen tunniste ja jokaisesta avaimesta tunniste, julkinen avain, käyttölaskuri, tieto synkronoinnista ja varmuuskopioinnista, yhteystavat sekä luonti- ja viimeinen käyttöaika): kunnes tili poistetaan. Käyttämättömiä tilejä ei poisteta automaattisesti. Yksityinen avain pysyy laitteellasi, eikä palvelu näe sormenjälkeäsi tai laitteesi PIN-koodia.</li>
<li><strong>Kokoelmat</strong> (nimi, jakolinkki, luonti- ja muutosaika sekä allekirjoitettu kopio jokaisesta merkistä): kunnes poistat kokoelman tai tilisi.</li>
<li><strong>Lompakkoon lähetetty merkki:</strong> lompakkopalvelun muistissa vain sen ajan, että lompakkosi ehtii hakea sen: enintään 10 minuuttia ja haun jälkeen vielä minuutin. Merkkiä ei tallenneta tietokantaan tai levylle.</li>
<li><strong>Allekirjoitettavat merkit:</strong> allekirjoituspalvelu ei tallenna niitä.</li>
<li><strong>Lokit:</strong> 30 päivää. Sovellus kirjaa virheilmoituksia. Lompakkopalvelu kirjaa pyyntöjen osoitteet, tilakoodit ja selaimen tunnisteen, mutta ei merkkien sisältöä.</li>
<li><strong>Varmuuskopiot:</strong> ${draft('tietokannan varmuuskopioiden säilytysaika lisätään tähän. Poistetut tiedot voivat säilyä varmuuskopioissa sen ajan.')}</li>
</ul>`,
      },
      {
        title: 'Kuka tietojasi käsittelee ja kenelle niitä luovutetaan',
        body: `<ul>
<li><strong>Palvelin:</strong> palvelu toimii Amazon Web Servicesin Tukholman alueella (Ruotsi). ${draft('Amazon Web Services toimii henkilötietojen käsittelijänä; sopimusosapuolen nimi lisätään tähän.')}</li>
<li><strong>Jakolinkin saajat:</strong> ne, joille lähetät kokoelman linkin, ja kaikki, joille he sen välittävät.</li>
<li><strong>Lompakkosovellus:</strong> kun lisäät merkin lompakkoon, se siirtyy valitsemaasi sovellukseen laitteellesi, ja siihen sovelletaan sovelluksen omia ehtoja.</li>
<li><strong>LinkedIn:</strong> vain, jos valitset jakoikkunassa LinkedIn-painikkeen. LinkedIn saa silloin jakamasi linkin.</li>
</ul>
<p>${draft('Tietoja ei luovuteta muille eikä käytetä markkinointiin.')}</p>`,
      },
      {
        title: 'Siirrot EU:n ulkopuolelle',
        body: `<p>${draft('Tietoja säilytetään EU:ssa, eikä niitä siirretä EU:n tai Euroopan talousalueen ulkopuolelle.')}</p>`,
      },
      {
        title: 'Evästeet ja selaimen tallennustila',
        body: `<p>Palvelu käyttää yhtä evästettä, joka yhdistää selaimesi istuntoon. Valitsemasi kieli tallennetaan selaimesi paikalliseen tallennustilaan, jotta se säilyy sivulta toiselle; se säilyy, kunnes tyhjennät selaimen sivustotiedot.</p>
<p>Todisteen tarkastus tehdään selaimessasi, eikä tarkastettavaa todistetta lähetetä palvelimelle.</p>`,
      },
      {
        title: 'Automaattinen päätöksenteko',
        body: '<p>Palvelu ei tee sinusta automaattisia päätöksiä eikä profiloi sinua. Osaamismerkit muodostetaan Koski-tiedoista sellaisinaan.</p>',
      },
      {
        title: 'Onko tietojen antaminen pakollista?',
        body: '<p>Ei ole. Ilman Koski-jakolinkkiä palvelu ei kuitenkaan voi tehdä osaamismerkkejä, ja ilman pääsyavainta et voi tallentaa kokoelmia.</p>',
      },
      {
        id: 'oikeudet',
        title: 'Oikeutesi',
        body: `<p>Voit käyttää alla olevia oikeuksiasi lähettämällä pyynnön osoitteeseen ${CONTACT}.</p>
<ul>
<li><strong>Tarkastaa tietosi:</strong> tallentamasi kokoelmat ja merkit näet <a href="/my/collections">Kokoelmani</a>-sivulla. Muista tiedoista voit pyytää kopion.</li>
<li><strong>Korjata tietosi:</strong> merkkien tiedot tulevat Koskesta, joten virheen korjaa oppilaitoksesi Koskessa. Sen jälkeen voit tehdä merkit uudelleen. Tilin nimeä ei vielä voi muuttaa palvelussa; voit pyytää korjausta.</li>
<li><strong>Poistaa tietosi:</strong> katso <a href="#poisto">Näin poistat tietosi</a>.</li>
<li><strong>Siirtää tietosi:</strong> voit ladata merkit tiedostoina (JSON) ja viedä ne muualle.</li>
<li><strong>Rajoittaa käsittelyä ja vastustaa sitä:</strong> ${draft('näiden oikeuksien kuvaus täsmennetään, kun oikeusperuste on vahvistettu.')}</li>
<li><strong>Tehdä valitus:</strong> jos katsot, että tietojasi käsitellään lainvastaisesti, voit tehdä valituksen tietosuojavaltuutetun toimistolle (<a href="https://tietosuoja.fi">tietosuoja.fi</a>).</li>
</ul>`,
      },
      {
        id: 'poisto',
        title: 'Näin poistat tietosi',
        body: `<ul>
<li><strong>Istunto:</strong> valitse ${ui('Kirjaudu ulos')}, niin istunnon tiedot poistetaan heti. Muuten ne poistuvat 24 tunnin kuluttua viimeisestä käynnistäsi.</li>
<li><strong>Kokoelma:</strong> valitse <a href="/my/collections">Kokoelmani</a>-sivulla kokoelman kohdalta ${ui('Poista')}. Kokoelma, sen merkit ja jakolinkki poistetaan heti. Yksittäistä merkkiä ei vielä voi poistaa kokoelmasta.</li>
<li><strong>Jakolinkki:</strong> valitse kokoelman kohdalta ${ui('Uusi jakolinkki')}, niin vanha linkki lakkaa toimimasta heti. Jakosivut on kielletty hakukoneilta. Kopioita, jotka joku on jo ladannut, palvelu ei voi poistaa.</li>
<li><strong>Tili ja pääsyavaimet:</strong> ${draft('tilin poistaminen palvelussa on tulossa. Siihen asti lähetä poistopyyntö osoitteeseen ' + CONTACT + '.')} Tilin mukana poistuvat myös sen kokoelmat. Pääsyavain jää lisäksi laitteellesi; poista se laitteen tai salasanojen hallinnan asetuksista.</li>
<li><strong>Koski-jakolinkki:</strong> poista se Oma Opintopolussa. Se ei poista Opintotodisteeseen jo tallentamiasi merkkejä.</li>
<li><strong>Lompakossa olevat merkit:</strong> poista ne lompakkosovelluksessa.</li>
</ul>`,
      },
      {
        id: 'kayttoehdot',
        title: 'Käyttöehdot',
        body: `<p>Opintotodiste tekee Koski-palvelun opintotiedoistasi Open Badges 3.0 -muotoisia osaamismerkkejä ja allekirjoittaa ne sähköisesti. Voit ladata merkit, tallentaa ne digitaaliseen lompakkoon ja jakaa niitä kokoelmina linkillä.</p>
<ul>
<li>${draft('Maksullisuus: kirjoitetaan tähän.')}</li>
<li>${draft('Käyttäjän vastuu, esimerkiksi palvelun käyttäminen vain omilla opintotiedoilla: kirjoitetaan tähän.')}</li>
<li>${draft('Palvelun saatavuus ja muutokset: kirjoitetaan tähän.')}</li>
<li>${draft('Vastuunrajoitus: kirjoitetaan tähän.')}</li>
<li>${draft('Ehtojen ja tämän selosteen muuttaminen ja siitä kertominen: kirjoitetaan tähän.')}</li>
<li>${draft('Sovellettava laki: kirjoitetaan tähän.')}</li>
</ul>`,
      },
    ],
  },
  en: {
    title: 'Privacy notice and terms of use',
    lede: 'What data Opintotodiste processes, why and for how long, who can see the links you share, how to delete your data and the terms for using the service.',
    updated: `${draft('Updated 18 October 2026.')}`,
    banner: 'This page is a draft that has not been reviewed yet. The marked statements are awaiting confirmation.',
    sections: [
      {
        title: 'In short',
        body: `<ul>
<li>The controller of Opintotodiste is Findynet Osuuskunta (Findynet Cooperative). Contact details are below.</li>
<li>The service turns your study records from the Koski service into badges that you can download, save in a wallet or share with a link.</li>
<li>If you don’t sign in, your data is deleted from the server at most 24 hours after your last visit.</li>
<li>Your passkey account and your collections are kept until you delete them.</li>
<li><strong>Note:</strong> anyone who gets a share link can see the collection’s badges without signing in.</li>
<li>You can check and delete your data. See <a href="#rights">Your rights</a>.</li>
<li>There is no analytics, advertising or tracking cookies.</li>
</ul>`,
      },
      {
        title: 'Controller',
        body: `<p>Findynet Osuuskunta (Findynet Cooperative), business ID 3213523-3<br>Email: ${CONTACT}</p>
<p>Findynet runs the whole service, including the signing service and the wallet service mentioned below.</p>
<p>${draft('A postal address will be added here, and the data protection officer’s contact details if one has been appointed.')}</p>`,
      },
      {
        title: 'What your data is used for',
        body: `<ul>
<li>Making badges from your Koski records and showing them to you.</li>
<li>Signing the badges, so that anyone can check they are genuine.</li>
<li>Delivering badges to your wallet app when you ask for it.</li>
<li>Signing in with a passkey, and saving and sharing collections.</li>
<li>Running the service and investigating faults (logs).</li>
</ul>
<p>${draft('Legal basis, proposal: the processing is necessary to provide the service when you use it (contract, Article 6(1)(b) of the GDPR). For logs, the basis is the controller’s legitimate interest in keeping the service working and secure (Article 6(1)(f)).')}</p>`,
      },
      {
        title: 'What data is processed and where it comes from',
        body: `<p><strong>From the Koski service</strong> (run by the Finnish National Agency for Education, opintopolku.fi), through the share link you give: your name, your learner number (oppijanumero) and the studies you shared, that is schools, achievements, grades, credits and dates. If Koski sends any other data about you, such as your personal identity code or date of birth, it is dropped at once and never stored. The service only fetches data from Koski and sends nothing there.</p>
<p><strong>From you:</strong> the account name you give when you create a passkey, the passkey’s public data and the names of your collections.</p>
<p><strong>From using the service:</strong> badges, which hold the achievement’s details and your learner number as an identifier, collection share links, timestamps and logs.</p>`,
      },
      {
        title: 'How long data is kept',
        body: `<ul>
<li><strong>Session</strong> (the share link, the data from Koski, the badges made from it and your language): 24 hours after your last page load, or until you sign out. The session is stored in the service’s database, and a cookie connects your browser to it. The cookie usually goes away when you close the browser, but the data on the server is still kept for those 24 hours.</li>
<li><strong>Account and passkeys</strong> (the name, a random identifier and, for each passkey, its identifier, public key, signature counter, whether it is synced or backed up, how it connects, and when it was created and last used): until the account is deleted. Unused accounts are not deleted automatically. The private key stays on your device, and the service never sees your fingerprint or your device PIN.</li>
<li><strong>Collections</strong> (the name, the share link, when it was created and last changed, and a signed copy of each badge): until you delete the collection or your account.</li>
<li><strong>A badge sent to a wallet:</strong> in the wallet service’s memory only until your wallet can fetch it: at most 10 minutes, plus one minute after the fetch. It is never written to a database or to disk.</li>
<li><strong>Badges being signed:</strong> the signing service doesn’t store them.</li>
<li><strong>Logs:</strong> 30 days. The app logs error messages. The wallet service logs request paths, status codes and the browser’s user agent, but not the content of badges.</li>
<li><strong>Backups:</strong> ${draft('how long database backups are kept will be added here. Deleted data may remain in backups for that time.')}</li>
</ul>`,
      },
      {
        title: 'Who processes your data and who receives it',
        body: `<ul>
<li><strong>Hosting:</strong> the service runs in Amazon Web Services’ Stockholm region (Sweden). ${draft('Amazon Web Services acts as a processor; the contracting entity’s name will be added here.')}</li>
<li><strong>Share link recipients:</strong> the people you send a collection’s link to, and anyone they pass it on to.</li>
<li><strong>Your wallet app:</strong> when you add a badge to a wallet, it moves to the app you chose on your device, and the app’s own terms apply to it.</li>
<li><strong>LinkedIn:</strong> only if you choose a LinkedIn button in the share dialog. LinkedIn then gets the link you share.</li>
</ul>
<p>${draft('Data is not disclosed to anyone else or used for marketing.')}</p>`,
      },
      {
        title: 'Transfers outside the EU',
        body: `<p>${draft('Data is kept in the EU and is not transferred outside the EU or the European Economic Area.')}</p>`,
      },
      {
        title: 'Cookies and browser storage',
        body: `<p>The service uses one cookie, which connects your browser to your session. Your chosen language is saved in your browser’s local storage so that it stays the same from page to page; it stays until you clear the browser’s site data.</p>
<p>Credential verification runs in your browser, and the credential you check is not sent to the server.</p>`,
      },
      {
        title: 'Automated decision-making',
        body: '<p>The service makes no automated decisions about you and doesn’t profile you. Badges are made from your Koski records as they are.</p>',
      },
      {
        title: 'Do you have to give your data?',
        body: '<p>No. Without a Koski share link, though, the service can’t make badges, and without a passkey you can’t save collections.</p>',
      },
      {
        id: 'rights',
        title: 'Your rights',
        body: `<p>To use the rights below, send a request to ${CONTACT}.</p>
<ul>
<li><strong>Access your data:</strong> you can see the collections and badges you saved on the <a href="/my/collections">My collections</a> page. You can ask for a copy of the rest.</li>
<li><strong>Correct your data:</strong> badge details come from Koski, so your school corrects errors in Koski. You can then make the badges again. You can’t change your account name in the service yet; you can ask for it to be corrected.</li>
<li><strong>Delete your data:</strong> see <a href="#deletion">How to delete your data</a>.</li>
<li><strong>Take your data elsewhere:</strong> you can download badges as files (JSON) and use them elsewhere.</li>
<li><strong>Restrict or object to processing:</strong> ${draft('these rights will be described once the legal basis is confirmed.')}</li>
<li><strong>Complain:</strong> if you think your data is processed unlawfully, you can complain to the Office of the Data Protection Ombudsman (<a href="https://tietosuoja.fi/en">tietosuoja.fi</a>).</li>
</ul>`,
      },
      {
        id: 'deletion',
        title: 'How to delete your data',
        body: `<ul>
<li><strong>Session:</strong> choose ${ui('Sign out')} and the session data is deleted at once. Otherwise it is deleted 24 hours after your last visit.</li>
<li><strong>Collection:</strong> on the <a href="/my/collections">My collections</a> page, choose ${ui('Delete')} next to the collection. The collection, its badges and its share link are deleted at once. You can’t remove a single badge from a collection yet.</li>
<li><strong>Share link:</strong> choose ${ui('New share link')} next to the collection and the old link stops working at once. Share pages are excluded from search engines. The service can’t delete copies that someone has already downloaded.</li>
<li><strong>Account and passkeys:</strong> ${draft('deleting your account in the service is coming. Until then, send a deletion request to ' + CONTACT + '.')} Deleting the account also deletes its collections. The passkey also stays on your device; remove it in your device’s or password manager’s settings.</li>
<li><strong>Koski share link:</strong> delete it in My Studyinfo. This doesn’t delete badges you have already saved in Opintotodiste.</li>
<li><strong>Badges in a wallet:</strong> delete them in the wallet app.</li>
</ul>`,
      },
      {
        id: 'terms',
        title: 'Terms of use',
        body: `<p>Opintotodiste turns your study records from the Koski service into Open Badges 3.0 badges and signs them electronically. You can download the badges, save them in a digital wallet and share them as collections with a link.</p>
<ul>
<li>${draft('Fees: to be written.')}</li>
<li>${draft('The user’s responsibilities, for example using the service only with one’s own study records: to be written.')}</li>
<li>${draft('Availability and changes to the service: to be written.')}</li>
<li>${draft('Limitation of liability: to be written.')}</li>
<li>${draft('Changes to these terms and this notice, and how they are announced: to be written.')}</li>
<li>${draft('Governing law: to be written.')}</li>
</ul>`,
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
  <p class="muted">${c.updated}</p>
  <p class="draft-banner" role="note"><span class="draft-tag">${DRAFT_TAG}</span> ${c.banner}</p>`)}
</section>

<main class="policy">
${sibling('article', '', (c) => c.sections.map(({ id, title, body }) => `
  <section${id ? ` id="${id}"` : ''}>
    <h2>${title}</h2>
    ${body}
  </section>`).join(''))}
</main>
${footer({ current: 'policy' })}
</body>
</html>`
}
