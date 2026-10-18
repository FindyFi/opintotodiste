import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test, { describe } from 'node:test'

import { knownDefaults, loadEnvManifest, missingRequired, parseEnvManifest } from '../src/env-manifest.js'
import { APP_ENV_KEYS, cleanEnv } from './helpers/app.js'

const ROOT = new URL('../', import.meta.url)

function sourceFiles() {
  const files = [new URL('index.js', ROOT)]
  for (const name of readdirSync(new URL('src/', ROOT))) {
    if (name.endsWith('.js')) files.push(new URL(`src/${name}`, ROOT))
  }
  return files
}

/** Every env var the app reads: `process.env.X`, `process.env['X']` and `const { X } = process.env`. */
function envReads() {
  const names = new Set()
  for (const file of sourceFiles()) {
    const code = readFileSync(file, 'utf8')
    for (const m of code.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1])
    for (const m of code.matchAll(/process\.env\[\s*['"]([^'"]+)['"]\s*\]/g)) names.add(m[1])
    for (const m of code.matchAll(/\{([^{}]*)\}\s*=\s*process\.env\b/g)) {
      for (const part of m[1].split(',')) {
        const name = part.split(/[:=]/)[0].trim()
        if (name) names.add(name)
      }
    }
  }
  return names
}

const manifest = loadEnvManifest()
const listed = new Set(manifest.map((entry) => entry.name))
// Read by dependencies rather than by the app's own code.
const READ_BY_LIBRARIES = new Set(['PGPASSWORD'])

describe('.env.example manifest', () => {
  test('lists every variable the app reads', () => {
    const unlisted = [...envReads()].filter((name) => !listed.has(name) && name !== 'NODE_ENV')
    assert.deepEqual(unlisted, [], 'add these to .env.example with an "# @env required|optional [secret]" tag')
  })

  test('lists nothing the app does not read', () => {
    const reads = envReads()
    const stale = [...listed].filter((name) => !reads.has(name) && !READ_BY_LIBRARIES.has(name))
    assert.deepEqual(stale, [])
  })

  test('tags every variable exactly once', () => {
    const text = readFileSync(new URL('.env.example', ROOT), 'utf8')
    const tagLines = text.split('\n').filter((line) => /@env/.test(line))
    const varLines = text.split('\n').filter((line) => /^(#\s*)?[A-Z][A-Z0-9_]*=/.test(line))
    assert.equal(tagLines.length, varLines.length)
    assert.equal(manifest.length, varLines.length)
    assert.equal(listed.size, manifest.length, 'a variable is listed twice')
  })

  test('has the expected requirements', () => {
    const byName = Object.fromEntries(manifest.map((e) => [e.name, e]))
    for (const name of ['SESSION_SECRET', 'OID4VCI_ISSUER_TOKEN']) {
      assert.deepEqual([byName[name].required, byName[name].secret], [true, true], name)
    }
    for (const name of ['PORT', 'OID4VCI_CREDENTIAL_ISSUER_ID']) assert.equal(byName[name].required, false, name)
    assert.deepEqual(byName.PGPASSWORD, { name: 'PGPASSWORD', required: false, secret: true })
    assert.equal(byName.OID4VCI_CREDENTIAL_VCT.required, true)
    assert.equal(byName.OID4VCI_CREDENTIAL_CONFIGURATION_ID.required, true)
  })

  test('test helper APP_ENV_KEYS covers the manifest', () => {
    const missing = [...listed].filter((name) => !APP_ENV_KEYS.includes(name))
    assert.deepEqual(missing, [])
  })
})

describe('parseEnvManifest', () => {
  test('parses tags above set and unset variables', () => {
    const parsed = parseEnvManifest('# note\n# @env required secret\nA=1\n\n# @env optional\n# B=2\n')
    assert.deepEqual(parsed, [
      { name: 'A', required: true, secret: true },
      { name: 'B', required: false, secret: false },
    ])
  })

  test('rejects invalid, orphaned and detached tags', () => {
    assert.throws(() => parseEnvManifest('# @env mandatory\nA=1\n'), /invalid tag/)
    assert.throws(() => parseEnvManifest('# @env required public\nA=1\n'), /invalid tag/)
    assert.throws(() => parseEnvManifest('# @env required\n'), /orphaned/)
    assert.throws(() => parseEnvManifest('# @env required\n# comment\nA=1\n'), /not directly above/)
    assert.throws(() => parseEnvManifest('# @env required\n# @env optional\nA=1\n'), /two @env tags/)
  })

  test('knownDefaults names secrets left at a placeholder value', () => {
    const m = parseEnvManifest('# @env required secret\nA=1\n# @env optional secret\nB=1\n# @env required secret\nC=1\n# @env required\nD=1\n')
    const env = { A: 'change-me', B: 'dev-coordinator-token-change-me', C: 'a-real-secret', D: 'dev-not-secret' }
    assert.deepEqual(knownDefaults(m, env), ['A', 'B'])
    assert.deepEqual(knownDefaults(m, {}), [])
  })

  test('missingRequired names unset and empty required variables only', () => {
    const m = parseEnvManifest('# @env required\nA=1\n# @env required\nB=1\n# @env optional\nC=1\n')
    assert.deepEqual(missingRequired(m, { A: 'x', B: '' }), ['B'])
    assert.deepEqual(missingRequired(m, {}), ['A', 'B'])
  })
})

describe('startup in production', () => {
  function start(env) {
    return spawnSync(process.execPath, ['index.js'], {
      cwd: ROOT,
      env: { ...cleanEnv(), NODE_ENV: 'production', ...env },
      encoding: 'utf8',
      timeout: 15_000,
    })
  }

  test('exits non-zero naming every missing required variable', () => {
    const present = Object.fromEntries(manifest.filter((e) => e.required).map((e) => [e.name, 'x']))
    delete present.SESSION_SECRET
    delete present.OID4VCI_CREDENTIAL_VCT
    const result = start(present)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /SESSION_SECRET/)
    assert.match(result.stderr, /OID4VCI_CREDENTIAL_VCT/)
    assert.doesNotMatch(result.stderr, /Missing required.*DATABASE_URL/)
  })

  test('refuses secrets left at a development default', () => {
    const present = Object.fromEntries(manifest.filter((e) => e.required).map((e) => [e.name, 'x']))
    const result = start({ ...present, SESSION_SECRET: 'change-me', OID4VCI_ISSUER_TOKEN: 'dev-coordinator-token-change-me' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /development default: SESSION_SECRET, OID4VCI_ISSUER_TOKEN/)
    assert.doesNotMatch(result.stderr, /Missing required/)
  })

  test('names all of them when nothing is set', () => {
    const result = start({})
    assert.notEqual(result.status, 0)
    for (const { name } of manifest.filter((e) => e.required)) assert.ok(result.stderr.includes(name), name)
  })
})
