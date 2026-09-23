const form = document.getElementById('koskiForm')
const koskiUrlInput = document.getElementById('koskiUrlInput')
const submitBtn = document.getElementById('submitBtn')
const errorBox = document.getElementById('errorBox')
const metaBox = document.getElementById('metaBox')
const tableContainer = document.getElementById('tableContainer')
const bulkBar = document.getElementById('bulkBar')
const bulkCount = document.getElementById('bulkCount')
const bulkWalletBtn = document.getElementById('bulkWalletBtn')
const bulkCollectionBtn = document.getElementById('bulkCollectionBtn')
const detailDialog = document.getElementById('detailDialog')
const detailDialogContent = document.getElementById('detailDialogContent')

const COLUMNS = [
  { key: 'name', label: 'Nimi' },
  { key: 'type', label: 'Tyyppi' },
  { key: 'issuer', label: 'Myöntäjä' },
  { key: 'awarded', label: 'Myönnetty' },
]

// koski2openbadge now localizes its resultDescription names (Grade/Extent)
// itself via the `lang` option we already pass to convert() server-side, so
// those arrive pre-translated. Its result *status* ("Completed") is still a
// fixed English literal, so translations.json (keyed by Finnish source text)
// can't reach it. We hand-author a bilingual sibling pair for it per the
// translate-element README's alternate mode: translate-element leaves any
// lang="fi" element alone once it already has a same-tag lang-tagged
// neighbour, so no translations.json entry is needed.
const RESULT_TEXT_TRANSLATIONS = {
  Completed: 'Suoritettu',
}

function bilingualText(text) {
  const fi = RESULT_TEXT_TRANSLATIONS[text]
  if (!fi) return text ?? ''
  return [el('span', { lang: 'fi' }, fi), el('span', { lang: 'en' }, text)]
}

let credentials = []
const sortState = { key: null, direction: 1 }
const selectedIndices = new Set()

function showError(message) {
  errorBox.textContent = message
  errorBox.hidden = false
}

function clearError() {
  errorBox.hidden = true
  errorBox.textContent = ''
}

function setMeta(personName, koskiUrl) {
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

function sortedEntries() {
  const entries = credentials.map((record, index) => ({ record, index }))
  if (!sortState.key) return entries
  const { key, direction } = sortState
  return entries.sort(
    (a, b) => direction * String(columnValue(a.record, key)).localeCompare(String(columnValue(b.record, key)), 'fi', { sensitivity: 'base' })
  )
}

function buildHeaderRow() {
  const visibleIndices = sortedEntries().map(({ index }) => index)
  const selectAllCb = el('input', { type: 'checkbox' })
  selectAllCb.checked = visibleIndices.length > 0 && visibleIndices.every((i) => selectedIndices.has(i))
  selectAllCb.indeterminate = !selectAllCb.checked && visibleIndices.some((i) => selectedIndices.has(i))
  selectAllCb.addEventListener('change', () => {
    visibleIndices.forEach((i) => (selectAllCb.checked ? selectedIndices.add(i) : selectedIndices.delete(i)))
    renderTable()
  })

  const headCells = [el('th', { class: 'select-col' }, selectAllCb)]
  COLUMNS.forEach(({ key, label }) => {
    const active = sortState.key === key
    const ariaSort = active ? (sortState.direction === -1 ? 'descending' : 'ascending') : 'none'
    const arrow = el('span', { class: 'arrow', 'aria-hidden': 'true' }, active && sortState.direction === -1 ? '▼' : '▲')
    const btn = el('button', { type: 'button', class: 'sort-btn' }, [el('span', { lang: 'fi' }, label), arrow])
    btn.addEventListener('click', () => {
      sortState.direction = sortState.key === key ? sortState.direction * -1 : 1
      sortState.key = key
      renderTable()
    })
    headCells.push(el('th', { 'aria-sort': ariaSort }, btn))
  })
  headCells.push(el('th', {}, el('span', { lang: 'fi' }, 'Tila')))
  return el('tr', {}, headCells)
}

function renderTable() {
  tableContainer.replaceChildren()

  if (!credentials.length) {
    tableContainer.append(el('p', { class: 'muted', lang: 'fi' }, 'Koski-tiedoista ei löytynyt osaamismerkkikelpoisia suorituksia.'))
    updateBulkBar()
    return
  }

  const tbody = el('tbody')
  sortedEntries().forEach(({ record, index }) => {
    tbody.appendChild(buildRow(record, index))
  })

  const table = el('table', {}, [el('thead', {}, buildHeaderRow()), tbody])
  tableContainer.appendChild(table)
  updateBulkBar()
}

function buildRow(record, index) {
  const achievement = record.credentialSubject.achievement
  const nameBtn = el('button', { class: 'link-btn', type: 'button' }, achievement.name)
  nameBtn.addEventListener('click', () => openDetail(index))

  const rowCb = el('input', { type: 'checkbox' })
  rowCb.checked = selectedIndices.has(index)
  rowCb.addEventListener('change', () => {
    if (rowCb.checked) selectedIndices.add(index)
    else selectedIndices.delete(index)
    renderTable()
  })

  return el('tr', {}, [
    el('td', { class: 'select-col' }, rowCb),
    el('td', {}, nameBtn),
    el('td', {}, el('span', { class: 'badge' }, achievement.achievementType)),
    el('td', {}, achievement.creator?.name ?? ''),
    el('td', {}, record.awardedOn ?? ''),
    el('td', {}, buildStatusCell(record, index)),
  ])
}

function buildStatusCell(record, index) {
  if (!record.signed) return []
  return [
    el('span', { class: 'badge signed', lang: 'fi' }, 'Allekirjoitettu'),
    ' ',
    el('a', { href: `/credentials/${index}/download`, lang: 'fi' }, 'Lataa'),
  ]
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60)
  return minutes >= 1 ? `${minutes} min` : `${seconds} s`
}

