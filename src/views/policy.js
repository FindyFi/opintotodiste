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
<li>Jos käytät palvelua kirjautumatta sisään, tietosi poistetaan palvelimelta viimeistään 24 tunnin kuluttua viimeisestä käynnistäsi.</li>
<li>Jos kirjaudut palveluun, käyttäjätilisi ja kokoelmasi säilyvät, kunnes poistat ne.</li>
<li>Voit itse päättää, mitä palveluun tallennettuja tietoja jaat muille jakolinkkien avulla. Huomaa, että kuka tahansa jakolinkin saanut näkee kokoelman merkit.</li>
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
<p>Palvelu käyttää sille antamiasi tietoja vain niiden näyttämiseen sinulle, digitaalisten todisteiden muodostamiseen, niiden jakamiseen sinun valitsemallasi tavalla sekä jakamiesi tietojen oikeellisuuden varmistasmiseen.</p>
<p>Palvelun tarjoaja ei käytä tietojasi muihin tarkoituksiin eikä itse välitä niitä muille tahoille. Tietojasi ei käytetä markkinointiin.</p>
<p>Tietoja palvelun käytöstä tallentuu lokeihin, joita palvelun tarjoaja voi käyttää vikojen selvittämiseen ja palvelun ylläpitoon.</p>
<p>Palvelu tallentaa tiedot Amazon Web Services -palvelimiin Tukholman alueella (Ruotsi). Niitä ei siirretä EU:n tai Euroopan talousalueen ulkopuolelle.</p>
<p>Tietojen käsittely perustuu sopimukseen (yleisen tietosuoja-asetuksen 6 artiklan 1 kohdan b alakohta).</p>`,
      },
      {
        title: 'Mitä tietoja käsitellään ja mistä ne saadaan',
        body: `<p><strong>Koski-palvelusta</strong> (Opetushallituksen ylläpitämä, opintopolku.fi) jakolinkillä, jonka itse annat: nimesi, oppijanumerosi ja jakamasi opinnot, eli oppilaitokset, suoritukset, arvosanat, laajuudet ja päivämäärät. Muita jakolinkin avulla jaettuja tietoja ei tallenneta.</p>
<p><strong>Sinulta:</strong> Kirjautumiseen tarvittavan pääsyavaimen julkiset tiedot ja palvelua käyttäessäsi muodostamat tiedot kuten kokoelmien nimet. Palveluun kirjautumisessa ei käytetä tunnusta tai salasanaa eikä sähköpostiosoitettasi. Palvelu tallentaa pääsyavaimesi julkisen avaimen, jotta vain sinun hallussasi olevalla yksityisellä avaimella voi kirjautua palveluun.</p>
<p><strong>Palvelun käytöstä:</strong> allekirjoitetut osaamismerkit, jakolinkit ja lokittiedot.</p>`,
      },
      {
        title: 'Kuinka kauan tietoja säilytetään',
        body: `<ul>
