// The share dialog, shared by the main page and the collections page (both
// provide <dialog id="detailDialog"> with a #detailDialogContent child).
//   Share.open({ collectionId })    links to a collection
//   Share.open({ credentialId })    links to one saved credential
// Each recipient gets a link of their own (named after them), so one can be
// deleted without breaking the others. The selected link comes with a copy
// button, LinkedIn buttons and a ready-made message for the recipient (fi/en).
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
        'Digitaalinen todiste on sähköisesti allekirjoitettu, joten sen aitouden voi tarkastaa ilman yhteydenottoa myöntäjään.',
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
        'A digital credential is electronically signed, so its authenticity can be checked without contacting the issuer.',
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

  function linkedInShareUrl(link) {
    const url = new URL('https://www.linkedin.com/sharing/share-offsite/')
    url.searchParams.set('url', link)
    return url.toString()
  }

  function linkedInLink(label, href) {
    return el('a', { class: 'button small ghost', href, target: '_blank', rel: 'noopener' }, el('span', { lang: 'fi' }, label))
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

  function copyButton(getText) {
    const button = el('button', { type: 'button', class: 'small primary copy-btn' }, [
      el('span', { class: 'label-default', lang: 'fi' }, 'Kopioi'),
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
    if (!res.ok) throw new Error(data.error || 'Request failed')
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
      if (!collection) throw new Error('Collection not found.')
      title = collection.name
      items = (await requestJson(`/collections/${collectionId}/items`)).items
    } else {
      const { credentials } = await requestJson('/saved-credentials')
      const item = credentials.find((c) => c.id === credentialId)
      if (!item) throw new Error('Credential not found.')
      title = item.credential?.credentialSubject?.achievement?.name ?? ''
      items = [item]
    }

    const origin = location.origin
    let links = (await requestJson(`/share-links?${query}`)).links
    let selectedId = links[0]?.id
    let lang = document.documentElement.lang === 'en' ? 'en' : 'fi'
    const errorEl = el('p', { class: 'error', role: 'alert', hidden: '' })

    function showError(message) {
      errorEl.textContent = message
      errorEl.hidden = false
    }

    // The label carries the text to translate, not the input: translate-element
    // would clone an input with a lang attribute, and the hidden copy would sit
    // in the form, empty and required.
    const labelInput = el('input', { type: 'text', id: 'shareLabelInput', required: '', maxlength: '100' })
    const form = el('form', { class: 'share-new-form' }, [
      el('label', { for: 'shareLabelInput', lang: 'fi' }, 'Vastaanottaja, esim. työnantajan nimi'),
      el('div', { class: 'field-row share-new' }, [
        labelInput,
        el('button', { type: 'submit', class: 'primary' }, el('span', { lang: 'fi' }, 'Luo linkki')),
      ]),
    ])
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const label = labelInput.value.trim()
      if (!label) return
      try {
        const link = await requestJson('/share-links', { method: 'POST', body: { ...target, label } })
        links = [link, ...links]
        selectedId = link.id
        labelInput.value = ''
        errorEl.hidden = true
        render()
      } catch (err) {
        showError(err.message)
      }
    })

    function linkItem(link) {
      const selected = link.id === selectedId
      const url = `${origin}${link.path}`
      const select = el('button', { type: 'button', class: 'share-link-label', 'aria-pressed': String(selected) }, link.label)
      select.addEventListener('click', () => {
        selectedId = link.id
        render()
      })
      const remove = el('button', { type: 'button', class: 'small ghost danger' }, el('span', { lang: 'fi' }, 'Poista'))
      remove.addEventListener('click', async () => {
        if (!confirm(`Poistetaanko linkki "${link.label}"? Se lakkaa toimimasta.`)) return
        try {
          await requestJson(`/share-links/${link.id}`, { method: 'DELETE' })
          links = links.filter((l) => l.id !== link.id)
          if (selected) selectedId = links[0]?.id
          render()
        } catch (err) {
          showError(err.message)
        }
      })
      return el('li', { class: selected ? 'share-link-item selected' : 'share-link-item' }, [
        el('div', { class: 'share-link-head' }, [
          select,
          el('span', { class: 'muted' }, formatDate(link.createdAt)),
          remove,
        ]),
        selected
          ? el('div', { class: 'share-row' }, [
              el('a', { class: 'share-link', href: url, target: '_blank', rel: 'noopener' }, url),
              copyButton(() => url),
            ])
          : '',
      ])
    }

    // The LinkedIn buttons and the message, for the selected link.
    function forLink(link) {
      const url = `${origin}${link.path}`
      const certUrl = (item) => (collectionId ? `${url}/items/${item.id}` : url)
      const linkedInButtons = items.map((item) => addToProfileButton(item, certUrl(item)))
      if (collectionId) linkedInButtons.push(linkedInLink('Jaa LinkedInissä', linkedInShareUrl(url)))

      const textarea = el('textarea', { class: 'share-message', rows: '11', 'aria-label': 'Viesti' })
      const setMessage = () => {
        textarea.value = MESSAGES[lang]({ link: url, origin, single: !collectionId })
      }
      setMessage()

      const toggle = el('div', { class: 'lang-toggle', role: 'group', 'aria-label': 'Viestin kieli' })
      for (const [code, label] of [['fi', 'Suomeksi'], ['en', 'In English']]) {
        const button = el('button', { type: 'button', class: 'small ghost', 'aria-pressed': String(code === lang) }, label)
        button.addEventListener('click', () => {
          lang = code
          toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)))
          setMessage()
        })
        toggle.append(button)
      }

      return [
        el('div', { class: 'linkedin-actions' }, linkedInButtons),
        el('div', { class: 'share-message-head' }, [el('h3', { lang: 'fi' }, 'Viesti vastaanottajalle'), toggle]),
        textarea,
        el('p', {}, copyButton(() => textarea.value)),
      ]
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
        form,
        errorEl,
        links.length ? el('ul', { class: 'share-links' }, links.map(linkItem)) : '',
        ...(selected ? forLink(selected) : [])
      )
    }

    render()
    dialog.showModal()
    if (!links.length) labelInput.focus()
  }

  return { open }
})()
