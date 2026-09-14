import { randomBytes } from 'node:crypto'
import { pool } from './db.js'

export class NotFoundError extends Error {}

function newShareToken() {
  return randomBytes(24).toString('base64url')
}

function toCollection(row) {
  return {
    id: row.id,
    name: row.name,
    shareToken: row.share_token,
    itemCount: 'item_count' in row ? row.item_count : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCollections(ownerId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.share_token, c.created_at, c.updated_at, COUNT(i.id)::int AS item_count
     FROM collections c
     LEFT JOIN collection_items i ON i.collection_id = c.id
     WHERE c.owner_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [ownerId]
  )
  return rows.map(toCollection)
}

export async function createCollection(ownerId, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('Please enter a collection name.')
  const { rows } = await pool.query(
    `INSERT INTO collections (owner_id, name, share_token) VALUES ($1, $2, $3)
     RETURNING id, name, share_token, created_at, updated_at`,
    [ownerId, trimmed, newShareToken()]
  )
  return { ...toCollection(rows[0]), itemCount: 0 }
}

// Confirms the collection exists and belongs to ownerId, throwing NotFoundError
// otherwise - shared by every mutation below so a stranger's collection id
// reads as "not found" rather than leaking whether it exists.
export async function assertOwnedCollection(ownerId, collectionId) {
  const { rows } = await pool.query('SELECT id FROM collections WHERE id = $1 AND owner_id = $2', [
    collectionId,
    ownerId,
  ])
  if (!rows[0]) throw new NotFoundError('Collection not found.')
}

export async function renameCollection(ownerId, collectionId, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('Please enter a collection name.')
  await assertOwnedCollection(ownerId, collectionId)
  const { rows } = await pool.query(
    `UPDATE collections SET name = $1, updated_at = now() WHERE id = $2
     RETURNING id, name, share_token, created_at, updated_at`,
    [trimmed, collectionId]
  )
  return toCollection(rows[0])
}

export async function deleteCollection(ownerId, collectionId) {
  const { rowCount } = await pool.query('DELETE FROM collections WHERE id = $1 AND owner_id = $2', [
    collectionId,
    ownerId,
  ])
  if (!rowCount) throw new NotFoundError('Collection not found.')
}

export async function regenerateShareToken(ownerId, collectionId) {
  await assertOwnedCollection(ownerId, collectionId)
  const { rows } = await pool.query(
    `UPDATE collections SET share_token = $1, updated_at = now() WHERE id = $2
     RETURNING id, name, share_token, created_at, updated_at`,
    [newShareToken(), collectionId]
  )
  return toCollection(rows[0])
}

// credential is an immutable snapshot (the signed VC) - see src/schema.sql.
export async function addItem(ownerId, collectionId, credential) {
  await assertOwnedCollection(ownerId, collectionId)
  const { rows } = await pool.query(
    'INSERT INTO collection_items (collection_id, credential) VALUES ($1, $2) RETURNING id, added_at',
    [collectionId, credential]
  )
  return { id: rows[0].id, addedAt: rows[0].added_at }
}

export async function findByShareToken(token) {
  const { rows } = await pool.query('SELECT id, name, created_at FROM collections WHERE share_token = $1', [token])
  if (!rows[0]) return null
  const collection = { id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at }
  const { rows: itemRows } = await pool.query(
    'SELECT id, credential, added_at FROM collection_items WHERE collection_id = $1 ORDER BY added_at',
    [collection.id]
  )
  return { collection, items: itemRows.map((r) => ({ id: r.id, credential: r.credential, addedAt: r.added_at })) }
}

export async function findItemByShareToken(token, itemId) {
  const { rows } = await pool.query(
    `SELECT i.credential FROM collection_items i
     JOIN collections c ON c.id = i.collection_id
     WHERE c.share_token = $1 AND i.id = $2`,
    [token, itemId]
  )
  return rows[0]?.credential ?? null
}
