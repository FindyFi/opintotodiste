// Wallets listed on /guide/wallet. Adding or moving a wallet is a change to
// this list only. `group` picks the section; `status: 'coming'` shows the
// wallet as not yet supported (no store links). Store links are omitted when
// the app isn't in that store. EUDI wallets are the ones tested in I1.
export const WALLET_GROUPS = [
  {
    id: 'eudi',
    title: { fi: 'EUDI-yhteensopivat lompakot', en: 'EUDI-compatible wallets' },
    intro: {
      fi: 'Sovellukset, jotka käyttävät eurooppalaisen digitaalisen identiteettilompakon (EUDI) tekniikoita. Nämä on testattu Opintotodisteen kanssa.',
      en: 'Apps built on the technology of the European Digital Identity (EUDI) Wallet. These have been tested with Opintotodiste.',
    },
  },
  {
    id: 'openbadge',
    title: { fi: 'Open Badge -lompakot', en: 'Open Badge wallets' },
    intro: {
      fi: 'Osaamismerkkeihin erikoistuneet sovellukset.',
      en: 'Apps made for digital badges.',
    },
  },
]

export const WALLETS = [
  {
    name: 'Heidi',
    group: 'eudi',
    status: 'works',
    appStore: 'https://apps.apple.com/app/id6741428702',
    note: {
      fi: 'Näyttää merkin perustiedot selkeästi. Saatavilla vain iPhonelle.',
      en: 'Shows the main details of a badge clearly. iPhone only.',
    },
  },
  {
    name: 'Procivis One',
    group: 'eudi',
    status: 'works',
    appStore: 'https://apps.apple.com/app/id6480111491',
    googlePlay: 'https://play.google.com/store/apps/details?id=ch.procivis.one.wallet.trial',
    note: {
      fi: 'Näyttää myös merkin tarkemmat tiedot, kuten arvosanan ja laajuuden.',
      en: 'Also shows the finer details of a badge, such as the grade and extent.',
    },
  },
  {
    name: 'Talao',
    group: 'eudi',
    status: 'works',
    appStore: 'https://apps.apple.com/app/id1582183266',
    googlePlay: 'https://play.google.com/store/apps/details?id=co.talao.wallet',
    note: {
      fi: 'Sovellus voi huomauttaa, ettei merkillä ole voimassaoloaikaa. Se ei haittaa: merkki on voimassa toistaiseksi.',
      en: 'The app may point out that the badge has no expiry date. That is fine: the badge does not expire.',
    },
  },
  {
    name: 'Paradym',
    group: 'eudi',
    status: 'works',
    appStore: 'https://apps.apple.com/app/id6449846111',
    googlePlay: 'https://play.google.com/store/apps/details?id=id.paradym.wallet',
    note: {
      fi: 'Sovellus pyytää hyväksymään tuntemattoman myöntäjän. Hyväksy, jos avasit koodin Opintotodisteesta.',
      en: 'The app asks you to accept an unknown issuer. Accept it if you opened the code from Opintotodiste.',
    },
  },
  {
    name: 'Learner Credential Wallet',
    group: 'openbadge',
    status: 'coming',
    note: {
      fi: 'Digital Credentials Consortiumin avoin lompakko. Tuki on työn alla.',
      en: 'The open wallet of the Digital Credentials Consortium. Support is on its way.',
    },
  },
]
