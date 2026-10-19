// Filters a list by values shown in its rows. Each value becomes a link that
// adds a filter; the active filters live in the URL query (?type=Course&...),
// so the back button undoes one and a filtered view can be bookmarked. The
// list itself stays with the caller:
//   const filter = ListFilter.create({
//     fields: [{ key: 'type', label: 'tyyppi' }, ...],  // label: Finnish, translated
//     onChange: render,                                 // after a filter changes
//   })
//   filter.matches((key) => valueOf(row, key))  // does a row pass every filter?
//   filter.link('type', 'Course')               // a value in a row, as a filter link
//   filter.bar()                                // "Suodatettu: (x) tyyppi: Course", or null
//   filter.prune((key, value) => anyRowHas)     // drops filters no row matches
// Values are compared as they are given; `text` (link) or a field's `format`
// (chips) changes only what is shown.
const ListFilter = (() => {
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

  function create({ fields, onChange }) {
    // The active filters, read from the URL in field order.
    function active() {
      const params = new URLSearchParams(location.search)
      return fields.filter((f) => params.get(f.key)).map((f) => ({ field: f, value: params.get(f.key) }))
    }

    // The current URL with each key in `changes` set to its value (or removed
    // for null). Other query parameters are kept.
    function urlWith(changes) {
      const params = new URLSearchParams(location.search)
      Object.entries(changes).forEach(([key, value]) => (value == null ? params.delete(key) : params.set(key, value)))
      const query = params.toString()
      return location.pathname + (query ? `?${query}` : '') + location.hash
    }

    // A link that goes to `href` without a page load.
    function navLink(href, props, children) {
      const a = el('a', { ...props, href }, children)
      a.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        history.pushState(null, '', href)
        onChange()
      })
      return a
    }

    function matches(valueOf) {
      return active().every(({ field, value }) => String(valueOf(field.key) ?? '') === value)
    }

    function link(key, value, text = value) {
      return navLink(urlWith({ [key]: value }), { class: 'filter-link' }, text)
    }

    function bar() {
      const filters = active()
      if (!filters.length) return null
      const chips = filters.map(({ field, value }) =>
        el('span', { class: 'filter-chip' }, [
          navLink(urlWith({ [field.key]: null }), { class: 'filter-remove', 'aria-label': 'Poista suodatin', title: 'Poista suodatin' }, '×'),
          el('span', { lang: 'fi' }, field.label + ':'),
          ' ',
          field.format ? field.format(value) : value,
        ])
      )
      return el('div', { class: 'filter-bar' }, [el('span', { class: 'filter-bar-label', lang: 'fi' }, 'Suodatettu:'), ...chips])
    }

    // Drops, without a history entry, the filters whose value no row has any
    // more (e.g. the last matching credential was deleted).
    function prune(hasValue) {
      const stale = active().filter(({ field, value }) => !hasValue(field.key, value))
      if (stale.length) history.replaceState(history.state, '', urlWith(Object.fromEntries(stale.map(({ field }) => [field.key, null]))))
    }

    window.addEventListener('popstate', () => onChange())

    return { matches, link, bar, prune }
  }

  return { create }
})()
