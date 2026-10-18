import { knownDefaults, loadEnvManifest, missingRequired } from './env-manifest.js'

// Imported by index.js straight after dotenv and before anything that reads
// the environment, so a production start with gaps fails once, with every
// missing name, instead of at the first variable some module trips over.
// Outside production the dev defaults still apply.
// Secrets left at a placeholder value from this repository count as gaps too.
if (process.env.NODE_ENV === 'production') {
  const manifest = loadEnvManifest()
  const missing = missingRequired(manifest, process.env)
  const defaults = knownDefaults(manifest, process.env)
  if (missing.length) console.error(`Missing required environment variables: ${missing.join(', ')}`)
  if (defaults.length) console.error(`Environment variables still set to a development default: ${defaults.join(', ')}`)
  if (missing.length || defaults.length) process.exit(1)
}
