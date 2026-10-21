// A fixed-window request limit per client IP, kept in this process's memory.
// It is a floor against scripts hammering the expensive routes (Koski fetches,
// signing, wallet offers, passkey challenges) and against Koski blocking us for
// proxying too much; the load balancer or a WAF is where heavier limits belong.
// Each app instance counts on its own, so the effective limit scales with the
// number of instances. Behind a proxy, req.ip needs `trust proxy` (index.js).
export function rateLimit({ windowMs, max, message = 'Liian monta pyyntöä. Odota hetki ja yritä uudelleen.' }) {
  const hits = new Map()
  let windowStart = Date.now()

  return function rateLimiter(req, res, next) {
    const now = Date.now()
    if (now - windowStart >= windowMs) {
      hits.clear()
      windowStart = now
    }
    const count = (hits.get(req.ip) ?? 0) + 1
    hits.set(req.ip, count)
    if (count > max) {
      res.set('Retry-After', String(Math.ceil((windowStart + windowMs - now) / 1000)))
      return res.status(429).json({ error: message, lang: 'fi' })
    }
    next()
  }
}
