// The "Add to wallet" dialog (QR code, deep link, tx code if any), shared by the
// credential list and the collections page. Both pages provide
// <dialog id="detailDialog"> with a #detailDialogContent child. While it is
// open, it polls POST /wallet-offers/status and shows each offer as waiting,
// picked up or expired, so the user notices if someone else scanned a code
// first (threat analysis T11). A wallet that sends OID4VCI notifications also
// tells whether it stored the badge, failed to, or the user declined it.
const WalletOffer = (() => {
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag)
    Object.entries(props).forEach(([key, value]) => node.setAttribute(key, value))
    ;[].concat(children).forEach((child) => {
      node.append(child instanceof Node ? child : document.createTextNode(child))
    })
    return node
  }

  const POLL_MS = 3000

  // The issuer forgets a used offer a few minutes after use, so a picked-up
  // offer later reads as expired: once picked up, it stays picked up here
  // unless a notification arrives. A notification is final.
  const STATUS_TEXT = {
    waiting: () => [el('span', { lang: 'fi' }, 'Odottaa lompakkoa')],
    'picked-up': () => [
      el('strong', { lang: 'fi' }, '✓ Koodi skannattiin'),
      el('br'),
      el('span', { class: 'muted', lang: 'fi' }, 'Jos merkki ei tullut lompakkoosi, joku muu ehti skannata koodin.'),
    ],
    expired: () => [el('span', { lang: 'fi' }, 'Koodi vanheni. Valitse Lisää lompakkoon uudelleen.')],
    stored: () => [el('strong', { lang: 'fi' }, '✓ Tallennettu lompakkoon')],
    failed: () => [
      el('strong', { lang: 'fi' }, 'Lompakko ilmoitti virheestä'),
      el('br'),
      el('span', { class: 'muted', lang: 'fi' }, 'Merkki ei tallentunut. Valitse Lisää lompakkoon uudelleen tai kokeile toista lompakkoa.'),
    ],
    declined: () => [
      el('strong', { lang: 'fi' }, 'Merkkiä ei tallennettu'),
      el('br'),
      el('span', { class: 'muted', lang: 'fi' }, 'Todiste hylättiin lompakossa. Valitse Lisää lompakkoon uudelleen, jos haluat sen sittenkin.'),
    ],
  }

  // From each state, the states the dialog moves on to; the rest are final.
  const NEXT = {
    waiting: ['picked-up', 'expired', 'stored', 'failed', 'declined'],
    'picked-up': ['stored', 'failed', 'declined'],
  }

  function setStatus(offer, state) {
    if (offer.state && !NEXT[offer.state]?.includes(state)) return
    offer.state = state
    offer.node.dataset.state = state
    offer.status.replaceChildren(...STATUS_TEXT[state]())
  }

  function watch(dialog, offers) {
    let timer
    // A picked-up offer is asked about until a notification arrives or the
    // issuer forgets the offer (expired), which ends its polling.
    const pending = () => offers.filter((o) => NEXT[o.state] && !o.gone)
    async function poll() {
      const now = Date.now()
      pending().forEach((o) => o.state === 'waiting' && o.expiresAt && now >= o.expiresAt && setStatus(o, 'expired'))
      const codes = pending().map((o) => o.code)
      if (!codes.length || !dialog.open || !offers[0].node.isConnected) return
      try {
        const res = await fetch('/wallet-offers/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ codes }),
        })
        if (res.ok) {
          const statuses = await res.json()
          offers.forEach((o) => {
            if (statuses[o.code] === 'expired') o.gone = true
            if (statuses[o.code]) setStatus(o, statuses[o.code])
          })
        }
      } catch {
        // A missed poll is not worth an error message; try again next time.
      }
      timer = setTimeout(poll, POLL_MS)
    }
    dialog.addEventListener('close', () => clearTimeout(timer), { once: true })
    timer = setTimeout(poll, POLL_MS)
  }

  function formatDuration(seconds) {
    const minutes = Math.round(seconds / 60)
    return minutes >= 1 ? `${minutes} min` : `${seconds} s`
  }

  // results: [{ name, offerUri, qrDataUrl, txCode, expiresIn, code } | { name, error, errorLink, errorLang }]
  function show(results) {
    const offers = []
    const dialog = document.getElementById('detailDialog')
    const content = [el('h2', { lang: 'fi' }, 'Lisää lompakkoon'), el('p', { lang: 'fi' }, 'Skannaa QR-koodi lompakkosovelluksella.')]
    results.forEach((r) => {
      if (r.error) {
        content.push(el('div', { class: 'wallet-offer' }, [el('strong', {}, r.name), el('div', { class: 'row-error' }, Detail.errorContent({ message: r.error, link: r.errorLink, lang: r.errorLang }))]))
        return
      }
      const item = [
        el('h3', {}, r.name),
        el('img', { src: r.qrDataUrl, alt: 'QR', width: '180', height: '180' }),
        el('p', {}, el('a', { href: r.offerUri, lang: 'fi' }, 'Avaa lompakkosovelluksessa')),
      ]
      if (r.txCode) item.push(el('p', {}, [el('span', { lang: 'fi' }, 'Vahvistuskoodi:'), ' ', el('strong', {}, r.txCode)]))
      if (r.expiresIn) item.push(el('p', { class: 'muted' }, [el('span', { lang: 'fi' }, 'Voimassa:'), ' ', formatDuration(r.expiresIn)]))
      const node = el('div', { class: 'wallet-offer' }, item)
      if (r.code) {
        const offer = { code: r.code, node, status: el('p', { class: 'offer-status', role: 'status' }) }
        if (r.expiresIn) offer.expiresAt = Date.now() + r.expiresIn * 1000
        node.append(offer.status)
        setStatus(offer, 'waiting')
        offers.push(offer)
      }
      content.push(node)
    })
    document.getElementById('detailDialogContent').replaceChildren(...content)
    dialog.showModal()
    if (offers.length) watch(dialog, offers)
  }

  return { show }
})()
