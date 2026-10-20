// The "Add to wallet" dialog (QR code, deep link, tx code if any), shared by the
// credential list and the collections page. Both pages provide
// <dialog id="detailDialog"> with a #detailDialogContent child. While it is
// open, it polls POST /wallet-offers/status and shows each offer as waiting,
// picked up or expired, so the user notices if someone else scanned a code
// first (threat analysis T11).
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

  // The issuer forgets a used offer a minute after use, so a picked-up offer
  // later reads as expired: once picked up, it stays picked up here.
  const STATUS_TEXT = {
    waiting: () => [el('span', { lang: 'fi' }, 'Odottaa lompakkoa')],
    'picked-up': () => [
      el('strong', { lang: 'fi' }, '✓ Lisätty lompakkoon'),
      el('br'),
      el('span', { class: 'muted', lang: 'fi' }, 'Jos merkki ei tullut lompakkoosi, joku muu ehti skannata koodin.'),
    ],
    expired: () => [el('span', { lang: 'fi' }, 'Koodi vanheni. Valitse Lisää lompakkoon uudelleen.')],
  }

  function setStatus(offer, state) {
    if (offer.state === state || offer.state === 'picked-up' || offer.state === 'expired') return
    offer.state = state
    offer.node.dataset.state = state
    offer.status.replaceChildren(...STATUS_TEXT[state]())
  }

  function watch(dialog, offers) {
    let timer
    const pending = () => offers.filter((o) => o.state === 'waiting')
    async function poll() {
      const now = Date.now()
      pending().forEach((o) => o.expiresAt && now >= o.expiresAt && setStatus(o, 'expired'))
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
          offers.forEach((o) => statuses[o.code] && setStatus(o, statuses[o.code]))
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

  // results: [{ name, offerUri, qrDataUrl, txCode, expiresIn, code } | { name, error }]
  function show(results) {
    const offers = []
    const dialog = document.getElementById('detailDialog')
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
