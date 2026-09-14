const errorBox = document.getElementById('errorBox')
const loginPrompt = document.getElementById('loginPrompt')
const loginPromptBtn = document.getElementById('loginPromptBtn')
const newCollectionForm = document.getElementById('newCollectionForm')
const newCollectionName = document.getElementById('newCollectionName')
const collectionsContainer = document.getElementById('collectionsContainer')

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

function showError(message) {
  errorBox.textContent = message
  errorBox.hidden = false
}

function clearError() {
  errorBox.hidden = true
  errorBox.textContent = ''
}

async function requestJson(url, options) {
  const res = await fetch(url, options)
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const fetchCollections = () => requestJson('/collections').then((data) => data.collections)
const createCollection = (name) =>
  requestJson('/collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
const renameCollection = (id, name) =>
  requestJson(`/collections/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
const deleteCollectionRequest = (id) => requestJson(`/collections/${id}`, { method: 'DELETE' })
const regenerateShareToken = (id) => requestJson(`/collections/${id}/share-token/regenerate`, { method: 'POST' })

function shareUrl(token) {
  return `${location.origin}/c/${token}`
}

function buildCollectionRow(collection) {
  const linkEl = el('a', { class: 'share-link', href: shareUrl(collection.shareToken) }, shareUrl(collection.shareToken))

  const copyBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Kopioi linkki'))
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(linkEl.href).catch(() => {})
  })

  const regenBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Uusi jakolinkki'))
  regenBtn.addEventListener('click', async () => {
    if (!confirm('Vanha jakolinkki lakkaa toimimasta. Jatketaanko?')) return
    try {
      const updated = await regenerateShareToken(collection.id)
      linkEl.textContent = shareUrl(updated.shareToken)
      linkEl.href = shareUrl(updated.shareToken)
    } catch (err) {
      showError(err.message)
    }
  })

  const renameBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Nimeä uudelleen'))
  renameBtn.addEventListener('click', async () => {
    const name = prompt('Uusi nimi', collection.name)
    if (!name || !name.trim() || name.trim() === collection.name) return
    try {
      await renameCollection(collection.id, name.trim())
      await refresh()
    } catch (err) {
      showError(err.message)
    }
  })

  const deleteBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Poista'))
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Poistetaanko kokoelma "${collection.name}"?`)) return
    try {
      await deleteCollectionRequest(collection.id)
      await refresh()
    } catch (err) {
      showError(err.message)
    }
  })

  return el('div', { class: 'collection-row' }, [
    el('span', { class: 'name' }, collection.name),
    el('span', { class: 'muted' }, `${collection.itemCount} `),
    el('span', { lang: 'fi' }, 'kohdetta'),
    linkEl,
    copyBtn,
    regenBtn,
    renameBtn,
    deleteBtn,
  ])
}

function renderCollections(collections) {
  collectionsContainer.replaceChildren()
  if (!collections.length) {
    collectionsContainer.append(el('p', { class: 'muted', lang: 'fi' }, 'Ei kokoelmia vielä.'))
    return
  }
  collections.forEach((c) => collectionsContainer.appendChild(buildCollectionRow(c)))
}

async function refresh() {
  clearError()
  try {
    renderCollections(await fetchCollections())
  } catch (err) {
    showError(err.message)
  }
}

newCollectionForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = newCollectionName.value.trim()
  if (!name) return
  try {
    await createCollection(name)
    newCollectionName.value = ''
    await refresh()
  } catch (err) {
    showError(err.message)
  }
})

async function init() {
  const me = await Auth.getMe()
  if (!me.loggedIn) {
    loginPrompt.hidden = false
    newCollectionForm.hidden = true
    collectionsContainer.replaceChildren()
    return
  }
  loginPrompt.hidden = true
  newCollectionForm.hidden = false
  await refresh()
}

loginPromptBtn?.addEventListener('click', () => {
  Auth.ensureLoggedIn()
    .then(init)
    .catch(() => {})
})

document.addEventListener('DOMContentLoaded', init)
