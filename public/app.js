const form = document.getElementById('koskiForm')
const koskiUrlInput = document.getElementById('koskiUrlInput')
const demoOffer = document.getElementById('demoOffer')
const demoBtn = document.getElementById('demoBtn')
const submitBtn = document.getElementById('submitBtn')
const errorBox = document.getElementById('errorBox')
const metaBox = document.getElementById('metaBox')
const resultsPanel = document.getElementById('resultsPanel')
const tableContainer = document.getElementById('tableContainer')
const bulkBar = document.getElementById('bulkBar')
const bulkCount = document.getElementById('bulkCount')
const bulkWalletBtn = document.getElementById('bulkWalletBtn')
const bulkCollectionBtn = document.getElementById('bulkCollectionBtn')
const bulkShareBtn = document.getElementById('bulkShareBtn')
const bulkClearBtn = document.getElementById('bulkClearBtn')
const detailDialog = document.getElementById('detailDialog')
const detailDialogContent = document.getElementById('detailDialogContent')
const clearDataBtn = document.getElementById('clearDataBtn')

const COLUMNS = [
  { key: 'name', label: 'Nimi' },
  { key: 'type', label: 'Tyyppi' },
  { key: 'issuer', label: 'Myöntäjä' },
  { key: 'awarded', label: 'Myönnetty' },
]

// The page's one list (see credentialsResponse in index.js): each entry is a
// record converted from the Koski data (`ref`), with its saved copy's
// `credentialId` once it has been signed for a signed-in user, or a saved
// credential no record matches (`credentialId` only).
let credentials = []
const sortState = { key: null, direction: 1 }
// Selection survives filtering: rows a filter hides stay selected, so a user
// can gather a batch from several filtered views.
const selectedIndices = new Set()

function showError(message) {
  errorBox.textContent = message
  errorBox.hidden = false
}

function clearError() {
  errorBox.hidden = true
  errorBox.textContent = ''
}

function setMeta(personName, koskiUrl, demo) {
  if (demo) {
    metaBox.replaceChildren(personName ? personName + ' · ' : '', el('span', { lang: 'fi' }, 'Esittelytiedot (kuvitteellinen henkilö)'))
    metaBox.hidden = false
    return
  }
  if (!koskiUrl) {
    metaBox.hidden = true
    return
  }
  metaBox.replaceChildren()
  if (personName) {
    metaBox.append(personName + ' · ')
  }
  metaBox.append(el('span', { lang: 'fi' }, 'Lähde:'), ' ')
  const a = document.createElement('a')
  a.href = koskiUrl
  a.textContent = koskiUrl
  metaBox.appendChild(a)
  metaBox.hidden = false
}

// Builds a DOM element. Props go through setAttribute (so `lang: 'fi'` marks
// a node for the translate-element web component to pick up and translate);
// `class` and `onclick` are handled specially since those aren't meant as
// plain attribute strings.
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

const SVG_NS = 'http://www.w3.org/2000/svg'

// Builds an inline stroke icon from [tag, attributes] pairs.
function svgIcon(shapes, size = 24, strokeWidth = 2) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  Object.entries({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }).forEach(([key, value]) => svg.setAttribute(key, value))
  shapes.forEach(([tag, attrs]) => {
    const shape = document.createElementNS(SVG_NS, tag)
    Object.entries(attrs).forEach(([key, value]) => shape.setAttribute(key, value))
    svg.appendChild(shape)
  })
  return svg
}

const checkIcon = () => svgIcon([['path', { d: 'M5 12.5 10 17l9-10' }]], 16, 2.4)

// Koski dates (YYYY-MM-DD) and stored credentials' timestamps are shown in the
// UI language's own format, while sorting keeps using the raw ISO string.
const formatDate = (iso) => Detail.formatDate(iso)

function columnValue(record, key) {
  const achievement = record.credentialSubject.achievement
  switch (key) {
    case 'name':
      return achievement.name ?? ''
    case 'type':
      return achievement.achievementType ?? ''
    case 'issuer':
      return achievement.creator?.name ?? ''
    case 'awarded':
      return record.awardedOn ?? ''
    default:
      return ''
  }
}

