// /verify: prepares the veri-good element and, given ?url=, verifies that
// credential right away (shared item pages link here with their download
// URL). Only URLs on this site are taken, so a crafted link can't make the
// page fetch from elsewhere.
//
// Waits for the element's definition rather than its 'veri-good-is-ready'
// event, which fires while the bundle defines the element, possibly before
// this script runs.
customElements.whenDefined('veri-good').then(() => {
  const verifier = document.querySelector('veri-good')
  if (!verifier) return

  // 0.0.0-beta.7 pre-fills the input with a DCC sample credential's URL.
  const input = verifier.shadowRoot?.querySelector('#vc-paste')
  if (input) input.value = ''

  const param = new URLSearchParams(location.search).get('url')
  if (!param) return
  let url
  try {
    url = new URL(param, location.origin)
  } catch {
    return
  }
  if (url.origin !== location.origin) return
  verifier.verify(url.href)
})
