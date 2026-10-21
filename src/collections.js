import { randomBytes } from 'node:crypto'
import { pool } from './db.js'

import { UserError } from './user-error.js'

export class NotFoundError extends UserError {
  constructor(message) {
    super(message, { status: 404 })
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LABEL_MAX_LENGTH = 100 // also in the message below

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
// Saving the same achievement again returns the copy already saved: the one
// signed from the same Koski record (`recordRef`), or one saved before records
// had refs with the same achievement (credentialKey in src/badges.js), which
// then gets the ref. So links to the saved copy keep working however often the
// record is signed.
export async function saveCredential(ownerId, credential, recordRef = null) {
  const existing = (recordRef && (await findSavedByRef(ownerId, recordRef))) || (await findSavedLike(ownerId, credential))
  if (existing) {
    if (recordRef && !existing.recordRef) {
      await pool.query('UPDATE saved_credentials SET record_ref = $2 WHERE id = $1', [existing.id, recordRef])
    }
    return { id: existing.id, addedAt: existing.addedAt }
  }
  const { rows } = await pool.query(
    'INSERT INTO saved_credentials (owner_id, credential, record_ref) VALUES ($1, $2, $3) RETURNING id, added_at',
    [ownerId, credential, recordRef]
  )
  return { id: rows[0].id, addedAt: rows[0].added_at }
}

// A new signed copy in place of an expired one (a student status signed
// again, K3). The id stays, so the copy stays in its collections and links.
export async function replaceSavedCredential(ownerId, id, credential) {
  await pool.query('UPDATE saved_credentials SET credential = $3 WHERE owner_id = $1 AND id = $2', [ownerId, id, credential])
}

export async function findSavedByRef(ownerId, recordRef) {
  const { rows } = await pool.query(
    `SELECT id, credential, added_at, record_ref FROM saved_credentials WHERE owner_id = $1 AND record_ref = $2
     ORDER BY added_at, id LIMIT 1`,
    [ownerId, recordRef]
  )
  return rows[0] ? { id: rows[0].id, credential: rows[0].credential, addedAt: rows[0].added_at, recordRef: rows[0].record_ref } : null
}

async function findSavedLike(ownerId, credential) {
  const subject = credential.credentialSubject ?? null
  const achievementId = subject?.achievement?.id ?? null
  const { rows } = await pool.query(
    `SELECT id, added_at, record_ref FROM saved_credentials
     WHERE owner_id = $1 AND credential->>'issuanceDate' IS NOT DISTINCT FROM $3
       AND CASE WHEN $4::text IS NULL THEN credential->'credentialSubject' = $2::jsonb
           ELSE credential->'credentialSubject'->'achievement'->>'id' = $4
             AND credential->'credentialSubject'->>'id' IS NOT DISTINCT FROM $5 END
     ORDER BY added_at, id LIMIT 1`,
    [ownerId, JSON.stringify(subject), credential.issuanceDate ?? null, achievementId, subject?.id ?? null]
  )
  return rows[0] ? { id: rows[0].id, addedAt: rows[0].added_at, recordRef: rows[0].record_ref } : null
}

export async function listSavedCredentials(ownerId) {
  const { rows } = await pool.query(
    'SELECT id, credential, added_at, record_ref FROM saved_credentials WHERE owner_id = $1 ORDER BY added_at DESC, id',
    [ownerId]
  )
  return rows.map((row) => ({ ...toItem(row), recordRef: row.record_ref }))
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
  if (!UUID.test(credentialId ?? '')) throw new NotFoundError('Todistetta ei löytynyt.')
  const { rowCount } = await pool.query('DELETE FROM saved_credentials WHERE id = $1 AND owner_id = $2', [
    credentialId,
    ownerId,
  ])
  if (!rowCount) throw new NotFoundError('Todistetta ei löytynyt.')
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
  if (!trimmed) throw new UserError('Anna kokoelmalle nimi.')
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
  if (!UUID.test(collectionId ?? '')) throw new NotFoundError('Kokoelmaa ei löytynyt.')
  const { rows } = await pool.query('SELECT id FROM collections WHERE id = $1 AND owner_id = $2', [
    collectionId,
    ownerId,
  ])
  if (!rows[0]) throw new NotFoundError('Kokoelmaa ei löytynyt.')
}

export async function renameCollection(ownerId, collectionId, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new UserError('Anna kokoelmalle nimi.')
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
  if (!(await findSavedCredential(ownerId, credentialId))) throw new NotFoundError('Todistetta ei löytynyt.')
  await pool.query(
    'INSERT INTO collection_items (collection_id, credential_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [collectionId, credentialId]
  )
  await pool.query('UPDATE collections SET updated_at = now() WHERE id = $1', [collectionId])
}

// Takes the credential out of the collection; it stays saved, and its own
// links keep working.
export async function removeItem(ownerId, collectionId, credentialId) {
  if (!UUID.test(credentialId ?? '')) throw new NotFoundError('Todistetta ei löytynyt.')
  await assertOwnedCollection(ownerId, collectionId)
  const { rowCount } = await pool.query(
    'DELETE FROM collection_items WHERE collection_id = $1 AND credential_id = $2',
    [collectionId, credentialId]
  )
  if (!rowCount) throw new NotFoundError('Todistetta ei löytynyt.')
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
  throw new NotFoundError('Todistetta ei löytynyt.')
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

// Every link the owner has made, with what it points to: for the "Jaetut
// todisteet" list on /my/collections.
export async function listAllShareLinks(ownerId) {
  const { rows } = await pool.query(
    `SELECT l.id, l.token, l.label, l.collection_id, l.credential_id, l.created_at,
            COALESCE(c.name, s.credential->'credentialSubject'->'achievement'->>'name') AS target_name
     FROM share_links l
     LEFT JOIN collections c ON c.id = l.collection_id
     LEFT JOIN saved_credentials s ON s.id = l.credential_id
     WHERE c.owner_id = $1 OR s.owner_id = $1
     ORDER BY l.created_at DESC, l.id`,
    [ownerId]
  )
  return rows.map((row) => ({
    ...toShareLink(row),
    target: row.collection_id ? { collectionId: row.collection_id } : { credentialId: row.credential_id },
    targetName: row.target_name ?? '',
  }))
}

export async function createShareLink(ownerId, target, label) {
  const trimmed = (label || '').trim()
  if (!trimmed) throw new UserError('Anna vastaanottajalle nimi.')
  if (trimmed.length > LABEL_MAX_LENGTH) throw new UserError('Nimessä voi olla enintään 100 merkkiä.')
  await assertOwnedTarget(ownerId, target)
  const { rows } = await pool.query(
    `INSERT INTO share_links (token, label, collection_id, credential_id) VALUES ($1, $2, $3, $4)
     RETURNING id, token, label, collection_id, created_at`,
    [newShareToken(), trimmed, target.collectionId || null, target.collectionId ? null : target.credentialId]
  )
  return toShareLink(rows[0])
}

export async function deleteShareLink(ownerId, linkId) {
  if (!UUID.test(linkId ?? '')) throw new NotFoundError('Linkkiä ei löytynyt.')
  const { rowCount } = await pool.query(
    `DELETE FROM share_links l
     WHERE l.id = $1 AND (
       EXISTS (SELECT 1 FROM collections c WHERE c.id = l.collection_id AND c.owner_id = $2) OR
       EXISTS (SELECT 1 FROM saved_credentials s WHERE s.id = l.credential_id AND s.owner_id = $2))`,
    [linkId, ownerId]
  )
  if (!rowCount) throw new NotFoundError('Linkkiä ei löytynyt.')
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
