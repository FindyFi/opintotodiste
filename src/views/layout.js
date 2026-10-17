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

// Everything in <head> except the <title>. Styles live in public/styles/:
// base.css everywhere, plus the sections a page names in `styles` (in order).
// Archivo is self-hosted from @fontsource-variable/archivo (see index.js).
export function head(title, styles = []) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
${title}
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
// never wipe the language switcher.
export function header({ auth = true } = {}) {
  return `<header class="topbar">
  <a class="brand" href="/">${BADGE_ICON}<span lang="fi">Opintotodiste</span></a>
  <div class="topbar-right">
    ${auth ? '<nav id="authNav" class="auth-nav"></nav>' : ''}
    <translate-element src="/translations.json"></translate-element>
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
