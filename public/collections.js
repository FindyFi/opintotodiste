const errorBox = document.getElementById('errorBox')
const loginPrompt = document.getElementById('loginPrompt')
const loginPromptBtn = document.getElementById('loginPromptBtn')
const newCollectionForm = document.getElementById('newCollectionForm')
const newCollectionName = document.getElementById('newCollectionName')
const collectionsContainer = document.getElementById('collectionsContainer')
const savedSection = document.getElementById('savedSection')
const savedContainer = document.getElementById('savedContainer')

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
const fetchSaved = () => requestJson('/saved-credentials').then((data) => data.credentials)
const requestWalletOffer = (credentialId) => requestJson(`/saved-credentials/${credentialId}/offer`, { method: 'POST' })
const removeItemRequest = (collectionId, credentialId) =>
  requestJson(`/collections/${collectionId}/items/${credentialId}`, { method: 'DELETE' })
const deleteSavedRequest = (credentialId) => requestJson(`/saved-credentials/${credentialId}`, { method: 'DELETE' })

function openShare(target) {
  Share.open(target).catch((err) => showError(err.message))
}

// One saved credential, in a collection or in the list of all saved ones.
// `remove` is the row's delete button: its label, confirmation and request.
function buildItemRow(item, remove) {
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
      WalletOffer.show([{ name, ...(await requestWalletOffer(item.id)) }])
    } catch (err) {
      showError(err.message)
    } finally {
      walletBtn.disabled = false
      walletBtn.classList.remove('busy')
    }
  })

  const shareBtn = el('button', { type: 'button', class: 'small' }, el('span', { lang: 'fi' }, 'Jaa'))
  shareBtn.addEventListener('click', () => openShare({ credentialId: item.id }))

  const removeBtn = el('button', { type: 'button', class: 'small ghost danger' }, el('span', { lang: 'fi' }, remove.label))
  removeBtn.addEventListener('click', async () => {
    if (!confirm(remove.confirm(name))) return
    try {
      await remove.request()
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
    if (!confirm(`Poistetaanko kokoelma "${collection.name}"? Sen linkit lakkaavat toimimasta. Todisteet pysyvät tallennettuina.`)) return
    try {
      await deleteCollectionRequest(collection.id)
      await refresh()
    } catch (err) {
      showError(err.message)
    }
  })

  const itemList = el('ul', { class: 'collection-items' })
  fetchItems(collection.id)
    .then((items) =>
      itemList.append(
        ...items.map((item) =>
          buildItemRow(item, {
            label: 'Poista kokoelmasta',
            confirm: (name) => `Poistetaanko "${name}" kokoelmasta? Se pysyy tallennettuna, ja sen omat linkit toimivat edelleen.`,
            request: () => removeItemRequest(collection.id, item.id),
          })
        )
      )
    )
    .catch((err) => showError(err.message))

  return el('li', { class: 'collection-card' }, [
    el('div', { class: 'collection-head' }, [
      el('div', { class: 'collection-title' }, [
        el('h2', {}, collection.name),
        el('span', { class: 'muted' }, [`${collection.itemCount} `, el('span', { lang: 'fi' }, 'kohdetta')]),
      ]),
      el('div', { class: 'collection-actions' }, [shareBtn, renameBtn, deleteBtn]),
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

function renderSaved(credentials) {
  savedContainer.replaceChildren()
  if (!credentials.length) {
    savedContainer.append(el('p', { class: 'empty', lang: 'fi' }, 'Ei tallennettuja todisteita vielä.'))
    return
  }
  savedContainer.append(
    el(
      'ul',
      { class: 'collection-items' },
      credentials.map((item) =>
        buildItemRow(item, {
          label: 'Poista',
          confirm: (name) => `Poistetaanko "${name}"? Se poistuu kaikista kokoelmista, ja sen linkit lakkaavat toimimasta.`,
          request: () => deleteSavedRequest(item.id),
        })
      )
    )
  )
}

async function refresh() {
  clearError()
  try {
    const [collections, saved] = await Promise.all([fetchCollections(), fetchSaved()])
    renderCollections(collections)
    renderSaved(saved)
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
    savedSection.hidden = true
    collectionsContainer.replaceChildren()
    return
  }
  loginPrompt.hidden = true
  newCollectionForm.hidden = false
  savedSection.hidden = false
  await refresh()
}

loginPromptBtn?.addEventListener('click', () => {
  Auth.ensureLoggedIn()
    .then(init)
    .catch(() => {})
})

document.addEventListener('DOMContentLoaded', init)
