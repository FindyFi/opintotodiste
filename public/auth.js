// Shared across every page that includes the header partial (see
// src/views/layout.js's header()): owns #authNav (logged-in/out state) and
// #authDialog (the login/register prompt), and exposes window.Auth for
// other page scripts (app.js, collections.js) to drive login from their own
// flows - e.g. app.js's "Add to collection" bulk action calls
// Auth.ensureLoggedIn() before it lets you pick a collection.

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value
    else if (key === 'onclick') node.addEventListener('click', value)
    else node.setAttribute(key, value)
  })
  ;[].concat(children).forEach((child) => {
    node.append(child instanceof Node ? child : document.createTextNode(child))
  })
  return node
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function getMe() {
  const res = await fetch('/auth/me')
  return res.json()
}

async function registerPasskey(displayName) {
  const options = await postJson('/auth/register/options', { displayName })
  const attestation = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options })
  return postJson('/auth/register/verify', attestation)
}

async function loginWithPasskey() {
  const options = await postJson('/auth/login/options', {})
  const assertion = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options })
  return postJson('/auth/login/verify', assertion)
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' })
}

let currentMe = { loggedIn: false }

async function renderAuthNav() {
  const nav = document.getElementById('authNav')
  if (!nav) return currentMe
  currentMe = await getMe().catch(() => ({ loggedIn: false }))
  nav.replaceChildren()

  if (currentMe.loggedIn) {
    const logoutBtn = el('button', { type: 'button', class: 'small' }, el('span', { lang: 'fi' }, 'Kirjaudu ulos'))
    logoutBtn.addEventListener('click', async () => {
      await logout()
      await renderAuthNav()
    })
    const accountBtn = el('button', { type: 'button', class: 'link-btn account-btn' }, currentMe.displayName)
    accountBtn.addEventListener('click', openAccountDialog)
    nav.append(el('a', { href: '/my/collections', lang: 'fi' }, 'Kokoelmani'), accountBtn, logoutBtn)
  } else {
    const loginBtn = el('button', { type: 'button', class: 'small' }, el('span', { lang: 'fi' }, 'Kirjaudu sisään'))
    loginBtn.addEventListener('click', () => openAuthFlow('login').catch(() => {}))
    const registerBtn = el('button', { type: 'button', class: 'small ghost' }, el('span', { lang: 'fi' }, 'Rekisteröi pääsyavain'))
    registerBtn.addEventListener('click', () => openAuthFlow('register').catch(() => {}))
    nav.append(registerBtn, loginBtn)
  }
  return currentMe
}

// Opens the login/register dialog and resolves once the user is signed in,
// or rejects if they cancel. initialMode picks which form shows first; a
// link inside the dialog lets them switch between the two.
function openAuthFlow(initialMode) {
  return new Promise((resolve, reject) => {
    const dialog = document.getElementById('authDialog')
    const content = document.getElementById('authDialogContent')
    if (!dialog || !content) return reject(new Error('Login is not available on this page.'))

    let mode = initialMode
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      dialog.close()
      fn(value)
    }

    function render() {
      const errorBox = el('div', { class: 'row-error' })
      errorBox.hidden = true
      let nameInput = null

      const fields = []
      if (mode === 'register') {
        nameInput = el('input', { type: 'text', placeholder: 'Nimesi', lang: 'fi' })
        fields.push(el('p', {}, [el('label', { class: 'field' }, [el('span', { lang: 'fi' }, 'Näyttönimi:'), nameInput])]))
      }

      const submitBtn = el(
        'button',
        { type: 'button', class: 'primary' },
        el('span', { lang: 'fi' }, mode === 'register' ? 'Rekisteröi pääsyavain' : 'Kirjaudu sisään')
      )
      submitBtn.addEventListener('click', async () => {
        errorBox.hidden = true
        submitBtn.disabled = true
        submitBtn.classList.add('busy')
        try {
          if (mode === 'register') await registerPasskey(nameInput.value.trim())
          else await loginWithPasskey()
          const me = await renderAuthNav()
          finish(resolve, me)
        } catch (err) {
          errorBox.textContent = err.message
          errorBox.hidden = false
          submitBtn.disabled = false
          submitBtn.classList.remove('busy')
        }
      })

      const switchBtn = el(
        'button',
        { type: 'button', class: 'link-btn' },
        el(
          'span',
          { lang: 'fi' },
          mode === 'register' ? 'Onko sinulla jo pääsyavain? Kirjaudu sisään.' : 'Ei vielä pääsyavainta? Rekisteröidy.'
        )
      )
      switchBtn.addEventListener('click', () => {
        mode = mode === 'register' ? 'login' : 'register'
        render()
      })

      const cancelBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Peruuta'))
      cancelBtn.addEventListener('click', () => finish(reject, new Error('cancelled')))

      content.replaceChildren(
        el('h2', { lang: 'fi' }, mode === 'register' ? 'Rekisteröi pääsyavain' : 'Kirjaudu sisään'),
        ...fields,
        errorBox,
        el('p', {}, [submitBtn, cancelBtn]),
        el('p', {}, switchBtn)
      )
    }

    // Covers every way the dialog can close: our own buttons (already
    // settled by then, so this is a no-op), the Esc key, or any other
    // native dismissal.
    dialog.addEventListener('close', () => finish(reject, new Error('cancelled')), { once: true })
    render()
    dialog.showModal()
  })
}

