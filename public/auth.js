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
  if (!res.ok) throw responseError(data)
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

const PERSON_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>'

// #authNav is one fixed-width slot at the end of the top bar (see
// src/views/layout.js), so signing in or out never moves the other links.
// Signed out it holds "Kirjaudu sisään" (registering is offered inside the
// dialog); signed in, a button with the display name that opens the account
// menu. The menu is a disclosure (button + aria-expanded) and shows the full
// name, which the button may have to cut short.
async function renderAuthNav() {
  const nav = document.getElementById('authNav')
  if (!nav) return currentMe
  currentMe = await getMe().catch(() => ({ loggedIn: false }))
  document.documentElement.dataset.auth = currentMe.loggedIn ? 'in' : 'out'
  nav.replaceChildren()
  nav.onkeydown = nav.onfocusout = null

  if (!currentMe.loggedIn) {
    const loginBtn = el('button', { type: 'button', class: 'small' }, el('span', { lang: 'fi' }, 'Kirjaudu sisään'))
    loginBtn.addEventListener('click', () => openAuthFlow('login').catch(() => {}))
    nav.append(loginBtn)
    return currentMe
  }

  const icon = el('span', { class: 'account-icon' })
  icon.innerHTML = PERSON_ICON
  const accountBtn = el(
    'button',
    { type: 'button', class: 'account-btn', 'aria-expanded': 'false', 'aria-controls': 'accountMenu', title: currentMe.displayName },
    [icon, el('span', { class: 'account-name' }, currentMe.displayName)]
  )
  const menu = el('div', { id: 'accountMenu', class: 'account-menu', tabindex: '-1' })
  menu.hidden = true
  const setOpen = (open) => {
    menu.hidden = !open
    accountBtn.setAttribute('aria-expanded', String(open))
  }
  accountBtn.addEventListener('click', () => setOpen(menu.hidden))
  // Set as properties, not listeners: #authNav outlives each render.
  nav.onkeydown = (event) => {
    if (event.key !== 'Escape' || menu.hidden) return
    setOpen(false)
    accountBtn.focus()
  }
  nav.onfocusout = (event) => {
    if (!nav.contains(event.relatedTarget)) setOpen(false)
  }

  const errorBox = el('div', { class: 'row-error' })
  errorBox.hidden = true
  const item = (text, action) => {
    const btn = el('button', { type: 'button', class: 'link-btn' }, el('span', { lang: 'fi' }, text))
    btn.addEventListener('click', action)
    return el('li', {}, btn)
  }
  const exportItem = item('Lataa tietosi', async () => {
    const btn = exportItem.firstChild
    errorBox.hidden = true
    btn.disabled = true
    btn.classList.add('busy')
    try {
      await downloadAccountData()
      setOpen(false)
    } catch (err) {
      errorBox.replaceChildren(...errorContent(err))
      errorBox.hidden = false
    } finally {
      btn.disabled = false
      btn.classList.remove('busy')
    }
  })
  menu.append(
    el('p', { class: 'account-menu-name' }, currentMe.displayName),
    el('ul', {}, [
      item('Tili', () => {
        setOpen(false)
        openAccountDialog()
      }),
      exportItem,
      item('Kirjaudu ulos', async () => {
        await logout()
        await renderAuthNav()
      }),
    ]),
    errorBox
  )
  nav.append(accountBtn, menu)
  return currentMe
}

// A click anywhere outside the account menu closes it.
document.addEventListener('click', (event) => {
  const nav = document.getElementById('authNav')
  const menu = document.getElementById('accountMenu')
  if (!nav || !menu || menu.hidden || nav.contains(event.target)) return
  menu.hidden = true
  nav.querySelector('.account-btn')?.setAttribute('aria-expanded', 'false')
})

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
        nameInput = el('input', { type: 'text' })
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
          errorBox.replaceChildren(...errorContent(err))
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

// Fetched rather than linked, so a failure (signed out, server error) shows in
// the dialog instead of replacing the page with an error body.
async function downloadAccountData() {
  const res = await fetch('/auth/account/export')
  if (!res.ok) throw responseError(await res.json().catch(() => ({})))
  const url = URL.createObjectURL(await res.blob())
  const link = el('a', { href: url, download: 'opintotodiste-tiedot.json' })
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function deleteAccount() {
  const res = await fetch('/auth/account', { method: 'DELETE' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw responseError(data)
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

// The account dialog, opened from "Tili" in the account menu. Deleting asks
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
      errorBox.replaceChildren(...errorContent(err))
      errorBox.hidden = false
      deleteBtn.disabled = !confirmBox.checked
      deleteBtn.classList.remove('busy')
    }
  })

  const exportBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Lataa tietosi'))
  exportBtn.addEventListener('click', async () => {
    errorBox.hidden = true
    exportBtn.disabled = true
    exportBtn.classList.add('busy')
    try {
      await downloadAccountData()
    } catch (err) {
      errorBox.replaceChildren(...errorContent(err))
      errorBox.hidden = false
    } finally {
      exportBtn.disabled = false
      exportBtn.classList.remove('busy')
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
    el('h3', { lang: 'fi' }, 'Lataa tietosi'),
    el(
      'p',
      { lang: 'fi' },
      'Saat kopion kaikista tiliisi tallennetuista tiedoista JSON-tiedostona: pääsyavaimet, Koski-tiedot, tallennetut todisteet, kokoelmat ja jakolinkit.'
    ),
    el('p', {}, exportBtn),
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