// The date a record was awarded as YYYY-MM-DD in local time, so a fetched
// record's date-only value and a signed copy's timestamp filter alike.
function awardedDay(record) {
  const iso = record.awardedOn
  if (!iso || !iso.includes('T')) return iso ?? ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const filterValue = (record, key) => (key === 'awarded' ? awardedDay(record) : columnValue(record, key))

const listFilter = ListFilter.create({
  fields: [
    { key: 'type', label: 'tyyppi' },
    { key: 'issuer', label: 'myöntäjä' },
    { key: 'awarded', label: 'myönnetty', format: formatDate },
  ],
  onChange: () => {
    if (!resultsPanel.hidden) renderTable()
  },
})

// The rows on show: the filtered list, sorted.
function sortedEntries() {
  const entries = credentials
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => listFilter.matches((key) => filterValue(record, key)))
  if (!sortState.key) return entries
  const { key, direction } = sortState
  return entries.sort(
    (a, b) => direction * String(columnValue(a.record, key)).localeCompare(String(columnValue(b.record, key)), 'fi', { sensitivity: 'base' })
  )
}

function buildToolbar() {
  const visibleIndices = sortedEntries().map(({ index }) => index)
  const selectAllCb = el('input', { type: 'checkbox' })
  selectAllCb.checked = visibleIndices.length > 0 && visibleIndices.every((i) => selectedIndices.has(i))
  selectAllCb.indeterminate = !selectAllCb.checked && visibleIndices.some((i) => selectedIndices.has(i))
  selectAllCb.addEventListener('change', () => {
    visibleIndices.forEach((i) => (selectAllCb.checked ? selectedIndices.add(i) : selectedIndices.delete(i)))
    renderTable()
  })

  const sortButtons = COLUMNS.map(({ key, label }) => {
    const active = sortState.key === key
    const arrow = el('span', { class: 'arrow', 'aria-hidden': 'true' }, active && sortState.direction === -1 ? '▼' : '▲')
    const btn = el('button', { type: 'button', class: 'sort-btn small ghost', 'aria-pressed': String(active) }, [
      el('span', { lang: 'fi' }, label),
      arrow,
    ])
    btn.addEventListener('click', () => {
      sortState.direction = sortState.key === key ? sortState.direction * -1 : 1
      sortState.key = key
      renderTable()
    })
    return btn
  })

  return el('div', { class: 'list-toolbar' }, [
    ...[listFilter.bar()].filter(Boolean),
    el('label', { class: 'select-all' }, [selectAllCb, el('span', { lang: 'fi' }, 'Valitse kaikki')]),
    el('div', { class: 'sort-control', role: 'group', 'aria-label': 'Järjestä' }, [el('span', { lang: 'fi' }, 'Järjestä:'), ...sortButtons]),
  ])
}

function renderTable() {
  resultsPanel.hidden = false
  tableContainer.replaceChildren()

  if (!credentials.length) {
    tableContainer.append(el('p', { class: 'empty', lang: 'fi' }, 'Koski-tiedoista ei löytynyt osaamismerkkikelpoisia suorituksia.'))
    updateBulkBar()
    return
  }

  listFilter.prune((key, value) => credentials.some((record) => filterValue(record, key) === value))
  const entries = sortedEntries()
  const list = el('ul', { class: 'credential-list' })
  entries.forEach(({ record, index }) => {
    list.appendChild(buildRow(record, index))
  })

  tableContainer.append(buildToolbar(), list)
  if (!entries.length) tableContainer.append(el('p', { class: 'empty', lang: 'fi' }, 'Mikään todiste ei vastaa suodatusta.'))
  updateBulkBar()
}

function buildRow(record, index) {
  const achievement = record.credentialSubject.achievement
  const nameBtn = el('button', { class: 'credential-name', type: 'button' }, achievement.name)
  nameBtn.addEventListener('click', () => Detail.open(record, detailActions(record)))

  const rowCb = el('input', { type: 'checkbox', 'aria-label': achievement.name ?? '' })
  rowCb.checked = selectedIndices.has(index)
  rowCb.addEventListener('change', () => {
    if (rowCb.checked) selectedIndices.add(index)
    else selectedIndices.delete(index)
    renderTable()
  })

  // Each part of the meta line filters the list to rows with the same value.
  const meta = [
    achievement.achievementType && listFilter.link('type', achievement.achievementType),
    achievement.creator?.name && listFilter.link('issuer', achievement.creator.name),
    record.awardedOn && listFilter.link('awarded', awardedDay(record), formatDate(record.awardedOn)),
  ]
    .filter(Boolean)
    .flatMap((part, i) => (i ? [' · ', part] : [part]))

  return el('li', { class: 'credential' }, [
    rowCb,
    Detail.badgeIcon(Detail.isMajor(achievement)),
    el('div', { class: 'credential-body' }, [nameBtn, el('span', { class: 'credential-meta' }, meta)]),
    el('div', { class: 'credential-status' }, buildStatusCell(record)),
  ])
}

