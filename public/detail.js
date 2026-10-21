// The credential detail dialog, shared by the main page (draft, unsigned
// records, keyed by `awardedOn`), the collections page and the shared
// collection page (both signed VCs, keyed by `issuanceDate`/`validFrom`).
// Detail.open() takes whatever a caller already has - a draft record or a
// stored credential - with no shape conversion of its own, plus the owner's
// actions for it (none on the public pages):
//   Detail.open(credential, [{ label: 'Jaa', run: () => ..., primary, danger }])
// A rejected run() shows its message in the dialog.
const Detail = (() => {
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag)
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'class') node.className = value
      else node.setAttribute(key, value)
    })
    ;[].concat(children).forEach((child) => {
      node.append(child instanceof Node ? child : document.createTextNode(child))
    })
    return node
  }

  // Same rosette as BADGE_ICON in src/views/layout.js.
  const BADGE_ICON_SVG =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="M8.5 13.8 7 22l5-3 5 3-1.5-8.2"/></svg>'

  // A student card (K5): a card with a photo and lines of text.
  const STUDENT_CARD_ICON_SVG =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.6-1.3 1.7-2 3-2s2.4.7 3 2"/><path d="M14 10h5M14 14h3"/></svg>'

  function badgeIcon(strong) {
    const icon = el('span', { class: strong ? 'credential-icon strong' : 'credential-icon' })
    icon.innerHTML = BADGE_ICON_SVG
    return icon
  }

  // The list icon for an achievement: a student card for a student status,
  // otherwise the rosette.
  function credentialIcon(achievement) {
    if (!isStudentStatus(achievement)) return badgeIcon(isMajor(achievement))
    const icon = el('span', { class: 'credential-icon student' })
    icon.innerHTML = STUDENT_CARD_ICON_SVG
    return icon
  }

  // An error's message as nodes. The server may name a `link` ({ text, href }):
  // that text in the message becomes a link.
  function errorContent({ message, link }) {
    const at = link?.text ? message.lastIndexOf(link.text) : -1
    if (at < 0 || !link.href?.startsWith('/')) return [message]
    return [message.slice(0, at), el('a', { href: link.href }, link.text), message.slice(at + link.text.length)]
  }

  const isStudentStatus = (achievement) => achievement?.achievementType === 'ext:StudentStatus'

  // Whole qualifications get the stronger icon tint; their parts and single
  // courses the softer one.
  const MAJOR_ACHIEVEMENT_TYPES = /Degree|Diploma|Certificate|Certification|License/
  const isMajor = (achievement) => MAJOR_ACHIEVEMENT_TYPES.test(achievement?.achievementType ?? '')

  function currentLang() {
    return document.documentElement.lang === 'en' ? 'en' : 'fi'
  }

  // Koski dates are ISO, either date-only (draft records) or a full
  // timestamp (once signed); shown in the UI language's own format.
  function formatDate(iso) {
    if (!iso) return ''
    const date = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`)
    if (Number.isNaN(date.getTime())) return iso
    return date.toLocaleDateString(currentLang() === 'en' ? 'en-GB' : 'fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })
  }

  // koski2openbadge now localizes its resultDescription names (Grade/Extent)
  // itself via the `lang` option passed to convert() server-side, so those
  // arrive pre-translated. Its result *status* ("Completed") is still a
  // fixed English literal, so translations.json (keyed by Finnish source
  // text) can't reach it. We hand-author a bilingual sibling pair for it per
  // translate-element's alternate mode: the lang="en" sibling right after
  // the lang="fi" element is its translation, so no translations.json entry
  // is needed.
  const RESULT_TEXT_TRANSLATIONS = { Completed: 'Suoritettu', Enrolled: 'Läsnä' }
  function bilingualText(text) {
    const fi = RESULT_TEXT_TRANSLATIONS[text]
    if (!fi) return text ?? ''
    return [el('span', { lang: 'fi' }, fi), el('span', { lang: 'en' }, text)]
  }

  // The holder's name, from the plain-text name identifier koski2openbadge
  // adds (credentials signed before it have none).
  function holderName(credentialSubject) {
    const ids = [].concat(credentialSubject?.identifier ?? [])
    return ids.find((id) => id?.identityType === 'name' && id.hashed === false)?.identityHash
  }

  function actionButtons(actions) {
    const errorLine = el('p', { class: 'row-error', role: 'alert', hidden: '' })
    const buttons = actions.map(({ label, run, primary, danger }) => {
      const button = el('button', { type: 'button', class: ['small', primary && 'primary', danger && 'ghost danger'].filter(Boolean).join(' ') }, el('span', { lang: 'fi' }, label))
      button.addEventListener('click', async () => {
        errorLine.hidden = true
        button.disabled = true
        button.classList.add('busy')
        try {
          await run()
        } catch (err) {
          if (err.message === 'cancelled') return
          errorLine.replaceChildren(...errorContent(err))
          errorLine.hidden = false
        } finally {
          button.disabled = false
          button.classList.remove('busy')
        }
      })
      return button
    })
    return [el('p', { class: 'detail-actions' }, buttons), errorLine]
  }

  function open(credential, actions = []) {
    const achievement = credential.credentialSubject?.achievement || {}
    const awardedIso = credential.awardedOn ?? credential.issuanceDate ?? credential.validFrom
    // A student status expires (K3): a record's validUntil, a stored copy's
    // expirationDate (ldp_vc) or validUntil.
    const validUntilIso = credential.validUntil ?? credential.expirationDate

    const dl = el('dl')
    const addRow = (term, value) => {
      if (!value) return
      dl.append(el('dt', { lang: 'fi' }, term), el('dd', {}, value))
    }
    addRow('Haltija', holderName(credential.credentialSubject))
    addRow('Myöntäjä', achievement.creator?.name)
    addRow('Myönnetty', formatDate(awardedIso))
    addRow('Voimassa asti', formatDate(validUntilIso))
    addRow('Koulutusala', achievement.fieldOfStudy)
    addRow('Koodi', achievement.humanCode)

    const results = credential.credentialSubject?.result || []
    // Open Badges 3.0 names this `resultDescription`; koski2openbadge emitted
    // the plural before 0.1.0. Accept both so the dialog keeps its grade and
    // credit labels whichever version is installed - drop the fallback once
    // the dependency is on >= 0.1.0 everywhere.
    const descriptions = achievement.resultDescription || achievement.resultDescriptions || []
    const resultRows = results.map((r) => {
      const desc = descriptions.find((d) => d.id === r.resultDescription)
      return el('tr', {}, [el('td', {}, bilingualText(desc?.name)), el('td', {}, bilingualText(r.value ?? r.status))])
    })

    const dialog = document.getElementById('detailDialog')
    dialog.querySelector('#detailDialogContent').replaceChildren(
      el('h2', {}, achievement.name),
      el('p', {}, el('span', { class: 'badge' }, achievement.achievementType)),
      dl,
      el('p', {}, achievement.description ?? ''),
      ...(resultRows.length ? [el('table', {}, el('tbody', {}, resultRows))] : []),
      ...(actions.length ? actionButtons(actions) : [])
    )
    dialog.showModal()
  }

  return { open, badgeIcon, credentialIcon, errorContent, isMajor, isStudentStatus, formatDate }
})()
