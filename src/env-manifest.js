import { readFileSync } from 'node:fs'

const MANIFEST_URL = new URL('../.env.example', import.meta.url)
const TAG = /^#\s*@env\s+(\S+)(?:\s+(\S+))?\s*$/
const VAR = /^(?:#\s*)?([A-Z][A-Z0-9_]*)=/

/**
 * Parses the `@env` tags of an .env.example. A tag line directly above a
 * variable line (`NAME=value`, or `# NAME=value` when unset by default) says
 * `# @env required|optional [secret]`. Returns [{ name, required, secret }].
 * Malformed or orphaned tags throw, so a typo can't quietly drop a variable.
 */
export function parseEnvManifest(text) {
  const manifest = []
  let pending = null
  for (const [index, line] of text.trimEnd().split('\n').entries()) {
    const where = `.env.example line ${index + 1}`
    const tag = line.match(TAG)
    if (tag) {
      if (pending) throw new Error(`${where}: two @env tags in a row`)
      const [, kind, flag] = tag
      if (!['required', 'optional'].includes(kind) || (flag !== undefined && flag !== 'secret')) {
        throw new Error(`${where}: invalid tag "${line.trim()}"`)
      }
      pending = { required: kind === 'required', secret: flag === 'secret' }
      continue
    }
    const variable = line.match(VAR)
    if (variable && pending) {
      manifest.push({ name: variable[1], ...pending })
      pending = null
    } else if (pending) {
      // description comments go above the tag, so only the variable may follow
      throw new Error(`${where}: @env tag is not directly above a variable`)
    }
  }
  if (pending) throw new Error('.env.example ends with an orphaned @env tag')
  return manifest
}

export function loadEnvManifest(url = MANIFEST_URL) {
  return parseEnvManifest(readFileSync(url, 'utf8'))
}

/** Names of required variables that are unset or empty in `env`. */
export function missingRequired(manifest, env = process.env) {
  return manifest.filter((entry) => entry.required && !env[entry.name]).map((entry) => entry.name)
}

// The placeholder secrets in .env.example, docker-compose.yml and index.js
// (`change-me`, `dev-…`). A deployment that copied one would let anyone mint
// session cookies or offers, so production refuses them like missing ones.
const KNOWN_DEFAULT = /change-me|^dev-/i

/** Names of secret variables set to one of this repository's placeholder values. */
export function knownDefaults(manifest, env = process.env) {
  return manifest.filter((entry) => entry.secret && env[entry.name] && KNOWN_DEFAULT.test(env[entry.name])).map((entry) => entry.name)
}
