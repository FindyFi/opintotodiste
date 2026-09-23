import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('Postgres is not configured (set DATABASE_URL).')
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// Arbitrary constant. Only matters that every instance bootstrapping this
// database picks the same one.
const SCHEMA_LOCK_KEY = 4171580989

export async function runSchema() {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))
  const schema = await readFile(schemaPath, 'utf8')
  // CREATE TABLE IF NOT EXISTS is not atomic: two connections can both find a
  // table missing and then collide inserting into pg_type, which surfaces as a
  // duplicate key on pg_type_typname_nsp_index and kills startup. The test
  // suite boots three apps against one database in parallel, and a rolling
  // deploy starts replicas together, so serialise the whole bootstrap. The
  // lock has to share a connection with the DDL, hence the explicit client;
  // pg_advisory_xact_lock releases on COMMIT or ROLLBACK, so nothing leaks.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [SCHEMA_LOCK_KEY])
    await client.query(schema)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
