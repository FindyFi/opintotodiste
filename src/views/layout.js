import { ogTags } from './og.js'

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

// Safe to embed inside a <script> tag: escapes characters that could
// otherwise close the tag early or be sniffed as a comment/CDATA opener.
export function embedJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

// A rosette: the badge mark used for the brand and for credential rows
// (public/app.js draws the same shape client-side).
export const BADGE_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="M8.5 13.8 7 22l5-3 5 3-1.5-8.2"/></svg>`

// The shared-with-you pill and the verify card on the recipient pages.
export const SHARE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>`
export const SHIELD_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>`

// Everything in <head> except the <title>. `og` feeds the link-preview tags
// (see og.js); without it a page gets the generic site ones. Styles live in public/styles/:
// base.css everywhere, plus the sections a page names in `styles` (in order).
// Archivo is self-hosted from @fontsource-variable/archivo (see index.js).
export function head(title, styles = [], og = {}) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${title}
${ogTags(og)}
<link rel="stylesheet" href="/vendor/archivo/wdth.css">
<link rel="stylesheet" href="/vendor/translate-element/translate-element.css">
${['base', ...styles].map((name) => `<link rel="stylesheet" href="/styles/${name}.css">`).join('\n')}
<script src="/vendor/translate-element/translate-element.js"></script>`
}

// Rendered on every page. With `auth` it also carries the login/account nav
// (main page, collections page). That nav is deliberately just a shell:
// public/auth.js owns populating #authNav from GET /auth/me and re-renders
// it after login/register/logout, so there is exactly one place
// (client-side) that knows how to draw the logged-in vs. logged-out state.
// translate-element sits here too, outside #authNav, so auth.js's re-renders
// never wipe the language switcher. `current` marks the site-nav link of the
// page being shown.
const SITE_NAV = [
  { id: 'employer', href: '/employer', text: 'Työnantajalle' },
  { id: 'verify', href: '/verify', text: 'Tarkasta todiste' },
]

export function header({ auth = true, current = '' } = {}) {
  return `<header class="topbar">
  <a class="brand" href="/">${BADGE_ICON}<span lang="fi">Opintotodiste</span></a>
  <div class="topbar-right">
    <nav class="site-nav" aria-label="Sivusto">${SITE_NAV.map(
      ({ id, href, text }) => `<a href="${href}"${id === current ? ' aria-current="page"' : ''}><span lang="fi">${text}</span></a>`
    ).join('')}</nav>
    ${auth ? '<nav id="authNav" class="auth-nav"></nav>' : ''}
    <translate-element persist src="/translations.json"></translate-element>
  </div>
</header>${
    auth
      ? `
<dialog id="authDialog">
  <div id="authDialogContent"></div>
</dialog>`
      : ''
  }`
}

// Rendered at the end of every page's <body>. `current` marks the link of the
// page being shown, as in header().
const FOOTER_LINKS = [{ id: 'policy', href: '/policy', text: 'Tietosuoja' }]

export function footer({ current = '' } = {}) {
  return `<footer class="site-footer">
  <nav aria-label="Alatunniste">${FOOTER_LINKS.map(
    ({ id, href, text }) => `<a href="${href}"${id === current ? ' aria-current="page"' : ''}><span lang="fi">${text}</span></a>`
  ).join('')}</nav>
</footer>`
}
