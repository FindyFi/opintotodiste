// The synthetic study record behind "Kokeile palvelua esittelytiedoilla"
// (src/demo-koski.json): a fictional person and fictional institutions.
// `koski_url` is NOT NULL, so a demo import stores this marker instead of a link.
export const DEMO_KOSKI_URL = 'demo:esittelytiedot'
export const DEMO_OID = '1.2.246.562.24.00000000100'

export const isDemoData = (data) => data?.henkilö?.oid === DEMO_OID