function updateBulkBar() {
  if (!credentials.length) {
    bulkBar.hidden = true
    return
  }
  bulkBar.hidden = false
  bulkCount.replaceChildren(String(selectedIndices.size) + ' ', el('span', { lang: 'fi' }, 'valittu'), el('span', { lang: 'en' }, 'selected'))
  bulkWalletBtn.disabled = selectedIndices.size === 0
  bulkCollectionBtn.disabled = selectedIndices.size === 0
}

async function bulkAddToWallet() {
  const indices = [...selectedIndices].sort((a, b) => a - b)
  if (!indices.length) return

  bulkWalletBtn.disabled = true
  bulkWalletBtn.classList.add('busy')
  const results = []
  for (const index of indices) {
    const name = columnValue(credentials[index], 'name')
    try {
      if (!credentials[index].signed) {
        const signRes = await fetch(`/credentials/${index}/sign`, { method: 'POST' })
        const signData = await signRes.json()
        if (!signRes.ok) throw new Error(signData.error || 'Signing failed')
        credentials[index].signed = signData.signed
      }
      const offerRes = await fetch(`/credentials/${index}/offer`, { method: 'POST' })
      const offerData = await offerRes.json()
      if (!offerRes.ok) throw new Error(offerData.error || 'Could not create the wallet offer')
      results.push({ name, ...offerData })
    } catch (err) {
      results.push({ name, error: err.message })
    }
  }
  bulkWalletBtn.classList.remove('busy')
  selectedIndices.clear()
  renderTable()
  showWalletOffers(results)
}

bulkWalletBtn.addEventListener('click', bulkAddToWallet)

// Reuses the same <dialog id="detailDialog"> a third way (also used for the
// credential detail view and for showWalletOffers()). Resolves with the
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
      choices.append(el('p', {}, el('label', {}, [input, ' ', c.name, ' ', el('span', { class: 'muted' }, `(${c.itemCount})`)])))
    })
    const newInput = el('input', { type: 'text', placeholder: 'Uusi kokoelma' })
    const newRadio = el('input', { type: 'radio', name: 'collectionChoice', value: '__new__' })
    if (!collections.length) newRadio.checked = true
    choices.append(el('p', {}, [newRadio, ' ', newInput]))

    const confirmBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Lisää'))
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

    detailDialogContent.replaceChildren(el('h2', { lang: 'fi' }, 'Valitse kokoelma'), choices, el('p', {}, [confirmBtn, ' ', cancelBtn]))
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
  detailDialogContent.replaceChildren(...content)
  detailDialog.showModal()
}

