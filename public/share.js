// The share dialog, shared by the main page and the collections page (both
// provide <dialog id="detailDialog"> with a #detailDialogContent child).
//   Share.open({ collectionId })    links to a collection
//   Share.open({ credentialId })    links to one saved credential
// Each recipient gets a link of their own (named after them), so a link no
// longer needed can be deleted without breaking the others. The dialog lists
// the links as radio buttons, the last one creating a new link; under the
// list, the chosen link's actions: copy the link, add a single credential to
// a LinkedIn profile, preview what the recipient sees, and a ready-made
// message (fi/en) to edit and copy.
const Share = (() => {
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag)
    Object.entries(props).forEach(([key, value]) => node.setAttribute(key, value))
    ;[].concat(children).forEach((child) => {
      node.append(child instanceof Node ? child : document.createTextNode(child))
    })
    return node
  }

  const MESSAGES = {
    fi: ({ link, origin, single }) =>
      [
        'Hei,',
        '',
        single
          ? 'jaan kanssasi digitaalisen todisteen (Open Badges -osaamismerkin) osaamisestani.'
          : 'jaan kanssasi digitaaliset todisteeni (Open Badges -osaamismerkkejä) osaamisestani.',
        'Digitaalinen todiste on sähköisesti allekirjoitettu, joten sen aitouden voi tarkastaa automaattisesti.',
        '',
        single ? `Todisteen näet ja voit ladata täältä: ${link}` : `Todisteet näet ja voit ladata täältä: ${link}`,
        '',
        `Lisätietoa digitaalisista todisteista: ${origin}/employer`,
        `Todisteen voi tarkastaa täällä: ${origin}/verify`,
      ].join('\n'),
    en: ({ link, origin, single }) =>
      [
        'Hello,',
        '',
        single
          ? 'I am sharing a digital credential (an Open Badge) about my skills with you.'
          : 'I am sharing digital credentials (Open Badges) about my skills with you.',
        'A digital credential is electronically signed, so its authenticity can be checked automatically.',
        '',
        single ? `You can view and download the credential here: ${link}` : `You can view and download the credentials here: ${link}`,
        '',
        `More about digital credentials: ${origin}/employer`,
        `You can verify a credential here: ${origin}/verify`,
      ].join('\n'),
  }

  // LinkedIn's "Add to Profile" deep link (linkedin.com/help/linkedin/answer/a528030):
  // startTask=CERTIFICATION_NAME plus name, organizationName, issueYear/Month,
  // certUrl and certId pre-fill a licenses & certifications entry.
  function linkedInAddToProfileUrl({ name, organizationName, issuedAt, certUrl, certId }) {
    const url = new URL('https://www.linkedin.com/profile/add')
    url.searchParams.set('startTask', 'CERTIFICATION_NAME')
    if (name) url.searchParams.set('name', name)
    if (organizationName) url.searchParams.set('organizationName', organizationName)
    const issued = issuedAt ? new Date(issuedAt) : null
    if (issued && !Number.isNaN(issued.getTime())) {
      url.searchParams.set('issueYear', String(issued.getUTCFullYear()))
      url.searchParams.set('issueMonth', String(issued.getUTCMonth() + 1))
    }
    if (certUrl) url.searchParams.set('certUrl', certUrl)
    if (certId) url.searchParams.set('certId', certId)
    return url.toString()
  }

  function linkedInLink(label, href) {
    return el('a', { class: 'button small linkedin-btn', href, target: '_blank', rel: 'noopener' }, el('span', { lang: 'fi' }, label))
  }

  function addToProfileButton(item, certUrl) {
    const achievement = item.credential?.credentialSubject?.achievement || {}
    const href = linkedInAddToProfileUrl({
      name: achievement.name,
      organizationName: achievement.creator?.name,
      issuedAt: item.credential?.issuanceDate ?? item.credential?.validFrom,
      certUrl,
      certId: item.credential?.id,
    })
    return linkedInLink('Lisää LinkedIn-profiiliin', href)
  }

  // `label`: the button's Finnish label element, el('span', { lang: 'fi' }, '…').
  function copyButton(getText, label, className = 'small') {
    const button = el('button', { type: 'button', class: `${className} copy-btn` }, [
      el('span', { class: 'label-default' }, label),
      el('span', { class: 'label-done', lang: 'fi' }, 'Kopioitu!'),
    ])
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(getText())
      } catch {
        return
      }
      button.classList.add('done')
      setTimeout(() => button.classList.remove('done'), 2000)
    })
    return button
  }

  async function requestJson(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    if (res.status === 204) return null
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw responseError(data)
    return data
  }

  const formatDate = (iso) => new Date(iso).toLocaleDateString('fi-FI')

  async function open({ collectionId, credentialId }) {
    const dialog = document.getElementById('detailDialog')
    const content = dialog.querySelector('#detailDialogContent')
    const target = collectionId ? { collectionId } : { credentialId }
    const query = new URLSearchParams(target)

    // What is shared: a collection (its name and items) or one credential.
    let title
    let items
    if (collectionId) {
      const { collections } = await requestJson('/collections')
      const collection = collections.find((c) => c.id === collectionId)
      if (!collection) throw responseError({ error: 'Kokoelmaa ei löytynyt.', lang: 'fi' })
      title = collection.name
      items = (await requestJson(`/collections/${collectionId}/items`)).items
    } else {
      const { credentials } = await requestJson('/saved-credentials')
      const item = credentials.find((c) => c.id === credentialId)
      if (!item) throw responseError({ error: 'Todistetta ei löytynyt.', lang: 'fi' })
      title = item.credential?.credentialSubject?.achievement?.name ?? ''
      items = [item]
    }

    const origin = location.origin
    const single = !collectionId
    let links = (await requestJson(`/share-links?${query}`)).links
    const NEW = 'new'
    let selectedId = links[0]?.id ?? NEW
    const drafts = new Map() // link id -> edited message
    let lang = document.documentElement.lang === 'en' ? 'en' : 'fi'
    const errorEl = el('p', { class: 'error', role: 'alert', hidden: '' })
    const urlOf = (link) => `${origin}${link.path}`
    const messageFor = (link) => MESSAGES[lang]({ link: urlOf(link), origin, single })

    // `err`: an Error, or a server error's { message, lang, link } (i18n.js).
    function showError(err) {
      errorEl.replaceChildren(...errorContent(err))
      errorEl.hidden = false
    }

    function select(id) {
      selectedId = id
      errorEl.hidden = true
      render()
    }

    function radio(id, label, extra = []) {
      const input = el('input', { type: 'radio', name: 'shareLink', id: `share-radio-${id}`, value: id })
      input.checked = id === selectedId
      input.addEventListener('change', () => {
        select(id)
        content.querySelector(`#share-radio-${id}`)?.focus()
      })
      return el('li', { class: id === selectedId ? 'share-choice selected' : 'share-choice' }, [
        input,
        el('label', { for: `share-radio-${id}` }, label),
        ...extra,
      ])
    }

    function linkRow(link) {
      const remove = el('button', { type: 'button', class: 'link-btn share-remove' }, el('span', { lang: 'fi' }, 'Poista'))
      remove.addEventListener('click', async () => {
        if (!confirm(t(`Poistetaanko linkki "${link.label}"? Se lakkaa toimimasta.`, `Delete the link "${link.label}"? It stops working.`))) return
        try {
          await requestJson(`/share-links/${link.id}`, { method: 'DELETE' })
          links = links.filter((l) => l.id !== link.id)
          drafts.delete(link.id)
          select(selectedId === link.id ? (links[0]?.id ?? NEW) : selectedId)
        } catch (err) {
          showError(err)
        }
      })
      return radio(link.id, [el('span', { class: 'share-choice-name' }, link.label), el('span', { class: 'muted' }, formatDate(link.createdAt))], [remove])
    }

    // The label carries the text to translate, not the input: translate-element
    // would clone an input with a lang attribute, and the hidden copy would sit
    // in the form, empty and required.
    const labelInput = el('input', {
      type: 'text',
      id: 'shareLabelInput',
      required: '',
      maxlength: '100',
      'aria-label': t('Vastaanottajan nimi', "The recipient's name"),
      placeholder: t('esim. työnantajan nimi', "e.g. the employer's name"),
    })
    labelInput.addEventListener('focus', () => {
      if (selectedId === NEW) return
      // Choose "new" without re-rendering, which would take the focus away.
      selectedId = NEW
      content.querySelector(`#share-radio-${NEW}`).checked = true
      content.querySelectorAll('.share-choice').forEach((li) => li.classList.toggle('selected', li.querySelector('input[type=radio]').checked))
      content.querySelector('.share-panel')?.remove()
    })
    const form = el('form', { class: 'field-row share-new' }, [
      labelInput,
      el('button', { type: 'submit', class: 'primary small' }, el('span', { lang: 'fi' }, 'Luo linkki')),
    ])
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const label = labelInput.value.trim()
      if (!label) return
      try {
        const link = await requestJson('/share-links', { method: 'POST', body: { ...target, label } })
        links = [link, ...links]
        labelInput.value = ''
        select(link.id)
        content.querySelector('.share-panel .copy-btn')?.focus()
      } catch (err) {
        showError(err)
      }
    })

    function panel(link) {
      const url = urlOf(link)
      const textarea = el('textarea', { class: 'share-message', rows: '10', 'aria-label': t('Viesti', 'Message') })
      textarea.value = drafts.get(link.id) ?? messageFor(link)
      textarea.addEventListener('input', () => drafts.set(link.id, textarea.value))

      const toggle = el('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('Viestin kieli', 'Message language') })
      for (const [code, label] of [['fi', 'Suomeksi'], ['en', 'In English']]) {
        const button = el('button', { type: 'button', class: 'small ghost', 'aria-pressed': String(code === lang) }, label)
        button.addEventListener('click', () => {
          lang = code
          drafts.clear()
          toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)))
          textarea.value = messageFor(link)
        })
        toggle.append(button)
      }

      return el('section', { class: 'share-panel', 'aria-label': link.label }, [
        el('div', { class: 'share-panel-actions' }, [
          copyButton(() => url, el('span', { lang: 'fi' }, 'Kopioi linkki')),
          el('a', { class: 'share-preview', href: url, target: '_blank', rel: 'noopener' }, el('span', { lang: 'fi' }, 'Esikatsele')),
          ...(single ? [addToProfileButton(items[0], url)] : []),
        ]),
        el('div', { class: 'share-message-head' }, [el('h3', { lang: 'fi' }, 'Viesti vastaanottajalle'), toggle]),
        textarea,
        el('p', {}, copyButton(() => textarea.value, el('span', { lang: 'fi' }, 'Kopioi viesti'))),
      ])
    }

    function render() {
      const selected = links.find((l) => l.id === selectedId)
      content.replaceChildren(
        el('h2', { lang: 'fi' }, collectionId ? 'Jaa kokoelma' : 'Jaa todiste'),
        el('p', { class: 'share-subject' }, title),
        el(
          'p',
          { class: 'muted', lang: 'fi' },
          collectionId
            ? 'Luo jokaiselle vastaanottajalle oma linkki. Linkin avaaja näkee kokoelman kaikki todisteet ja voi ladata ne. Kun poistat linkin, se lakkaa toimimasta, mutta muut linkit toimivat edelleen. Emme seuraa, kuka linkin avaa.'
            : 'Luo jokaiselle vastaanottajalle oma linkki. Linkin avaaja näkee tämän todisteen ja voi ladata sen. Kun poistat linkin, se lakkaa toimimasta, mutta muut linkit toimivat edelleen. Emme seuraa, kuka linkin avaa.'
        ),
        el('fieldset', { class: 'share-choices' }, [
          el('legend', { lang: 'fi' }, 'Valitse linkki'),
          el('ul', {}, [...links.map(linkRow), radio(NEW, el('span', { lang: 'fi' }, 'Uusi linkki'), [form])]),
        ]),
        errorEl,
        selected ? panel(selected) : ''
      )
    }

    render()
    dialog.showModal()
    if (selectedId === NEW) labelInput.focus()
  }

  return { open }
})()
