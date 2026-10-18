import { pool } from './db.js'
import { mergedImport } from './koski.js'

export async function findImport(ownerId) {
  const { rows } = await pool.query('SELECT koski_url, data, removed FROM koski_imports WHERE owner_id = $1', [ownerId])
  return rows[0] ? { koskiUrl: rows[0].koski_url, data: rows[0].data, removed: rows[0].removed } : null
}

// Merges an import into the owner's stored one (see mergedImport), under a row
// lock so two imports at once don't lose each other's study rights.
export async function saveImport(ownerId, incoming) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT koski_url, data, removed FROM koski_imports WHERE owner_id = $1 FOR UPDATE', [ownerId])
    const previous = rows[0] ? { data: rows[0].data, removed: rows[0].removed } : null
    const next = mergedImport(previous, incoming)
    await client.query(
      `INSERT INTO koski_imports (owner_id, koski_url, data, removed) VALUES ($1, $2, $3, $4)
       ON CONFLICT (owner_id) DO UPDATE SET koski_url = $2, data = $3, removed = $4, updated_at = now()`,
      [ownerId, next.koskiUrl, next.data, next.removed]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function removeRecord(ownerId, ref) {
  await pool.query(
    `UPDATE koski_imports SET removed = array_append(removed, $2), updated_at = now()
     WHERE owner_id = $1 AND NOT ($2 = ANY(removed))`,
    [ownerId, ref]
  )
}

export async function deleteImport(ownerId) {
  await pool.query('DELETE FROM koski_imports WHERE owner_id = $1', [ownerId])
}
