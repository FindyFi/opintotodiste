import { randomBytes } from 'node:crypto'
import { pool } from './db.js'

export class NotFoundError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LABEL_MAX_LENGTH = 100

function newShareToken() {
  return randomBytes(24).toString('base64url')
}

function toCollection(row) {
  return {
    id: row.id,
    name: row.name,
    itemCount: 'item_count' in row ? row.item_count : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toItem(row) {
  return { id: row.id, credential: row.credential, addedAt: row.added_at }
}

// --- Saved credentials -------------------------------------------------------

// credential is an immutable snapshot (the signed VC) - see src/schema.sql.
// Saving the same achievement again returns the copy already saved, so a user
// who reloads their Koski data (which signs afresh, with a new VC id) doesn't
// end up with duplicates, and links to the saved copy keep working.
export async function saveCredential(ownerId, credential) {
  const { rows: existing } = await pool.query(
    `SELECT id, added_at FROM saved_credentials
     WHERE owner_id = $1 AND credential->'credentialSubject' = $2::jsonb
       AND credential->>'issuanceDate' IS NOT DISTINCT FROM $3`,
    [ownerId, JSON.stringify(credential.credentialSubject ?? null), credential.issuanceDate ?? null]
  )
  if (existing[0]) return { id: existing[0].id, addedAt: existing[0].added_at }
  const { rows } = await pool.query(
    'INSERT INTO saved_credentials (owner_id, credential) VALUES ($1, $2) RETURNING id, added_at',
    [ownerId, credential]
  )
  return { id: rows[0].id, addedAt: rows[0].added_at }
}

export async function listSavedCredentials(ownerId) {
  const { rows } = await pool.query(
    'SELECT id, credential, added_at FROM saved_credentials WHERE owner_id = $1 ORDER BY added_at DESC, id',
    [ownerId]
  )
  return rows.map(toItem)
}

// The stored credential, or null unless ownerId saved it - callers answer 404
// either way so ids of strangers' credentials don't leak.
export async function findSavedCredential(ownerId, credentialId) {
  if (!UUID.test(credentialId ?? '')) return null
  const { rows } = await pool.query('SELECT credential FROM saved_credentials WHERE id = $1 AND owner_id = $2', [
    credentialId,
    ownerId,
  ])
  return rows[0]?.credential ?? null
}

// Removes it from every collection and breaks every link to it.
export async function deleteSavedCredential(ownerId, credentialId) {
  if (!UUID.test(credentialId ?? '')) throw new NotFoundError('Credential not found.')
  const { rowCount } = await pool.query('DELETE FROM saved_credentials WHERE id = $1 AND owner_id = $2', [
    credentialId,
    ownerId,
  ])
  if (!rowCount) throw new NotFoundError('Credential not found.')
}

// --- Collections -------------------------------------------------------------

export async function listCollections(ownerId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.created_at, c.updated_at, COUNT(i.credential_id)::int AS item_count
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
    `INSERT INTO collections (owner_id, name) VALUES ($1, $2)
     RETURNING id, name, created_at, updated_at`,
    [ownerId, trimmed]
  )
  return { ...toCollection(rows[0]), itemCount: 0 }
}

// Confirms the collection exists and belongs to ownerId, throwing NotFoundError
// otherwise - shared by every mutation below so a stranger's collection id
// reads as "not found" rather than leaking whether it exists.
export async function assertOwnedCollection(ownerId, collectionId) {
  if (!UUID.test(collectionId ?? '')) throw new NotFoundError('Collection not found.')
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
     RETURNING id, name, created_at, updated_at`,
    [trimmed, collectionId]
  )
  return toCollection(rows[0])
}

// The saved credentials stay; only the grouping (and its links) goes.
export async function deleteCollection(ownerId, collectionId) {
  await assertOwnedCollection(ownerId, collectionId)
  await pool.query('DELETE FROM collections WHERE id = $1', [collectionId])
}

// Puts a credential ownerId has saved into ownerId's collection; adding it
// twice is a no-op.
export async function addItem(ownerId, collectionId, credentialId) {
  await assertOwnedCollection(ownerId, collectionId)
  if (!(await findSavedCredential(ownerId, credentialId))) throw new NotFoundError('Credential not found.')
  await pool.query(
    'INSERT INTO collection_items (collection_id, credential_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [collectionId, credentialId]
  )
  await pool.query('UPDATE collections SET updated_at = now() WHERE id = $1', [collectionId])
}

// Takes the credential out of the collection; it stays saved, and its own
// links keep working.
export async function removeItem(ownerId, collectionId, credentialId) {
  if (!UUID.test(credentialId ?? '')) throw new NotFoundError('Credential not found.')
  await assertOwnedCollection(ownerId, collectionId)
  const { rowCount } = await pool.query(
    'DELETE FROM collection_items WHERE collection_id = $1 AND credential_id = $2',
    [collectionId, credentialId]
  )
  if (!rowCount) throw new NotFoundError('Credential not found.')
  await pool.query('UPDATE collections SET updated_at = now() WHERE id = $1', [collectionId])
}

async function itemsOf(collectionId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.credential, i.added_at FROM collection_items i
     JOIN saved_credentials s ON s.id = i.credential_id
     WHERE i.collection_id = $1 ORDER BY i.added_at, s.id`,
    [collectionId]
  )
  return rows.map(toItem)
}

