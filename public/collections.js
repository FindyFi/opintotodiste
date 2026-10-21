const errorBox = document.getElementById('errorBox')
const loginPrompt = document.getElementById('loginPrompt')
const loginPromptBtn = document.getElementById('loginPromptBtn')
const newCollectionForm = document.getElementById('newCollectionForm')
const newCollectionName = document.getElementById('newCollectionName')
const collectionsContainer = document.getElementById('collectionsContainer')
const sharedSection = document.getElementById('sharedSection')
const sharedContainer = document.getElementById('sharedContainer')
const detailDialog = document.getElementById('detailDialog')

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

// `message`: text, or nodes (Detail.errorContent).
function showError(message) {
  errorBox.replaceChildren(...[].concat(message))
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
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { link: data.link, lang: data.lang })
  return data
}

const fetchCollections = () => requestJson('/collections').then((data) => data.collections)
const createCollection = (name) =>
  requestJson('/collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
const renameCollection = (id, name) =>
  requestJson(`/collections/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
const deleteCollectionRequest = (id) => requestJson(`/collections/${id}`, { method: 'DELETE' })
const fetchItems = (id) => requestJson(`/collections/${id}/items`).then((data) => data.items)
const fetchLinks = () => requestJson('/share-links').then((data) => data.links)
const requestWalletOffer = (credentialId) => requestJson(`/saved-credentials/${credentialId}/offer`, { method: 'POST' })
const removeItemRequest = (collectionId, credentialId) =>
  requestJson(`/collections/${collectionId}/items/${credentialId}`, { method: 'DELETE' })
const deleteSavedRequest = (credentialId) => requestJson(`/saved-credentials/${credentialId}`, { method: 'DELETE' })

// The links may change in the dialog, so the "Jaetut todisteet" list is
// refreshed once it closes.
function openShare(target) {
  Share.open(target)
    .then(() => detailDialog.addEventListener('close', refresh, { once: true }))
    .catch((err) => showError(err.message))
}

const deleteConfirmation = (name) =>
  t(
    `Poistetaanko "${name}"? Se poistuu kaikista kokoelmista, ja sen linkit lakkaavat toimimasta.`,
    `Delete "${name}"? It is removed from all collections, and its links stop working.`
  )

// The detail dialog's actions for a stored credential (the same as on the main
// page). Poista deletes it everywhere; the row's own button only takes it out
// of the collection.
function detailActions(item, name) {
  return [
    { label: 'Lataa', run: async () => el('a', { href: `/saved-credentials/${item.id}/download`, download: '' }).click() },
    { label: 'Jaa', run: async () => openShare({ credentialId: item.id }) },
    { label: 'Lisää lompakkoon', run: async () => WalletOffer.show([{ name, ...(await requestWalletOffer(item.id)) }]), primary: true },
    {
      label: 'Poista',
      danger: true,
      run: async () => {
        if (!confirm(deleteConfirmation(name))) return
        await deleteSavedRequest(item.id)
        detailDialog.close()
        await refresh()
      },
    },
  ]
}

// One credential in a collection. `remove` is the row's remove button: its
// label, confirmation and request.
function buildItemRow(item, remove) {
  const achievement = item.credential?.credentialSubject?.achievement || {}
  const name = achievement.name || ''
  const meta = [achievement.achievementType, achievement.creator?.name].filter(Boolean).join(' · ')

  const nameBtn = el('button', { class: 'credential-name', type: 'button' }, name)
  nameBtn.addEventListener('click', () => Detail.open(item.credential, detailActions(item, name)))

  const walletBtn = el('button', { type: 'button', class: 'small primary' }, el('span', { lang: 'fi' }, 'Lisää lompakkoon'))
  walletBtn.addEventListener('click', async () => {
    walletBtn.disabled = true
    walletBtn.classList.add('busy')
    try {
      WalletOffer.show([{ name, ...(await requestWalletOffer(item.id)) }])
    } catch (err) {
      showError(Detail.errorContent(err))
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
    Detail.credentialIcon(achievement),
    el('div', { class: 'credential-body' }, [nameBtn, el('span', { class: 'credential-meta' }, meta)]),
    el('div', { class: 'credential-status' }, [removeBtn, shareBtn, walletBtn]),
  ])
}

function buildCollectionRow(collection) {
  const shareBtn = el('button', { type: 'button', class: 'small primary' }, el('span', { lang: 'fi' }, 'Jaa'))
  shareBtn.addEventListener('click', () => openShare({ collectionId: collection.id }))

  const renameBtn = el('button', { type: 'button', class: 'small ghost' }, el('span', { lang: 'fi' }, 'Nimeä uudelleen'))
  renameBtn.addEventListener('click', async () => {
    const name = prompt(t('Uusi nimi', 'New name'), collection.name)
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
    if (!confirm(
        t(
          `Poistetaanko kokoelma "${collection.name}"? Sen linkit lakkaavat toimimasta. Todisteet säilyvät.`,
          `Delete the collection "${collection.name}"? Its links stop working. The credentials stay.`
        )
      )) return
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
            confirm: (name) =>
              t(
                `Poistetaanko "${name}" kokoelmasta? Todiste säilyy, ja sen omat linkit toimivat edelleen.`,
                `Remove "${name}" from the collection? The credential stays, and its own links keep working.`
              ),
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

// Each shared credential or collection once, with the recipients of its links.
function renderShared(links) {
  sharedContainer.replaceChildren()
  const groups = new Map()
  for (const link of links) {
    const key = link.target.collectionId ?? link.target.credentialId
    if (!groups.has(key)) groups.set(key, { target: link.target, name: link.targetName, labels: [] })
    groups.get(key).labels.push(link.label)
  }
  if (!groups.size) {
    sharedContainer.append(el('p', { class: 'empty', lang: 'fi' }, 'Et ole vielä jakanut todisteita.'))
    return
  }
  const rows = [...groups.values()].map(({ target, name, labels }) => {
    const shareBtn = el('button', { type: 'button', class: 'small' }, el('span', { lang: 'fi' }, 'Jaa'))
    shareBtn.addEventListener('click', () => openShare(target))
    const kind = target.collectionId ? el('span', { lang: 'fi' }, 'Kokoelma') : el('span', { lang: 'fi' }, 'Todiste')
    return el('li', { class: 'credential' }, [
      el('div', { class: 'credential-body' }, [
        el('strong', {}, name),
        el('span', { class: 'credential-meta' }, [kind, ' · ', el('span', { lang: 'fi' }, 'Linkit:'), ' ', labels.join(', ')]),
      ]),
      el('div', { class: 'credential-status' }, [shareBtn]),
    ])
  })
  sharedContainer.append(el('ul', { class: 'collection-items' }, rows))
}

async function refresh() {
  clearError()
  try {
    const [collections, links] = await Promise.all([fetchCollections(), fetchLinks()])
    renderCollections(collections)
    renderShared(links)
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
    sharedSection.hidden = true
    collectionsContainer.replaceChildren()
    return
  }
  loginPrompt.hidden = true
  newCollectionForm.hidden = false
  sharedSection.hidden = false
  await refresh()
}

loginPromptBtn?.addEventListener('click', () => {
  Auth.ensureLoggedIn()
    .then(init)
    .catch(() => {})
})

document.addEventListener('DOMContentLoaded', init)
