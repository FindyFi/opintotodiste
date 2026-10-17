// Progressive enhancement for the shared collection page (src/views/shared-collection.js):
// an item's name opens the credential detail dialog instead of navigating to
// its public page. The href still works without this script (or for an id
// it can't find), so it stays a plain link in the markup.
document.addEventListener('DOMContentLoaded', () => {
  const items = window.__ITEMS__ || []
  document.querySelectorAll('.credential-name[data-item-id]').forEach((link) => {
    const item = items.find((i) => i.id === link.dataset.itemId)
    if (!item) return
    link.addEventListener('click', (e) => {
      e.preventDefault()
      Detail.open(item.credential)
    })
  })
})
