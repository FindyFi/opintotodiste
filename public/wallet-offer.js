// The "Add to wallet" dialog (QR code, deep link, tx code if any), shared by the
// credential list and the collections page. Both pages provide
// <dialog id="detailDialog"> with a #detailDialogContent child.
const WalletOffer = (() => {
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag)
    Object.entries(props).forEach(([key, value]) => node.setAttribute(key, value))
    ;[].concat(children).forEach((child) => {
      node.append(child instanceof Node ? child : document.createTextNode(child))
    })
    return node
  }

  function formatDuration(seconds) {
    const minutes = Math.round(seconds / 60)
    return minutes >= 1 ? `${minutes} min` : `${seconds} s`
  }

  // results: [{ name, offerUri, qrDataUrl, txCode, expiresIn } | { name, error }]
  function show(results) {
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
      content.push(el('div', { class: 'wallet-offer' }, item))
    })
    document.getElementById('detailDialogContent').replaceChildren(...content)
    dialog.showModal()
  }

  return { show }
})()
