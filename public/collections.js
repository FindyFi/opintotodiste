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
const fetchItems = (id) => requestJson(`/collections/${id}/items`).then((data) => data.items)
const requestWalletOffer = (collectionId, itemId) =>
  requestJson(`/collections/${collectionId}/items/${itemId}/offer`, { method: 'POST' })
const removeItemRequest = (collectionId, itemId) =>
  requestJson(`/collections/${collectionId}/items/${itemId}`, { method: 'DELETE' })
const regenerateShareToken = (id) => requestJson(`/collections/${id}/share-token/regenerate`, { method: 'POST' })

function openShare(target) {
  Share.open(target).catch((err) => showError(err.message))
}

function buildItemRow(collection, item) {
  const achievement = item.credential?.credentialSubject?.achievement || {}
  const name = achievement.name || ''
  const meta = [achievement.achievementType, achievement.creator?.name].filter(Boolean).join(' · ')

  const nameBtn = el('button', { class: 'credential-name', type: 'button' }, name)
  nameBtn.addEventListener('click', () => Detail.open(item.credential))

  const walletBtn = el('button', { type: 'button', class: 'small primary' }, el('span', { lang: 'fi' }, 'Lisää lompakkoon'))
  walletBtn.addEventListener('click', async () => {
    walletBtn.disabled = true
    walletBtn.classList.add('busy')
    try {
      WalletOffer.show([{ name, ...(await requestWalletOffer(collection.id, item.id)) }])
    } catch (err) {
      showError(err.message)
    } finally {
      walletBtn.disabled = false
      walletBtn.classList.remove('busy')
    }
  })

  const shareBtn = el('button', { type: 'button', class: 'small' }, el('span', { lang: 'fi' }, 'Jaa'))
  shareBtn.addEventListener('click', () => openShare({ collectionId: collection.id, itemId: item.id }))

  const removeBtn = el('button', { type: 'button', class: 'small ghost danger' }, el('span', { lang: 'fi' }, 'Poista'))
  removeBtn.addEventListener('click', async () => {
    if (!confirm(`Poistetaanko "${name}" kokoelmasta? Sen jakolinkki lakkaa toimimasta.`)) return
    try {
      await removeItemRequest(collection.id, item.id)
      await refresh()
    } catch (err) {
      showError(err.message)
    }
  })

  return el('li', { class: 'credential' }, [
    Detail.badgeIcon(Detail.isMajor(achievement)),
    el('div', { class: 'credential-body' }, [nameBtn, el('span', { class: 'credential-meta' }, meta)]),
    el('div', { class: 'credential-status' }, [removeBtn, shareBtn, walletBtn]),
  ])
}

function buildCollectionRow(collection) {
  const shareBtn = el('button', { type: 'button', class: 'small primary' }, el('span', { lang: 'fi' }, 'Jaa'))
  shareBtn.addEventListener('click', () => openShare({ collectionId: collection.id }))

  const regenBtn = el('button', { type: 'button', class: 'small ghost' }, el('span', { lang: 'fi' }, 'Uusi jakolinkki'))
  regenBtn.addEventListener('click', async () => {
    if (!confirm('Vanha jakolinkki lakkaa toimimasta. Jatketaanko?')) return
    try {
      await regenerateShareToken(collection.id)
      openShare({ collectionId: collection.id })
    } catch (err) {
      showError(err.message)
    }
  })

  const renameBtn = el('button', { type: 'button', class: 'small ghost' }, el('span', { lang: 'fi' }, 'Nimeä uudelleen'))
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

  const deleteBtn = el('button', { type: 'button', class: 'small ghost danger' }, el('span', { lang: 'fi' }, 'Poista'))
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Poistetaanko kokoelma "${collection.name}"?`)) return
    try {
      await deleteCollectionRequest(collection.id)
      await refresh()
    } catch (err) {
      showError(err.message)
    }
  })

  const itemList = el('ul', { class: 'collection-items' })
  fetchItems(collection.id)
    .then((items) => itemList.append(...items.map((item) => buildItemRow(collection, item))))
    .catch((err) => showError(err.message))

  return el('li', { class: 'collection-card' }, [
    el('div', { class: 'collection-head' }, [
      el('div', { class: 'collection-title' }, [
        el('h2', {}, collection.name),
        el('span', { class: 'muted' }, [`${collection.itemCount} `, el('span', { lang: 'fi' }, 'kohdetta')]),
      ]),
      el('div', { class: 'collection-actions' }, [shareBtn, regenBtn, renameBtn, deleteBtn]),
    ]),
    itemList,
  ])
}

function renderCollections(collections) {
  collectionsContainer.replaceChildren()
  if (!collections.length) {
    collectionsContainer.append(el('p', { class: 'empty', lang: 'fi' }, 'Ei kokoelmia vielä.'))
    return
  }
  collectionsContainer.append(el('ul', { class: 'collection-list' }, collections.map(buildCollectionRow)))
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
