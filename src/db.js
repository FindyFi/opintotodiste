import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('Postgres is not configured (set DATABASE_URL).')
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export async function runSchema() {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))
  const schema = await readFile(schemaPath, 'utf8')
  await pool.query(schema)
}
