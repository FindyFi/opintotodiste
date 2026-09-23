import { createServer } from 'node:http'
import { once } from 'node:events'

/**
 * Starts a throwaway HTTP server that records what it was called with and
 * replies with whatever `handler` returns. Used to stand in for the external
 * services this app talks to (Koski, signing-service, oid4vci-issuer)
 * without reaching the network.
 */
export async function startStubServer(handler) {
  const requests = []

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      const request = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body ? JSON.parse(body) : undefined,
      }
      requests.push(request)

      const { status = 200, json, text } = (await handler(request)) ?? {}
      if (text !== undefined) {
        res.writeHead(status, { 'content-type': 'text/plain' })
        return res.end(text)
      }
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(json ?? {}))
    })
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    async stop() {
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