<li><strong>Istunto</strong> (jakolinkki, Koskesta saadut tiedot, niistä tehdyt merkit ja kielivalinta): 24 tuntia viimeisestä sivunlatauksestasi tai kunnes kirjaudut ulos. Istunto on palvelun tietokannassa, ja selaimesi tunnistetaan siihen evästeellä. Eväste poistuu yleensä, kun suljet selaimen, mutta palvelimella olevat tiedot säilyvät silti 24 tuntia.</li>
<li><strong>Tili ja pääsyavaimet</strong>: kunnes tili poistetaan. Yli 6 kk käyttämättä olleet tilit voidaan poistaa.</li>
<li><strong>Osaamismerkit ja kokoelmat</strong>: kunnes poistat kokoelman tai tilisi.</li>
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
<li><strong>Tietojen tarkastus:</strong> näet osaamismerkkisi <a href="/">palvelun etusivulla</a> ja tallentamasi kokoelmat <a href="/my/collections">Kokoelmani</a>-sivulla. Muista tiedoista voit pyytää kopion.</li>
<li><strong>Tietojen korjaus:</strong> palvelussa näytettävä nimesi ja merkkien tiedot tulevat Koskesta. Jos Koskesta saaduissa tiedoissa on virheitä, ota yhteyttä oppilaitokseen.</li>
<li><strong>Tietojen siirto:</strong> voit ladata merkit itsellesi tiedostoina (JSON-muodossa). Voit tallentaa merkkejä digitaalisina todisteina lompakkoosi ja välittää niitä LinkedIn-profiiliisi.</li>
<li><strong>Tietojen poisto:</strong> katso <a href="#poisto">Näin poistat tietosi</a>.</li>
<li><strong>Tietojen käsittelyn rajoitus tai vastustaminen</strong>: Voit lopettaa palvelun käytön ja <a href="#poisto">poistaa tietosi</a>.</li>
<li><strong>Valitus:</strong> jos katsot, että tietojasi käsitellään lainvastaisesti, voit tehdä valituksen tietosuojavaltuutetun toimistolle (<a href="https://tietosuoja.fi">tietosuoja.fi</a>).</li>
</ul>`,
      },
      {
        id: 'poisto',
        title: 'Näin poistat tietosi',
        body: `<ul>
<li><strong>Tili, osaamismerkit ja kokoelmat:</strong> Valitse palvelun yläreunassa näkyvä tilisi näyttönimi, niin saat ohjeet tilisi poistamiseen. Yksittäisiä kokoelmia ja jakolinkkejä voit poistaa <a href="/my/collections">Kokoelmani</a>-sivulla.</li>
<li><strong>Istunto:</strong> valitse ${ui('Kirjaudu ulos')}, niin istunnon tiedot poistetaan heti. Muuten ne poistuvat 24 tunnin kuluttua viimeisestä käynnistäsi.</li>
<li><strong>Lompakkoon tallentamasi merkit:</strong> poista ne lompakkosovelluksessa.</li>
<li><strong>Koski-jakolinkki:</strong> poista se Oma Opintopolussa. Se ei poista Opintotodisteeseen jo tallentamiasi merkkejä.</li>
</ul>`,
      },
      {
        id: 'kayttoehdot',
        title: 'Käyttöehdot',
        body: `<p>Opintotodiste tekee Koski-palvelun opintotiedoistasi Open Badges 3.0 -muotoisia osaamismerkkejä ja allekirjoittaa ne sähköisesti. Voit ladata merkit, tallentaa ne digitaaliseen lompakkoon ja jakaa niitä kokoelmina linkillä.</p>