async function deleteAccount() {
  const res = await fetch('/auth/account', { method: 'DELETE' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// Asks the browser's passkey provider to drop the passkey, where the WebAuthn
// Signal API exists (Chrome and others); elsewhere the user removes it by hand.
async function forgetPasskey(passkey) {
  if (!passkey || typeof PublicKeyCredential?.signalAllAcceptedCredentials !== 'function') return
  await PublicKeyCredential.signalAllAcceptedCredentials({
    rpId: passkey.rpId,
    userId: passkey.userId,
    allAcceptedCredentialIds: [],
  }).catch(() => {})
}

// The account dialog, opened from the display name in #authNav. Deleting asks
// for an explicit confirmation (the checkbox) and then lands on the main page,
// signed out.
function openAccountDialog() {
  const dialog = document.getElementById('authDialog')
  const content = document.getElementById('authDialogContent')
  if (!dialog || !content) return

  const errorBox = el('div', { class: 'row-error' })
  errorBox.hidden = true
  const confirmBox = el('input', { type: 'checkbox' })
  const deleteBtn = el('button', { type: 'button', class: 'danger' }, el('span', { lang: 'fi' }, 'Poista tili pysyvästi'))
  deleteBtn.disabled = true
  confirmBox.addEventListener('change', () => {
    deleteBtn.disabled = !confirmBox.checked
  })
  deleteBtn.addEventListener('click', async () => {
    errorBox.hidden = true
    deleteBtn.disabled = true
    deleteBtn.classList.add('busy')
    try {
      const { passkey } = await deleteAccount()
      await forgetPasskey(passkey)
      location.href = '/'
    } catch (err) {
      errorBox.textContent = err.message
      errorBox.hidden = false
      deleteBtn.disabled = !confirmBox.checked
      deleteBtn.classList.remove('busy')
    }
  })

  const closeBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Sulje'))
  closeBtn.addEventListener('click', () => dialog.close())

  const passkeyCount = currentMe.passkeys?.length ?? 0
  content.replaceChildren(
    el('h2', { lang: 'fi' }, 'Tili'),
    el('dl', {}, [
      el('dt', { lang: 'fi' }, 'Näyttönimi'),
      el('dd', {}, currentMe.displayName),
      el('dt', { lang: 'fi' }, 'Pääsyavaimia'),
      el('dd', {}, String(passkeyCount)),
    ]),
    el('h3', { lang: 'fi' }, 'Poista tili'),
    el(
      'p',
      { lang: 'fi' },
      'Tili, sen pääsyavaimet ja kaikki kokoelmasi poistetaan. Kokoelmien ja todisteiden jakolinkit lakkaavat toimimasta. Lompakkoon lisätyt ja ladatut todisteet säilyvät, koska ne ovat sinulla. Poistoa ei voi perua.'
    ),
    el(
      'p',
      { lang: 'fi' },
      'Pääsyavain voi jäädä laitteesi salasanojen hallintaan. Voit poistaa sen sieltä itse.'
    ),
    el('p', {}, el('label', {}, [confirmBox, el('span', { lang: 'fi' }, 'Ymmärrän, että poistoa ei voi perua.')])),
    errorBox,
    el('p', {}, [deleteBtn, closeBtn])
  )
  dialog.showModal()
}

function ensureLoggedIn() {
  if (currentMe.loggedIn) return Promise.resolve(currentMe)
  return openAuthFlow('login')
}

window.Auth = { getMe, ensureLoggedIn, logout, renderAuthNav }

document.addEventListener('DOMContentLoaded', renderAuthNav)