function buildStatusCell(record) {
  if (!record.signed) return []
  return [
    el('span', { class: 'badge signed' }, [checkIcon(), el('span', { lang: 'fi' }, 'Allekirjoitettu')]),
    el('a', { href: downloadUrl(record), lang: 'fi' }, 'Lataa'),
  ]
}

const downloadUrl = (entry) =>
  entry.credentialId ? `/saved-credentials/${entry.credentialId}/download` : `/credentials/${entry.ref}/download`

const entryName = (entry) => columnValue(entry, 'name')

// Reloads the list from the server, e.g. once an action has stored a record
// (its row now carries the stored copy's id) or after signing in or out.
async function reloadList() {
  const res = await fetch('/credentials')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  showList(data)
}

function showList(data) {
  credentials = data.credentials ?? []
  selectedIndices.clear()
  setMeta(data.personName, data.koskiUrl, data.demo)
  demoOffer.hidden = Boolean(data.koskiUrl || data.demo)
  if (credentials.length || data.koskiUrl || data.demo) renderTable()
  else {
    resultsPanel.hidden = true
    updateBulkBar()
  }
}

// The detail dialog's actions for one entry. Each stores a signed-in user's
// record behind the scenes.
function detailActions(entry) {
  return [
    { label: 'Lataa', run: () => download(entry) },
    { label: 'Jaa', run: () => shareOne(entry) },
    { label: 'Lisää lompakkoon', run: () => walletOne(entry), primary: true },
    { label: 'Poista', run: () => deleteEntry(entry), danger: true },
  ]
}

async function download(entry) {
  let url = downloadUrl(entry)
  if (!entry.credentialId) {
    const data = await postJson(`/credentials/${entry.ref}/sign`)
    if (data.credentialId) url = downloadUrl({ credentialId: data.credentialId })
  }
  el('a', { href: url, download: '' }).click()
  await reloadList()
}

// Shares one credential on its own, storing it first if needed.
async function shareOne(entry) {
  await Auth.ensureLoggedIn()
  let credentialId = entry.credentialId
  if (!credentialId) {
    const [result] = (await postJson('/saved-credentials', { refs: [entry.ref] })).results
    if (result.error) throw new Error(result.error)
    credentialId = result.credentialId
  }
  await reloadList()
  await Share.open({ credentialId })
}

const requestOffer = (entry) =>
  postJson(entry.credentialId ? `/saved-credentials/${entry.credentialId}/offer` : `/credentials/${entry.ref}/offer`)

async function walletOne(entry) {
  const offer = await requestOffer(entry)
  WalletOffer.show([{ name: entryName(entry), ...offer }])
  if (offer.credentialId) await reloadList()
}

async function deleteRequest(url) {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
}

// A saved copy is deleted everywhere, links included; the record leaves the
// list, and the next import brings it back.
async function deleteEntry(entry) {
  const name = entryName(entry)
  const question = entry.credentialId
    ? t(
        `Poistetaanko "${name}"? Se poistuu kaikista kokoelmista, ja sen linkit lakkaavat toimimasta.`,
        `Delete "${name}"? It is removed from all collections, and its links stop working.`
      )
    : t(
        `Poistetaanko "${name}" listalta? Se palaa, kun haet Koski-tiedot uudelleen.`,
        `Remove "${name}" from the list? It comes back when you fetch your Koski data again.`
      )
  if (!confirm(question)) return
  if (entry.credentialId) await deleteRequest(`/saved-credentials/${entry.credentialId}`)
  if (entry.ref) await deleteRequest(`/credentials/${entry.ref}`)
  detailDialog.close()
  await reloadList()
}

// The selected entries as request fields: saved credentials by id, records
// not signed yet by ref.
function selectedRefs() {
  const entries = [...selectedIndices].sort((a, b) => a - b).map((i) => credentials[i])
  return {
    entries,
    refs: entries.filter((e) => !e.credentialId).map((e) => e.ref),
    credentialIds: entries.filter((e) => e.credentialId).map((e) => e.credentialId),
  }
}

// The selection bar is only there while something is selected (the buttons
// can't be clicked with nothing selected, so there is nothing to enable).
function updateBulkBar() {
  const count = selectedIndices.size
  bulkBar.hidden = count === 0
  bulkCount.replaceChildren(String(count) + ' ', el('span', { lang: 'fi' }, 'valittu'), el('span', { lang: 'en' }, 'selected'))
  bulkWalletBtn.disabled = count === 0
  bulkCollectionBtn.disabled = count === 0
  bulkShareBtn.disabled = count === 0
}