// Items are identified by the saved credential's id.
export async function listItems(ownerId, collectionId) {
  await assertOwnedCollection(ownerId, collectionId)
  return itemsOf(collectionId)
}

// --- Share links ---------------------------------------------------------------

function toShareLink(row) {
  return {
    id: row.id,
    label: row.label,
    path: row.collection_id ? `/c/${row.token}` : `/i/${row.token}`,
    createdAt: row.created_at,
  }
}

// target is { collectionId } or { credentialId }, owned by ownerId.
async function assertOwnedTarget(ownerId, { collectionId, credentialId }) {
  if (collectionId) return assertOwnedCollection(ownerId, collectionId)
  if (credentialId && (await findSavedCredential(ownerId, credentialId))) return
  throw new NotFoundError('Credential not found.')
}

export async function listShareLinks(ownerId, target) {
  await assertOwnedTarget(ownerId, target)
  const column = target.collectionId ? 'collection_id' : 'credential_id'
  const { rows } = await pool.query(
    `SELECT id, token, label, collection_id, created_at FROM share_links WHERE ${column} = $1
     ORDER BY created_at DESC, id`,
    [target.collectionId ?? target.credentialId]
  )
  return rows.map(toShareLink)
}

export async function createShareLink(ownerId, target, label) {
  const trimmed = (label || '').trim()
  if (!trimmed) throw new Error('Please name the recipient.')
  if (trimmed.length > LABEL_MAX_LENGTH) throw new Error(`Keep the name under ${LABEL_MAX_LENGTH} characters.`)
  await assertOwnedTarget(ownerId, target)
  const { rows } = await pool.query(
    `INSERT INTO share_links (token, label, collection_id, credential_id) VALUES ($1, $2, $3, $4)
     RETURNING id, token, label, collection_id, created_at`,
    [newShareToken(), trimmed, target.collectionId || null, target.collectionId ? null : target.credentialId]
  )
  return toShareLink(rows[0])
}

export async function deleteShareLink(ownerId, linkId) {
  if (!UUID.test(linkId ?? '')) throw new NotFoundError('Link not found.')
  const { rowCount } = await pool.query(
    `DELETE FROM share_links l
     WHERE l.id = $1 AND (
       EXISTS (SELECT 1 FROM collections c WHERE c.id = l.collection_id AND c.owner_id = $2) OR
       EXISTS (SELECT 1 FROM saved_credentials s WHERE s.id = l.credential_id AND s.owner_id = $2))`,
    [linkId, ownerId]
  )
  if (!rowCount) throw new NotFoundError('Link not found.')
}

// --- Public pages ----------------------------------------------------------------

export async function findSharedCollection(token) {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.created_at FROM share_links l
     JOIN collections c ON c.id = l.collection_id WHERE l.token = $1`,
    [token]
  )
  if (!rows[0]) return null
  const collection = { id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at }
  return { collection, items: await itemsOf(collection.id) }
}

// One item of a shared collection: null for an unknown token, an item that
// isn't in that collection (any more), and an itemId that isn't a UUID
// (Postgres would throw on it).
export async function findSharedCollectionItem(token, itemId) {
  if (!UUID.test(itemId ?? '')) return null
  const { rows } = await pool.query(
    `SELECT s.credential FROM share_links l
     JOIN collection_items i ON i.collection_id = l.collection_id
     JOIN saved_credentials s ON s.id = i.credential_id
     WHERE l.token = $1 AND s.id = $2`,
    [token, itemId]
  )
  return rows[0]?.credential ?? null
}

// The credential behind a single-credential link, or null.
export async function findSharedCredential(token) {
  const { rows } = await pool.query(
    `SELECT s.credential FROM share_links l
     JOIN saved_credentials s ON s.id = l.credential_id WHERE l.token = $1`,
    [token]
  )
  return rows[0]?.credential ?? null
}
