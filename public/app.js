const form = document.getElementById('koskiForm')
const koskiUrlInput = document.getElementById('koskiUrlInput')
const submitBtn = document.getElementById('submitBtn')
const errorBox = document.getElementById('errorBox')
const metaBox = document.getElementById('metaBox')
const tableContainer = document.getElementById('tableContainer')
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
  const headCells = COLUMNS.map(({ key, label }) => {
    const active = sortState.key === key
    const ariaSort = active ? (sortState.direction === -1 ? 'descending' : 'ascending') : 'none'
    const arrow = el('span', { class: 'arrow', 'aria-hidden': 'true' }, active && sortState.direction === -1 ? '▼' : '▲')
    const btn = el('button', { type: 'button', class: 'sort-btn' }, [el('span', { lang: 'fi' }, label), arrow])
    btn.addEventListener('click', () => {
      sortState.direction = sortState.key === key ? sortState.direction * -1 : 1
      sortState.key = key
      renderTable()
    })
    return el('th', { 'aria-sort': ariaSort }, btn)
  })
  headCells.push(el('th', {}, el('span', { lang: 'fi' }, 'Toiminto')))
  return el('tr', {}, headCells)
}

function renderTable() {
  tableContainer.replaceChildren()

  if (!credentials.length) {
    tableContainer.append(el('p', { class: 'muted', lang: 'fi' }, 'Koski-tiedoista ei löytynyt osaamismerkkikelpoisia suorituksia.'))
    return
  }

  const tbody = el('tbody')
  sortedEntries().forEach(({ record, index }) => {
    tbody.appendChild(buildRow(record, index))
  })

  const table = el('table', {}, [el('thead', {}, buildHeaderRow()), tbody])
  tableContainer.appendChild(table)
}

function buildRow(record, index) {
  const achievement = record.credentialSubject.achievement
  const nameBtn = el('button', { class: 'link-btn', type: 'button' }, achievement.name)
  nameBtn.addEventListener('click', () => openDetail(index))

  return el('tr', {}, [
    el('td', {}, nameBtn),
    el('td', {}, el('span', { class: 'badge' }, achievement.achievementType)),
    el('td', {}, achievement.creator?.name ?? ''),
    el('td', {}, record.awardedOn ?? ''),
    el('td', {}, buildActionCell(record, index)),
  ])
}

function buildActionCell(record, index) {
  const cell = []
  if (record.signed) {
    cell.push(
      el('span', { class: 'badge signed', lang: 'fi' }, 'Allekirjoitettu'),
      ' ',
      el('a', { href: `/credentials/${index}/download`, lang: 'fi' }, 'Lataa'),
    )
  } else {
    const signBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Hae todiste'))
    signBtn.addEventListener('click', () => signCredential(index, signBtn))
    cell.push(signBtn)
  }

  const walletBtn = el('button', { type: 'button' }, el('span', { lang: 'fi' }, 'Lisää lompakkoon'))
  walletBtn.addEventListener('click', () => offerToWallet(index, walletBtn))
  cell.push(' ', walletBtn)

  return cell
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60)
  return minutes >= 1 ? `${minutes} min` : `${seconds} s`
}

async function offerToWallet(index, btn) {
  btn.disabled = true
  btn.classList.add('busy')
  try {
    const res = await fetch(`/credentials/${index}/offer`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not create the wallet offer')
    showWalletOffer(data)
  } catch (err) {
    showError(err.message)
  } finally {
    btn.disabled = false
    btn.classList.remove('busy')
  }
}

function showWalletOffer({ offerUri, qrDataUrl, txCode, expiresIn }) {
  const content = [
    el('h2', { lang: 'fi' }, 'Lisää lompakkoon'),
    el('p', { lang: 'fi' }, 'Skannaa QR-koodi lompakkosovelluksella.'),
    el('img', { src: qrDataUrl, alt: 'QR', width: '240', height: '240' }),
    el('p', {}, el('a', { href: offerUri, lang: 'fi' }, 'Avaa lompakkosovelluksessa')),
  ]
  if (txCode) {
    content.push(el('p', {}, [el('span', { lang: 'fi' }, 'Vahvistuskoodi:'), ' ', el('strong', {}, txCode)]))
  }
  if (expiresIn) {
    content.push(el('p', { class: 'muted' }, [el('span', { lang: 'fi' }, 'Voimassa:'), ' ', formatDuration(expiresIn)]))
  }
  detailDialogContent.replaceChildren(...content)
  detailDialog.showModal()
}

async function signCredential(index, btn) {
  btn.disabled = true
  btn.classList.add('busy')
  const cell = btn.parentElement
  cell.querySelectorAll('.row-error').forEach((n) => n.remove())

  try {
    const res = await fetch(`/credentials/${index}/sign`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Signing failed')
    credentials[index].signed = data.signed
    cell.replaceChildren(...[].concat(buildActionCell(credentials[index], index)))
  } catch (err) {
    btn.disabled = false
    btn.classList.remove('busy')
    cell.appendChild(el('div', { class: 'row-error' }, err.message))
  }
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
  const resultRows = results.map((r) => {
    const desc = (achievement.resultDescriptions || []).find((d) => d.id === r.resultDescription)
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
