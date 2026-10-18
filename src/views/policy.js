import { head, header, footer } from './layout.js'
import { OG_PAGES } from './og.js'

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
// retention, region); the text itself is the user's. Keep it in step with
// what the code stores, and update `updated` with every change.

const ui = (label) => `<strong>${label}</strong>`

const CONTACT = '<a href="mailto:info@findy.fi">info@findy.fi</a>'

const COPY = {
  fi: {
    title: 'Tietosuojaseloste ja käyttöehdot',
    lede: 'Mitä tietoja Opintotodiste käsittelee, mihin ja kuinka kauan, kuka näkee jakamasi linkit, miten poistat tietosi ja millä ehdoilla palvelua käytetään.',
    updated: `Päivitetty 18.10.2026.`,
    sections: [
      {
        title: 'Lyhyesti',
        body: `<ul>
<li>Opintotodisteen rekisterinpitäjä on Findynet Osuuskunta. Yhteystiedot ovat alla.</li>
<li>Palvelu tekee Koski-palvelun opintotiedoistasi osaamismerkkejä, jotka voit ladata, tallentaa lompakkoon tai jakaa linkillä.</li>
<li>Koskesta haetut opintotietosi poistetaan palvelimelta tunnin kuluttua viimeisestä käynnistäsi, tai heti, kun valitset ${ui('Tyhjennä tiedot')}. Jos käytät palvelua kirjautumatta sisään, muutkin tietosi poistetaan viimeistään 24 tunnin kuluttua.</li>
<li>Jos kirjaudut palveluun, käyttäjätilisi ja kokoelmasi säilyvät, kunnes poistat ne.</li>
<li>Voit itse päättää, mitä palveluun tallennettuja tietoja jaat muille jakolinkkien avulla. Huomaa, että kuka tahansa jakolinkin saanut näkee kokoelman tai merkin, johon linkki johtaa.</li>
<li>Voit tarkastaa ja poistaa tietosi. Katso <a href="#oikeudet">Oikeutesi</a>.</li>
<li>Palvelussa ei ole analytiikkaa, mainoksia eikä seurantaevästeitä.</li>
</ul>`,
      },
      {
        title: 'Rekisterinpitäjä',
        body: `<p>Findynet Osuuskunta (Y-tunnus 3213523-3)<br>PL 1188<br>00101 Helsinki<br>Sähköposti: ${CONTACT}</p>`,
      },
      {
        title: 'Mihin tietojasi käytetään ja kuka niitä käsittelee',
        body: `<p>Sinä itse valitset palveluun tuomasi tiedot ja päätät, mitä tietoja jaat edelleen tai tallennat lompakkoosi.</p>
<p>Palvelu käyttää sille antamiasi tietoja vain niiden näyttämiseen sinulle, digitaalisten todisteiden muodostamiseen, niiden jakamiseen sinun valitsemallasi tavalla sekä jakamiesi tietojen oikeellisuuden varmistamiseen.</p>
<p>Palvelun tarjoaja ei käytä tietojasi muihin tarkoituksiin eikä itse välitä niitä muille tahoille. Tietojasi ei käytetä markkinointiin.</p>
<p>Tietoja palvelun käytöstä tallentuu lokeihin, joita palvelun tarjoaja voi käyttää vikojen selvittämiseen ja palvelun ylläpitoon.</p>
<p>Palvelu tallentaa tiedot Amazon Web Services -palvelimiin Tukholman alueella (Ruotsi). Niitä ei siirretä EU:n tai Euroopan talousalueen ulkopuolelle.</p>
<p>Tietojen käsittely perustuu sopimukseen (yleisen tietosuoja-asetuksen 6 artiklan 1 kohdan b alakohta).</p>`,
      },
      {
        title: 'Mitä tietoja käsitellään ja mistä ne saadaan',
        body: `<p><strong>Koski-palvelusta</strong> (Opetushallituksen ylläpitämä, opintopolku.fi) jakolinkillä, jonka itse annat: nimesi, oppijanumerosi ja jakamasi opinnot, eli oppilaitokset, suoritukset, arvosanat, laajuudet ja päivämäärät. Muita jakolinkin avulla jaettuja henkilötietoja ei tallenneta.</p>
<p><strong>Sinulta:</strong> Kirjautumiseen tarvittavan pääsyavaimen julkiset tiedot ja palvelua käyttäessäsi muodostamat tiedot kuten kokoelmien nimet ja jakolinkeille antamasi vastaanottajien nimet. Palveluun kirjautumisessa ei käytetä tunnusta tai salasanaa eikä sähköpostiosoitettasi. Palvelu tallentaa pääsyavaimesi julkisen avaimen, jotta vain sinun hallussasi olevalla yksityisellä avaimella voi kirjautua palveluun.</p>
<p><strong>Palvelun käytöstä:</strong> Allekirjoitetut osaamismerkit, jakolinkit ja lokittiedot.</p>`,
      },
      {
        title: 'Kuinka kauan tietoja säilytetään',
        body: `<ul>
<li><strong>Istunto:</strong> 24 tuntia viimeisestä sivunlatauksestasi tai kunnes kirjaudut ulos. Istuntoon kuuluvat jakolinkki, Koskesta saadut tiedot, niistä tehdyt merkit ja kielivalinta. Istunto on palvelun tietokannassa, ja selaimesi tunnistetaan siihen evästeellä. Eväste poistuu yleensä, kun suljet selaimen, mutta palvelimella olevat tiedot säilyvät silti 24 tuntia. Koskesta saadut tiedot ja niistä tehdyt merkit poistetaan istunnosta kuitenkin jo tunnin kuluttua viimeisestä sivunlatauksestasi.</li>
<li><strong>Tili ja pääsyavaimet:</strong> Kunnes tili poistetaan. Yli 6 kk käyttämättä olleet tilit voidaan poistaa.</li>
<li><strong>Osaamismerkit ja kokoelmat:</strong> Tallentamasi merkit säilyvät, kunnes poistat merkin tai tilisi, ja kokoelmat ja jakolinkit, kunnes poistat ne tai tilisi. Kokoelman poistaminen ei poista siinä olleita merkkejä.</li>
<li><strong>Lokit:</strong> 30 päivää. Sovelluksen käytöstä tallentuu tietoa virhetilanteiden selvittämistä ja palvelun ylläpitoa varten.</li>
<li><strong>Varmuuskopiot:</strong> Tietosi voivat säilyä varmuuskopioissa korkeintaan vuoden ajan.</li>
</ul>`,
      },
      {
        title: 'Evästeet ja selaimen tallennustila',
        body: `<p>Palvelu käyttää yhtä evästettä, joka yhdistää selaimesi istuntoon. Valitsemasi kieli tallennetaan selaimesi paikalliseen tallennustilaan, jotta se säilyy sivulta toiselle; se säilyy, kunnes tyhjennät selaimen sivustotiedot.</p>`,
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
<li><strong>Tietojen tarkastus:</strong> Näet osaamismerkkisi <a href="/">palvelun etusivulla</a> ja tallentamasi kokoelmat <a href="/my/collections">Kokoelmani</a>-sivulla. Muista tiedoista voit pyytää kopion.</li>
<li><strong>Tietojen korjaus:</strong> Palvelussa näytettävä nimesi ja merkkien tiedot tulevat Koskesta. Jos Koskesta saaduissa tiedoissa on virheitä, ota yhteyttä oppilaitokseen. Käyttäjätilisi näyttönimi tallentuu pääsyavaimeesi, eikä sitä voi muuttaa. Käyttäjätilisi näyttönimi näkyy vain sinulle. Voit halutessasi poistaa käyttäjätilisi ja luoda uuden tilin uudella näyttönimellä.</li>
<li><strong>Tietojen siirto:</strong> Voit ladata merkit itsellesi tiedostoina (JSON-muodossa). Voit tallentaa merkkejä digitaalisina todisteina lompakkoosi ja välittää niitä LinkedIn-profiiliisi.</li>
<li><strong>Tietojen poisto:</strong> Katso <a href="#poisto">Näin poistat tietosi</a>.</li>
<li><strong>Tietojen käsittelyn rajoitus tai vastustaminen:</strong> Voit lopettaa palvelun käytön ja <a href="#poisto">poistaa tietosi</a>.</li>
<li><strong>Valitus:</strong> Jos katsot, että tietojasi käsitellään lainvastaisesti, voit tehdä valituksen tietosuojavaltuutetun toimistolle (<a href="https://tietosuoja.fi">tietosuoja.fi</a>).</li>
</ul>`,
      },
      {
        id: 'poisto',
        title: 'Näin poistat tietosi',
        body: `<ul>
<li><strong>Tili, osaamismerkit ja kokoelmat:</strong> Valitse palvelun yläreunassa näkyvä tilisi näyttönimi, niin saat ohjeet tilisi poistamiseen. Yksittäisiä merkkejä, kokoelmia ja jakolinkkejä voit poistaa <a href="/my/collections">Kokoelmani</a>-sivulla.</li>
<li><strong>Istunto:</strong> Valitse ${ui('Tyhjennä tiedot')} hakemiesi suoritusten alta tai ${ui('Kirjaudu ulos')}, niin istunnon tiedot poistetaan heti. Muuten Koskesta saadut tiedot poistuvat tunnin ja muut istunnon tiedot 24 tunnin kuluttua viimeisestä käynnistäsi.</li>
<li><strong>Lompakkoon tallentamasi merkit:</strong> Poista ne lompakkosovelluksessa.</li>
<li><strong>Koski-jakolinkki:</strong> Poista se Oma Opintopolussa. Se ei poista Opintotodisteeseen jo tallentamiasi merkkejä.</li>
</ul>`,
      },
      {
        id: 'kayttoehdot',
        title: 'Käyttöehdot',
        body: `<p>Opintotodiste tekee Koski-palvelun opintotiedoistasi Open Badges 3.0 -muotoisia osaamismerkkejä ja allekirjoittaa ne sähköisesti. Voit ladata merkit, tallentaa ne digitaaliseen lompakkoon ja jakaa niitä linkillä yksittäin tai kokoelmina.</p>
<ul>
<li>Palvelun käyttö on maksutonta sekä osaamismerkkien haltijoille että niiden tarkastajille, joille on jaettu jakolinkki tästä palvelusta.</li>
<li>Käyttäjän vastuulla on käyttää palvelua hyvän tavan mukaisesti.
 <ul>
  <li>Osaamismerkkien haltijana tuot palveluun vain omia tietojasi.</li>
  <li>Osaamismerkkien vastaanottajana käytät palvelua vain sinulle jaettujen merkkien aitouden varmistamiseen. Käytät sinulle jaettuja tietoja vain siihen tarkoitukseen, johon ne on sinulle jaettu.</li>
 </ul>
</li>
<li>Palvelun tarjoaja pyrkii vastaamaan palvelun saatavuudesta ja toimivuudesta parhaansa mukaan. Palvelun tarjoaminen voidaan lopettaa koska tahansa ilman ennakkoilmoitusta.</li>
<li>Palvelun tarjoaja ei vastaa käyttäjän toimista tai käyttäjän tietojen menetyksestä.</li>
<li>Palvelun tarjoaja ei tarkasta Koski-rekisteristä saatujen tietojen oikeellisuutta eikä käyttäjän henkilöllisyyttä. Palvelu varmistaa hyvien tietoturvaperiaatteiden mukaisesti, että palvelun allekirjoittamat digitaaliset todisteet vastaavat Koski-rekisteristä saatua sisältöä, ja että todisteisiin tallennettu nimi vastaa Koski-rekisteristä saatua nimeä.</li>
<li>Palvelun tarjoaja varaa oikeuden muuttaa näitä ehtoja milloin tahansa ilman ennakkoilmoitusta. Ehtojen muuttamisesta ilmoitetaan käyttäjille palvelun etusivulla.</li>
<li>Palveluun sovelletaan Suomen lakia.</li>
</ul>`,
      },
    ],
  },
  en: {
    title: 'Privacy notice and terms of use',
    lede: 'What data Opintotodiste processes, why and for how long, who can see the links you share, how to delete your data and the terms for using the service.',
    updated: `Updated 18 October 2026.`,
    sections: [
      {
        title: 'In short',
        body: `<ul>
<li>The controller of Opintotodiste is Findynet Osuuskunta (Findynet Cooperative). Contact details are below.</li>
<li>The service turns your study records from the Koski service into badges that you can download, save in a wallet or share with a link.</li>
<li>Your study records fetched from Koski are deleted from the server an hour after your last visit, or at once when you choose ${ui('Clear my data')}. If you use the service without signing in, the rest of your data is deleted at most 24 hours after your last visit.</li>
<li>If you sign in, your user account and your collections are kept until you delete them.</li>
<li>You decide which of the data saved in the service you share with others through share links. Note that anyone who gets a share link can see the collection or the badge it leads to.</li>
<li>You can check and delete your data. See <a href="#rights">Your rights</a>.</li>
<li>There is no analytics, advertising or tracking cookies.</li>
</ul>`,
      },
      {
        title: 'Controller',
        body: `<p>Findynet Osuuskunta (Findynet Cooperative), business ID 3213523-3<br>PL 1188<br>00101 Helsinki<br>Finland<br>Email: ${CONTACT}</p>`,
      },
      {
        title: 'What your data is used for and who processes it',
        body: `<p>You choose the data you bring into the service, and you decide what you share onwards or save in your wallet.</p>
<p>The service uses the data you give it only to show it to you, to create digital credentials, to share them in the way you choose and to let others verify the data you share.</p>
<p>The service provider doesn’t use your data for any other purpose and doesn’t pass it on to anyone else itself. Your data is not used for marketing.</p>
<p>Data about the use of the service is recorded in logs, which the service provider may use to investigate faults and to maintain the service.</p>
<p>The service stores the data on Amazon Web Services servers in the Stockholm region (Sweden). It is not transferred outside the EU or the European Economic Area.</p>
<p>The processing is based on a contract (Article 6(1)(b) of the General Data Protection Regulation).</p>`,
      },
      {
        title: 'What data is processed and where it comes from',
        body: `<p><strong>From the Koski service</strong> (run by the Finnish National Agency for Education, opintopolku.fi), through the share link you give: your name, your learner number (oppijanumero) and the studies you shared, that is schools, achievements, grades, credits and dates. No other personal data shared through the share link is stored.</p>
<p><strong>From you:</strong> The public data of the passkey you sign in with, and data you create while using the service, such as the names of your collections and the recipient names you give your share links. Signing in uses no username, password or email address. The service stores your passkey’s public key so that only the private key you hold can sign in to the service.</p>
<p><strong>From using the service:</strong> Signed badges, share links and log data.</p>`,
      },
      {
        title: 'How long data is kept',
        body: `<ul>
<li><strong>Session:</strong> 24 hours after your last page load or until you sign out. The session holds the share link, the data from Koski, the badges made from it and your language. The session is stored in the service’s database, and a cookie connects your browser to it. The cookie usually goes away when you close the browser, but the data on the server is still kept for those 24 hours. The data from Koski and the badges made from it are removed from the session sooner, an hour after your last page load.</li>
<li><strong>Account and passkeys:</strong> Until the account is deleted. Accounts that have not been used for more than 6 months may be deleted.</li>
<li><strong>Badges and collections:</strong> The badges you save are kept until you delete the badge or your account, and collections and share links until you delete them or your account. Deleting a collection doesn’t delete the badges in it.</li>
<li><strong>Logs:</strong> 30 days. Data about the use of the app is recorded to investigate errors and to maintain the service.</li>
<li><strong>Backups:</strong> Your data may remain in backups for at most one year.</li>
</ul>`,
      },
      {
        title: 'Cookies and browser storage',
        body: `<p>The service uses one cookie, which connects your browser to your session. Your chosen language is saved in your browser’s local storage so that it stays the same from page to page; it stays until you clear the browser’s site data.</p>`,
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
<li><strong>Access:</strong> You can see your badges on the service’s <a href="/">front page</a> and the collections you saved on the <a href="/my/collections">My collections</a> page. You can ask for a copy of the rest.</li>
<li><strong>Rectification:</strong> Your name shown in the service and the badge details come from Koski. If the data from Koski has errors, contact your school. Your account’s display name is stored in your passkey and can’t be changed. Only you can see your account’s display name. If you like, you can delete your account and create a new one with a new display name.</li>
<li><strong>Portability:</strong> You can download the badges as files (in JSON format). You can save badges as digital credentials in your wallet and add them to your LinkedIn profile.</li>
<li><strong>Erasure:</strong> See <a href="#deletion">How to delete your data</a>.</li>
<li><strong>Restriction of or objection to processing:</strong> You can stop using the service and <a href="#deletion">delete your data</a>.</li>
<li><strong>Complaint:</strong> If you think your data is processed unlawfully, you can complain to the Office of the Data Protection Ombudsman (<a href="https://tietosuoja.fi/en">tietosuoja.fi</a>).</li>
</ul>`,
      },
      {
        id: 'deletion',
        title: 'How to delete your data',
        body: `<ul>
<li><strong>Account, badges and collections:</strong> Choose your account’s display name at the top of the page to get instructions for deleting your account. You can delete single badges, collections and share links on the <a href="/my/collections">My collections</a> page.</li>
<li><strong>Session:</strong> Choose ${ui('Clear my data')} below your fetched achievements, or ${ui('Sign out')}, and the session data is deleted at once. Otherwise the data from Koski is deleted an hour, and the rest of the session data 24 hours, after your last visit.</li>
<li><strong>Badges you saved in a wallet:</strong> Delete them in the wallet app.</li>
<li><strong>Koski share link:</strong> Delete it in My Studyinfo. This doesn’t delete badges you have already saved in Opintotodiste.</li>
</ul>`,
      },
      {
        id: 'terms',
        title: 'Terms of use',
        body: `<p>Opintotodiste turns your study records from the Koski service into Open Badges 3.0 badges and signs them electronically. You can download the badges, save them in a digital wallet and share them with a link, one at a time or as collections.</p>
<ul>
<li>Using the service is free of charge both for badge holders and for the verifiers who have been sent a share link from this service.</li>
<li>Users are responsible for using the service in accordance with good practice.
 <ul>
  <li>As a badge holder, you bring only your own data into the service.</li>
  <li>As a recipient of badges, you use the service only to verify that the badges shared with you are genuine. You use the data shared with you only for the purpose it was shared with you for.</li>
 </ul>
</li>
<li>The service provider does its best to keep the service available and working. The service may be discontinued at any time without prior notice.</li>
<li>The service provider is not responsible for users’ actions or for the loss of users’ data.</li>
<li>The service provider does not check that the data received from the Koski register is correct, nor the user’s identity. Following good security practice, the service makes sure that the digital credentials it signs match the content received from the Koski register, and that the name stored in the credentials matches the name received from the Koski register.</li>
<li>The service provider reserves the right to change these terms at any time without prior notice. Users are informed of changes to the terms on the service’s front page.</li>
<li>Finnish law applies to the service.</li>
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
${head(`<title lang="fi">${COPY.fi.title} – Opintotodiste</title>`, ['policy'], { path: '/policy', ...OG_PAGES.policy })}
</head>
<body class="page-policy">
${header({ auth: false })}

<section class="policy-hero">
${sibling('div', ' class="policy-intro"', (c) => `
  <h1>${c.title}</h1>
  <p class="lede">${c.lede}</p>
  <p class="muted">${c.updated}</p>`)}
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