bulkClearBtn.addEventListener('click', () => {
  selectedIndices.clear()
  renderTable()
})

async function bulkAddToWallet() {
  const { entries } = selectedRefs()
  if (!entries.length) return

  bulkWalletBtn.disabled = true
  bulkWalletBtn.classList.add('busy')
  const results = []
  for (const entry of entries) {
    const name = entryName(entry)
    try {
      results.push({ name, ...(await requestOffer(entry)) })
    } catch (err) {
      results.push({ name, error: err.message })
    }
  }
  bulkWalletBtn.classList.remove('busy')
  await reloadList().catch((err) => showError(err.message))
  WalletOffer.show(results)
}

bulkWalletBtn.addEventListener('click', bulkAddToWallet)

// Reuses the same <dialog id="detailDialog"> a third way (also used for the
// credential detail view and for WalletOffer.show()). Resolves with the
// chosen/created collection id, or null if the user cancelled.
function pickOrCreateCollection() {
  return new Promise(async (resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      detailDialog.close()
      resolve(value)
    }

    let collections
    try {
      const res = await fetch('/collections')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load collections')
      collections = data.collections
    } catch (err) {
      showError(err.message)
      finish(null)
      return
    }

    const choices = el('div')
    collections.forEach((c, i) => {
      const input = el('input', { type: 'radio', name: 'collectionChoice', value: c.id })
      if (i === 0) input.checked = true
      choices.append(el('p', {}, el('label', {}, [input, c.name, el('span', { class: 'muted' }, `(${c.itemCount})`)])))
    })
    // Typing a name chooses "new collection".
    const newInput = el('input', { type: 'text' })
    const newRadio = el('input', { type: 'radio', name: 'collectionChoice', value: '__new__' })
    if (!collections.length) newRadio.checked = true
    newInput.addEventListener('focus', () => (newRadio.checked = true))
    choices.append(el('p', {}, el('label', {}, [newRadio, el('span', { lang: 'fi' }, 'Uusi kokoelma:'), newInput])))

    const confirmBtn = el('button', { type: 'button', class: 'primary' }, el('span', { lang: 'fi' }, 'Lisää'))
    confirmBtn.addEventListener('click', async () => {
      const choice = choices.querySelector('input[name=collectionChoice]:checked')?.value
      if (!choice) return
      if (choice !== '__new__') return finish(choice)

      const name = newInput.value.trim()
      if (!name) return
      confirmBtn.disabled = true
      try {
        const res = await fetch('/collections', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not create the collection')
        finish(data.id)
      } catch (err) {
        confirmBtn.disabled = false
        showError(err.message)
      }
    })
    const cancelBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Peruuta'))
    cancelBtn.addEventListener('click', () => finish(null))

    detailDialogContent.replaceChildren(el('h2', { lang: 'fi' }, 'Valitse kokoelma'), choices, el('p', {}, [confirmBtn, cancelBtn]))
    detailDialog.addEventListener('close', () => finish(null), { once: true })
    detailDialog.showModal()
  })
}

function showCollectionResults(results) {
  const content = [el('h2', { lang: 'fi' }, 'Lisätty kokoelmaan')]
  results.forEach((r) => {
    content.push(
      el(
        'div',
        { class: 'wallet-offer' },
        r.error ? [el('strong', {}, r.name), el('div', { class: 'row-error' }, r.error)] : el('strong', {}, r.name)
      )
    )
  })
  content.push(el('p', {}, el('a', { href: '/my/collections', lang: 'fi' }, 'Avaa kokoelmani')))
  detailDialogContent.replaceChildren(...content)
  detailDialog.showModal()
}

