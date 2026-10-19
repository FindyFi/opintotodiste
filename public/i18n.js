// Text that JavaScript writes outside the page's own markup: native dialogs
// (confirm, prompt), which translate-element can't reach. The language is read
// when the dialog opens, so it follows whatever the switcher last set.
function t(fi, en) {
  return document.documentElement.lang === 'en' ? en : fi
}
