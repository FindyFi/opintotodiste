import { loadEnvManifest, missingRequired } from './env-manifest.js'

// Imported by index.js straight after dotenv and before anything that reads
// the environment, so a production start with gaps fails once, with every
// missing name, instead of at the first variable some module trips over.
// Outside production the dev defaults still apply.
if (process.env.NODE_ENV === 'production') {
  const missing = missingRequired(loadEnvManifest(), process.env)
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }
}