<ul>
<li>Palvelun käyttö on maksutonta sekä osaamismerkkien haltijoille että niiden tarkastajille, joille on jaettu jakolinkki tästä palvelusta.</li>
<li>Käyttäjän vastuulla on käyttää palvelua hyvän tavan mukaisesti. Osaamismerkkien haltijana </li>
<li>Palvelun tarjoaja pyrkii vastaamaan palvelun saatavuudesta ja toimivuudesta parhaansa mukaan. Palvelun tarjoaminen voidaan lopettaa koska tahansa ilman ennakkoilmoitusta.</li>
<li>Palvelun tarjoaja ei vastaa käyttäjän toimista tai käyttäjän tietojen menetyksestä.</li>
<li>Palvelun tarjoaja ei tarkasta Koski-rekisteristä saatujen tietojen oikeellisuutta. Palvelu varmistaa hyvien tietoturvaperiaatteiden mukaisesti, että palvelun allekirjoittamat digitaaliset todisteet vastaavat Koski-rekisteristä saatua sisältöä. Palvelu ei varmista käyttäjän henkilöllisyyttä muulla tavalla kuin luottamalla Koski-rekisteristä saatavaan nimeen.</li>
<li>Palvelun tarjoaja varaa oikeuden muuttaa näitä ehtoja milloin tahansa ilman ennakkoilmoitusta.</li>
<li>Palveluun sovelletaan Suomen lakia.</li>
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
<li>If you use the service without signing in, your data is deleted from the server at most 24 hours after your last visit.</li>
<li>If you sign in, your user account and your collections are kept until you delete them.</li>
<li>You decide which of the data saved in the service you share with others through share links. Note that anyone who gets a share link can see the collection’s badges.</li>
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
        body: `<p><strong>From the Koski service</strong> (run by the Finnish National Agency for Education, opintopolku.fi), through the share link you give: your name, your learner number (oppijanumero) and the studies you shared, that is schools, achievements, grades, credits and dates. Any other data shared through the share link is not stored.</p>
<p><strong>From you:</strong> the public data of the passkey you sign in with, and data you create while using the service, such as the names of your collections. Signing in uses no username, password or email address. The service stores your passkey’s public key so that only the private key you hold can sign in to the service.</p>
<p><strong>From using the service:</strong> signed badges, share links and log data.</p>`,
      },
      {
        title: 'How long data is kept',
        body: `<ul>
<li><strong>Session</strong> (the share link, the data from Koski, the badges made from it and your language): 24 hours after your last page load or until you sign out. The session is stored in the service’s database, and a cookie connects your browser to it. The cookie usually goes away when you close the browser, but the data on the server is still kept for those 24 hours.</li>
<li><strong>Account and passkeys</strong>: until the account is deleted. Accounts that have not been used for more than 6 months may be deleted.</li>
<li><strong>Badges and collections</strong>: until you delete the collection or your account.</li>
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
<li><strong>Access:</strong> you can see your badges on the service’s <a href="/">front page</a> and the collections you saved on the <a href="/my/collections">My collections</a> page. You can ask for a copy of the rest.</li>
<li><strong>Rectification:</strong> your name shown in the service and the badge details come from Koski. If the data from Koski has errors, contact your school.</li>
<li><strong>Portability:</strong> you can download the badges as files (in JSON format). You can save badges as digital credentials in your wallet and add them to your LinkedIn profile.</li>
<li><strong>Erasure:</strong> see <a href="#deletion">How to delete your data</a>.</li>
<li><strong>Restriction of or objection to processing</strong>: You can stop using the service and <a href="#deletion">delete your data</a>.</li>
<li><strong>Complaint:</strong> if you think your data is processed unlawfully, you can complain to the Office of the Data Protection Ombudsman (<a href="https://tietosuoja.fi/en">tietosuoja.fi</a>).</li>
</ul>`,
      },
      {
        id: 'deletion',
        title: 'How to delete your data',
        body: `<ul>
<li><strong>Account, badges and collections:</strong> Choose your account’s display name at the top of the page to get instructions for deleting your account. You can delete single collections and share links on the <a href="/my/collections">My collections</a> page.</li>
<li><strong>Session:</strong> choose ${ui('Sign out')} and the session data is deleted at once. Otherwise it is deleted 24 hours after your last visit.</li>
<li><strong>Badges you saved in a wallet:</strong> delete them in the wallet app.</li>
<li><strong>Koski share link:</strong> delete it in My Studyinfo. This doesn’t delete badges you have already saved in Opintotodiste.</li>
</ul>`,
      },
      {
        id: 'terms',
        title: 'Terms of use',
        body: `<p>Opintotodiste turns your study records from the Koski service into Open Badges 3.0 badges and signs them electronically. You can download the badges, save them in a digital wallet and share them as collections with a link.</p>
<ul>
<li>Using the service is free of charge both for badge holders and for the verifiers who have been sent a share link from this service.</li>
<li>Users are responsible for using the service in accordance with good practice. As a badge holder ${draft('(this sentence is unfinished in the Finnish text)')}</li>
<li>The service provider does its best to keep the service available and working. The service may be discontinued at any time without prior notice.</li>
<li>The service provider is not responsible for users’ actions or for the loss of users’ data.</li>
<li>The service provider does not check that the data received from the Koski register is correct. Following good security practice, the service makes sure that the digital credentials it signs match the content received from the Koski register. The service does not verify the user’s identity in any other way than by relying on the name received from the Koski register.</li>
<li>The service provider reserves the right to change these terms at any time without prior notice.</li>
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