async function bulkAddToCollection() {
  const indices = [...selectedIndices].sort((a, b) => a - b)
  if (!indices.length) return

  bulkCollectionBtn.disabled = true
  bulkCollectionBtn.classList.add('busy')
  try {
    await Auth.ensureLoggedIn()
    const collectionId = await pickOrCreateCollection()
    if (!collectionId) return

    const res = await fetch(`/collections/${collectionId}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ indices }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not add to the collection')

    data.results.forEach((r) => {
      if (r.signed) credentials[r.index].signed = r.signed
    })
    selectedIndices.clear()
    renderTable()
    showCollectionResults(data.results)
  } catch (err) {
    if (err.message !== 'cancelled') showError(err.message)
  } finally {
    bulkCollectionBtn.classList.remove('busy')
    updateBulkBar()
  }
}

bulkCollectionBtn.addEventListener('click', bulkAddToCollection)

function showWalletOffers(results) {
  const content = [el('h2', { lang: 'fi' }, 'Lisää lompakkoon'), el('p', { lang: 'fi' }, 'Skannaa QR-koodi lompakkosovelluksella.')]
  results.forEach((r) => {
    if (r.error) {
      content.push(el('div', { class: 'wallet-offer' }, [el('strong', {}, r.name), el('div', { class: 'row-error' }, r.error)]))
      return
    }
    const item = [
      el('h3', {}, r.name),
      el('img', { src: r.qrDataUrl, alt: 'QR', width: '180', height: '180' }),
      el('p', {}, el('a', { href: r.offerUri, lang: 'fi' }, 'Avaa lompakkosovelluksessa')),
    ]
    if (r.txCode) item.push(el('p', {}, [el('span', { lang: 'fi' }, 'Vahvistuskoodi:'), ' ', el('strong', {}, r.txCode)]))
    if (r.expiresIn) item.push(el('p', { class: 'muted' }, [el('span', { lang: 'fi' }, 'Voimassa:'), ' ', formatDuration(r.expiresIn)]))
    content.push(el('div', { class: 'wallet-offer' }, item))
  })
  detailDialogContent.replaceChildren(...content)
  detailDialog.showModal()
}

function openDetail(index) {
  const record = credentials[index]
  const achievement = record.credentialSubject.achievement

  const dl = el('dl')
  const addRow = (term, value) => {
    if (!value) return
    dl.append(el('dt', { lang: 'fi' }, term), el('dd', {}, value))
  }
  addRow('Myöntäjä', achievement.creator?.name)
  addRow('Myönnetty', record.awardedOn)
  addRow('Koulutusala', achievement.fieldOfStudy)
  addRow('Koodi', achievement.humanCode)

  const results = record.credentialSubject.result || []
  // Open Badges 3.0 names this `resultDescription`; koski2openbadge emitted the
  // plural before 0.1.0. Accept both so the page keeps its grade and credit
  // labels whichever version is installed - drop the fallback once the
  // dependency is on >= 0.1.0 everywhere.
  const descriptions = achievement.resultDescription || achievement.resultDescriptions || []
  const resultRows = results.map((r) => {
    const desc = descriptions.find((d) => d.id === r.resultDescription)
    return el('tr', {}, [el('td', {}, bilingualText(desc?.name)), el('td', {}, bilingualText(r.value ?? r.status))])
  })

  detailDialogContent.replaceChildren(
    el('h2', {}, achievement.name),
    el('p', {}, el('span', { class: 'badge' }, achievement.achievementType)),
    dl,
    el('p', {}, achievement.description ?? ''),
    ...(resultRows.length ? [el('table', {}, el('tbody', {}, resultRows))] : [])
  )
  detailDialog.showModal()
}

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

    credentials = data.credentials
    sortState.key = null
    selectedIndices.clear()
    syncedLang = currentLang()
    setMeta(data.personName, data.koskiUrl)
    renderTable()
  } catch (err) {
    credentials = []
    setMeta(null, null)
    renderTable()
    showError(err.message)
  } finally {
    submitBtn.disabled = false
    submitBtn.classList.remove('busy')
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  fetchCredentials(koskiUrlInput.value.trim())
})

// The Koski content (achievement names/descriptions/etc.) is converted
// server-side once, in whatever language was current at the time, and cached
// in the session - it doesn't automatically follow later UI language
// switches the way the app's own chrome does via translate-element. Watching
// <html lang> (which translate-element updates on every switch) lets us
// re-request the same already-fetched Koski data in the new language,
// without another round trip to Koski itself.
let syncedLang = currentLang()

async function syncLanguage(lang) {
  if (!credentials.length) {
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

    credentials = data.credentials
    if (detailDialog.open) detailDialog.close()
    setMeta(data.personName, data.koskiUrl)
    renderTable()
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

const initial = window.__INITIAL_DATA__
if (initial?.credentials?.length) {
  credentials = initial.credentials
  setMeta(initial.personName, initial.koskiUrl)
  renderTable()
}
