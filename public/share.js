// The share dialog, shared by the main page and the collections page (both
// provide <dialog id="detailDialog"> with a #detailDialogContent child).
//   Share.open({ collectionId })            the collection's link
//   Share.open({ collectionId, itemId })    the public page of one item
// It shows the link with a copy button, and a ready-made message for the
// recipient (fi/en) with a copy button of its own.
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
          ? 'jaan kanssasi digitaalisen todistuksen (Open Badges -osaamismerkin) osaamisestani.'
          : 'jaan kanssasi digitaaliset todistukseni (Open Badges -osaamismerkkejä) osaamisestani.',
        'Digitaalinen todistus on sähköisesti allekirjoitettu, joten sen aitouden voi tarkastaa ilman yhteydenottoa myöntäjään.',
        '',
        single ? `Todistuksen näet ja voit ladata täältä: ${link}` : `Todistukset näet ja voit ladata täältä: ${link}`,
        '',
        `Lisätietoa digitaalisista todistuksista: ${origin}/employer`,
        `Todistuksen voi tarkastaa täällä: ${origin}/verify`,
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

  async function open({ collectionId, itemId }) {
    const dialog = document.getElementById('detailDialog')
    const res = await fetch('/collections')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Request failed')
    const collection = data.collections.find((c) => c.id === collectionId)
    if (!collection) throw new Error('Collection not found.')

    const origin = location.origin
    const link = itemId
      ? `${origin}/c/${collection.shareToken}/items/${itemId}`
      : `${origin}/c/${collection.shareToken}`

    const linkEl = el('a', { class: 'share-link', href: link, target: '_blank', rel: 'noopener' }, link)
    const linkRow = el('div', { class: 'share-row' }, [linkEl, copyButton(() => link)])

    let lang = document.documentElement.lang === 'en' ? 'en' : 'fi'
    const textarea = el('textarea', { class: 'share-message', rows: '11', 'aria-label': 'Viesti' })
    const setMessage = () => {
      textarea.value = MESSAGES[lang]({ link, origin, single: Boolean(itemId) })
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

    dialog.querySelector('#detailDialogContent').replaceChildren(
      el('h2', { lang: 'fi' }, itemId ? 'Jaa todistus' : 'Jaa kokoelma'),
      el(
        'p',
        { class: 'muted', lang: 'fi' },
        itemId
          ? 'Linkin avaaja näkee tämän todistuksen ja voi ladata sen. Linkki lakkaa toimimasta, kun kokoelman jakolinkki uusitaan.'
          : 'Linkin avaaja näkee kokoelman kaikki todistukset ja voi ladata ne. Voit sulkea linkin luomalla kokoelmalle uuden jakolinkin.'
      ),
      linkRow,
      el('div', { class: 'share-message-head' }, [el('h3', { lang: 'fi' }, 'Viesti vastaanottajalle'), toggle]),
      textarea,
      el('p', {}, copyButton(() => textarea.value))
    )
    dialog.showModal()
  }

  return { open }
})()
