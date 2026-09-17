import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import pg from 'pg'

const ROOT = new URL('../../', import.meta.url)

export const DEFAULT_DATABASE_URL = 'postgres://opintotodiste:opintotodiste@localhost:5432/opintotodiste'

// The app's own configuration, stripped from the inherited environment so a
// developer's exported vars can't quietly change what is under test.
const APP_ENV_KEYS = [
  'PORT',
  'SESSION_SECRET',
  'DATABASE_URL',
  'RP_ID',
  'RP_NAME',
  'ORIGIN',
  'ISSUER_ID',
  'ISSUER_NAME',
  'SIGNING_SERVICE_URL',
  'SIGNING_SERVICE_INSTANCE_ID',
  'SIGNING_SERVICE_SUITE',
  'OID4VCI_ISSUER_URL',
  'OID4VCI_ISSUER_INSTANCE',
  'OID4VCI_ISSUER_TOKEN',
]

function cleanEnv() {
  const env = { ...process.env }
  for (const key of APP_ENV_KEYS) delete env[key]
  return { ...env, DOTENV_CONFIG_PATH: '/dev/null' }
}

export function databaseUrl() {
  return process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_DATABASE_URL
}

/**
 * Returns a reason to skip, or null if a Postgres the app can use is
 * reachable. The app talks to a real database at import time, so the
 * database-backed tests can only run when one is up - a bare `git clone &&
 * npm test` should report them skipped, not failed.
 *
 * Skipping is a convenience for a bare clone, and a trap anywhere that is
 * supposed to be testing something: node:test reports a skipped `describe`
 * as zero tests rather than as a skip, so an unreachable database silently
 * turns this suite into nothing at all. Set REQUIRE_POSTGRES=1 - as CI does
 * - to turn that silence into a failure.
 */
export async function postgresUnavailable() {
  const client = new pg.Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 2000 })
  try {
    await client.connect()
    await client.end()
    return null
  } catch (err) {
    const detail = err.message || err.code || String(err)
    const reason = `no Postgres at ${databaseUrl()} (${detail})`
    if (process.env.REQUIRE_POSTGRES) {
      throw new Error(`${reason}, and REQUIRE_POSTGRES is set - refusing to skip the database-backed tests`)
    }
    return `${reason} - start one with \`docker compose up -d db\``
  }
}

async function freePort() {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const { port } = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  return port
}

async function waitForHealth(baseUrl, child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`App exited early with code ${child.exitCode}`)
    try {
      const res = await fetch(`${baseUrl}/healthz`)
      if (res.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`App did not become healthy within ${timeoutMs}ms`)
}

/**
 * Boots the real `index.js` in a child process against a live Postgres.
 * Testing the published entrypoint rather than importing routes means this
 * also covers schema bootstrapping and the env wiring the container depends
 * on.
 */
export async function startApp({ env = {} } = {}) {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`

  const child = spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...cleanEnv(),
      PORT: String(port),
      SESSION_SECRET: 'test-secret',
      DATABASE_URL: databaseUrl(),
      RP_ID: 'localhost',
      RP_NAME: 'Opintotodiste Test',
      ORIGIN: baseUrl,
      ISSUER_ID: 'did:web:example.org',
      ISSUER_NAME: 'Example Issuer',
      ...env,
    },
  })

  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  child.stdout.resume()

  try {
    await waitForHealth(baseUrl, child)
  } catch (err) {
    child.kill('SIGKILL')
    throw new Error(`${err.message}\n--- app stderr ---\n${stderr}`)
  }

  return {
    baseUrl,
    get stderr() {
      return stderr
    },
    async stop() {
      child.kill('SIGTERM')
      await once(child, 'exit')
    },
  }
}
