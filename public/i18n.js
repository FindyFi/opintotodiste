// Text that JavaScript writes outside the page's own markup: native dialogs
// (confirm, prompt), which translate-element can't reach. The language is read
// when the dialog opens, so it follows whatever the switcher last set.
function t(fi, en) {
  return document.documentElement.lang === 'en' ? en : fi
}

// Server errors (K5, U22). The server sends its messages in Finnish, the UI's
// source language, with `lang: 'fi'` (src/user-error.js), and their English is
// in translations.json like any other text.

// The error for a failed response's JSON body, carrying its `lang` and
// `link`. `fallback` is a Finnish message for a body without one.
function responseError(data, fallback = 'Pyyntö ei onnistunut juuri nyt. Yritä hetken päästä uudelleen.') {
  if (data?.error) return Object.assign(new Error(data.error), { lang: data.lang, link: data.link })
  return Object.assign(new Error(fallback), { lang: 'fi' })
}

// What the browser itself throws, in English, as Finnish messages.
const BROWSER_ERRORS = {
  // fetch() could not reach the server.
  TypeError: 'Palveluun ei saatu yhteyttä. Tarkista verkkoyhteys ja yritä uudelleen.',
  // The passkey dialog was cancelled or timed out (WebAuthn).
  NotAllowedError: 'Pääsyavaimen käyttö peruttiin tai aika loppui. Yritä uudelleen.',
}

// An error's message as nodes to show. A Finnish one is marked lang="fi" so
// translate-element shows its English when that is chosen; a `link`
// ({ text, href }) makes that text in the message a link (the English in
// translations.json has the link too).
function errorContent(err) {
  const browserMessage = BROWSER_ERRORS[err?.name]
  if (browserMessage) return errorContent({ message: browserMessage, lang: 'fi' })
  const { message = '', link, lang } = err ?? {}
  const at = link?.text && link.href?.startsWith('/') ? message.lastIndexOf(link.text) : -1
  const parts = at < 0 ? [message] : [message.slice(0, at), anchor(link), message.slice(at + link.text.length)]
  if (lang !== 'fi') return parts
  const span = document.createElement('span')
  span.lang = 'fi'
  span.append(...parts)
  return [span]
}

function anchor({ href, text }) {
  const a = document.createElement('a')
  a.href = href
  a.textContent = text
  return a
}
