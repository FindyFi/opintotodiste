// Wallets listed on /guide/wallet. Adding or moving a wallet is a change to
// this list only. `group` picks the section; a group with `hidden: true` is
// not shown. Store links are omitted when the app isn't in that store. EUDI
// wallets are the ones tested in I1 (and UniMe in W1). Sorted by name, which
// is the order they're shown in. No descriptions on purpose: we couldn't
// keep them up to date as the apps change.
export const WALLET_GROUPS = [
  {
    id: 'eudi',
    title: { fi: 'EUDI-yhteensopivat lompakot', en: 'EUDI-compatible wallets' },
  },
  {
    // Hidden until LCW works with Opintotodiste (task L1).
    id: 'openbadge',
    hidden: true,
    title: { fi: 'Open Badge -lompakot', en: 'Open Badge wallets' },
  },
]

export const WALLETS = [
  {
    name: 'Heidi',
    group: 'eudi',
    appStore: 'https://apps.apple.com/app/id6741428702',
    googlePlay: 'https://play.google.com/store/apps/details?id=ch.ubique.heidi.android',
  },
  {
    name: 'Hovi Wallet',
    group: 'eudi',
    appStore: 'https://apps.apple.com/app/id6736700908',
    googlePlay: 'https://play.google.com/store/apps/details?id=droidwallet.hovi.id',
  },
  {
    name: 'Learner Credential Wallet',
    group: 'openbadge',
  },
  {
    name: 'Paradym',
    group: 'eudi',
    appStore: 'https://apps.apple.com/app/id6449846111',
    googlePlay: 'https://play.google.com/store/apps/details?id=id.paradym.wallet',
  },
  {
    name: 'Procivis One',
    group: 'eudi',
    appStore: 'https://apps.apple.com/app/id6480111491',
    googlePlay: 'https://play.google.com/store/apps/details?id=ch.procivis.one.wallet.trial',
  },
  {
    name: 'Talao',
    group: 'eudi',
    appStore: 'https://apps.apple.com/app/id1582183266',
    googlePlay: 'https://play.google.com/store/apps/details?id=co.talao.wallet',
  },
  {
    name: 'UniMe',
    group: 'eudi',
    appStore: 'https://apps.apple.com/app/id6451394321',
    googlePlay: 'https://play.google.com/store/apps/details?id=com.impierce.identity_wallet',
  },
]