async function postJson(url, body = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const createCollectionFor = () =>
  postJson('/collections', { name: `Jaettu ${new Date().toLocaleDateString('fi-FI')}` }).then((data) => data.id)

// Puts the selection (stored first where needed) into a collection the user
// picks or creates, or with `share`, straight into the share dialog. "Jaa"
// needs no choice from the user: one credential is shared on its own, several
// make a new collection named after the date, which can be renamed on the
// collections page. Failed items show in the results instead.
async function bulkAddToCollection({ share = false } = {}) {
  const { entries, refs, credentialIds } = selectedRefs()
  if (!entries.length) return

  const button = share ? bulkShareBtn : bulkCollectionBtn
  button.disabled = true
  button.classList.add('busy')
  try {
    await Auth.ensureLoggedIn()
    if (share && entries.length === 1) {
      await shareOne(entries[0])
      return
    }
    const collectionId = share ? await createCollectionFor() : await pickOrCreateCollection()
    if (!collectionId) return

    const data = await postJson(`/collections/${collectionId}/items`, { refs, credentialIds })
    const nameOf = (r) => entryName(entries.find((e) => (r.credentialId && e.credentialId === r.credentialId) || (r.ref && e.ref === r.ref)) ?? {})
    const results = data.results.map((r) => ({ ...r, name: r.name || nameOf(r) }))

    await reloadList()
    if (share && results.every((r) => !r.error)) await Share.open({ collectionId })
    else showCollectionResults(results)
  } catch (err) {
    if (err.message !== 'cancelled') showError(err.message)
  } finally {
    button.classList.remove('busy')
    updateBulkBar()
  }
}

bulkCollectionBtn.addEventListener('click', () => bulkAddToCollection())
bulkShareBtn.addEventListener('click', () => bulkAddToCollection({ share: true }))

function currentLang() {
  return document.documentElement.lang || 'fi'
}

async function fetchCredentials(koskiUrl) {
  clearError()
  submitBtn.disabled = true
  submitBtn.classList.add('busy')
  try {
    const res = await fetch('/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ koskiUrl, lang: currentLang() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')

    sortState.key = null
    syncedLang = currentLang()
    showList(data)
  } catch (err) {
    // A failed import leaves the session as it was, and so the list.
    showError(err.message)
  } finally {
    submitBtn.disabled = false
    submitBtn.classList.remove('busy')
  }
}

// "Clear my data": the server forgets the imported records (and an anonymous
// session altogether), and so does the page.
// For a signed-in user the account's Koski data goes, and what has been shared
// or put in a collection stays on the list.
clearDataBtn.addEventListener('click', async () => {
  const signedIn = document.documentElement.dataset.auth === 'in'
  const question = signedIn
    ? t(
        'Poistetaanko Koskesta haetut tiedot? Jakamasi ja kokoelmiin lisäämäsi todisteet säilyvät.',
        'Delete the data fetched from Koski? The credentials you have shared or added to collections stay.'
      )
    : t(
        'Poistetaanko Koskesta haetut suoritukset? Ne voi hakea uudelleen jakolinkillä.',
        'Delete the credentials fetched from Koski? You can fetch them again with the share link.'
      )
  if (!confirm(question)) return
  clearError()
  try {
    const res = await fetch('/credentials', { method: 'DELETE' })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
  } catch (err) {
    showError(err.message)
    return
  }
  if (detailDialog.open) detailDialog.close()
  koskiUrlInput.value = ''
  if (signedIn) {
    await reloadList().catch((err) => showError(err.message))
    return
  }
  credentials = []
  selectedIndices.clear()
  setMeta(null, null)
  demoOffer.hidden = false
  updateBulkBar()
  resultsPanel.hidden = true
})

demoBtn.addEventListener('click', async () => {
  clearError()
  demoBtn.disabled = true
  try {
    const res = await fetch('/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: currentLang() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    sortState.key = null
    syncedLang = currentLang()
    showList(data)
  } catch (err) {
    showError(err.message)
  } finally {
    demoBtn.disabled = false
  }
})

form.addEventListener('submit', (e) => {
  e.preventDefault()
  fetchCredentials(koskiUrlInput.value.trim())
})

// The Koski content (achievement names/descriptions/etc.) is converted
// server-side, in the language last sent to /credentials/lang - it doesn't
// automatically follow later UI language
// switches the way the app's own chrome does via translate-element. Watching
// <html lang> (which translate-element updates on every switch) lets us
// re-request the same already-fetched Koski data in the new language,
// without another round trip to Koski itself.
let syncedLang = currentLang()

async function syncLanguage(lang) {
  if (!credentials.some((entry) => entry.ref)) {
    syncedLang = lang
    return
  }
  try {
    const res = await fetch('/credentials/lang', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')

    if (detailDialog.open) detailDialog.close()
    showList(data)
    syncedLang = lang
  } catch (err) {
    console.warn('Could not re-translate Koski content:', err.message)
  }
}

new MutationObserver(() => {
  const lang = currentLang()
  if (lang !== syncedLang) {
    syncLanguage(lang)
  }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })

// Signing in brings the user's stored credentials into the list; signing out
// (which ends the session) empties it.
// public/auth.js sets the attribute on every render, so only a change counts.
new MutationObserver((mutations) => {
  if (mutations.every((m) => m.oldValue === document.documentElement.dataset.auth)) return
  reloadList().catch((err) => showError(err.message))
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-auth'], attributeOldValue: true })

const initial = window.__INITIAL_DATA__
if (initial?.credentials?.length) showList(initial)
