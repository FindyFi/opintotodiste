import { AsyncLocalStorage } from 'node:async_hooks'
import { esc } from './layout.js'

// Open Graph and Twitter card tags for link previews. Crawlers read the static
// HTML and run no JavaScript, so translate-element can't help: the language is
// chosen on the server from ?lang= (the parameter translate-element uses too),
// and a link without it previews in Finnish.

// The preview image, shown in LinkedIn, Teams, Slack. null leaves og:image out.
// To switch it on, add U12's 1200×630 PNG under public/ and set the path:
//   { path: '/icons/og-image.png', width: 1200, height: 630 }
export const OG_IMAGE = null
const OG_IMAGE_ALT = { fi: 'Opintotodiste', en: 'Study credential' }

const SITE_NAME = 'Opintotodiste'
const LOCALES = { fi: 'fi_FI', en: 'en_GB' }

const languages = new AsyncLocalStorage()

// Express middleware: renders further down the chain (also after an await) see
// the visitor's language through ogLanguage().
export function ogLanguageMiddleware(req, res, next) {
  languages.run(req.query.lang === 'en' ? 'en' : 'fi', next)
}

export const ogLanguage = () => languages.getStore() ?? 'fi'

// Descriptions of the pages whose text doesn't depend on the data.
export const OG_PAGES = {
  site: {
    title: { fi: 'Opintotodiste', en: 'Study credential' },
    description: {
      fi: 'Muuta opintosi todennettaviksi osaamismerkeiksi, tallenna ne digitaaliseen lompakkoon ja jaa ne työnantajalle.',
      en: 'Turn your studies into verifiable badges, keep them in a digital wallet and share them with an employer.',
    },
  },
  employer: {
    title: { fi: 'Työnantajalle – Opintotodiste', en: 'For employers – Study credential' },
    description: {
      fi: 'Mitä digitaaliset osaamismerkit ovat, miten tarkastat hakijan merkit ja miten ne tukevat osaamiseen perustuvaa rekrytointia.',
      en: 'What digital badges are, how to verify an applicant’s badges and how they support skills-based hiring.',
    },
  },
  verify: {
    title: { fi: 'Tarkasta todiste – Opintotodiste', en: 'Verify a credential – Study credential' },
    description: {
      fi: 'Tarkasta osaamismerkin aitous: kuka sen myönsi ja ettei sitä ole muutettu.',
      en: 'Verify a badge: who issued it and that it has not been altered.',
    },
  },
  studyinfo: {
    description: {
      fi: 'Näin luot Oma Opintopolussa jakolinkin, jolla välität opintosi Koskesta.',
      en: 'How to create a share link in My Studyinfo for sharing your studies from Koski.',
    },
  },
  wallet: {
    description: {
      fi: 'Näin tallennat osaamismerkit digitaaliseen lompakkoon.',
      en: 'How to save your badges in a digital wallet.',
    },
  },
  sharing: {
    description: {
      fi: 'Näin kokoat osaamismerkeistä kokoelman ja lähetät linkin työnantajalle.',
      en: 'How to gather your badges into a collection and send the link to an employer.',
    },
  },
}

// og: { path, title?, description? } with title and description as { fi, en };
// missing parts fall back to the site's. Everything is escaped here, so
// callers pass raw text (a credential name may contain quotes or <).
export function ogTags({ path = '/', title, description } = {}) {
  const lang = ogLanguage()
  const pick = (text, fallback) => (text ?? fallback)[lang]
  const origin = process.env.ORIGIN?.replace(/\/+$/, '')
  const absolute = (p) => (origin ? `${origin}${p}` : null)
  const url = absolute(lang === 'en' ? `${path}?lang=en` : path)
  const meta = (key, value) => (value ? `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${esc(value)}">` : null)
  const text = pick(description, OG_PAGES.site.description)
  const image = OG_IMAGE && absolute(OG_IMAGE.path)
  const other = lang === 'fi' ? 'en' : 'fi'

  return [
    meta('description', text),
    meta('og:title', pick(title, OG_PAGES.site.title)),
    meta('og:description', text),
    meta('og:type', 'website'),
    meta('og:url', url),
    meta('og:site_name', SITE_NAME),
    meta('og:locale', LOCALES[lang]),
    meta('og:locale:alternate', LOCALES[other]),
    meta('og:image', image),
    image && meta('og:image:alt', OG_IMAGE_ALT[lang]),
    image && meta('og:image:width', String(OG_IMAGE.width)),
    image && meta('og:image:height', String(OG_IMAGE.height)),
    meta('twitter:card', image ? 'summary_large_image' : 'summary'),
  ]
    .filter(Boolean)
    .join('\n')
}
