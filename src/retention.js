// Accounts that nobody has signed in to for a while are deleted, as /policy
// promises. An account's last activity is the latest of its passkeys'
// last_used_at (a sign-in), falling back to the passkey's created_at (it was
// registered and never used); an account with no passkey left counts from its
// own created_at.

export const UNUSED_ACCOUNT_MONTHS = 6
export const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000

// Arbitrary constant, distinct from db.js's SCHEMA_LOCK_KEY. Replicas that run
// the sweep at the same time take it in turn; whoever finds it taken skips.
const RETENTION_LOCK_KEY = 4171580990

/**
 * Deletes the accounts unused for `months` months and returns how many. The
 * users rows go first (passkeys, collections, saved credentials and share
 * links follow through ON DELETE CASCADE), then their sessions, in the order
 * deleteAccount in auth.js uses. Returns 0 without doing anything when another
 * instance is sweeping.
 */
export async function deleteUnusedAccounts(pool, { months = UNUSED_ACCOUNT_MONTHS } = {}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: lock } = await client.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS locked', [RETENTION_LOCK_KEY])
    if (!lock[0].locked) {
      await client.query('ROLLBACK')
      return 0
    }
    const { rows } = await client.query(
      `DELETE FROM users u
        WHERE COALESCE(
                (SELECT max(COALESCE(p.last_used_at, p.created_at)) FROM passkey_credentials p WHERE p.user_id = u.id),
                u.created_at
              ) < now() - make_interval(months => $1::int)
        RETURNING u.id::text AS id`,
      [months]
    )
    if (rows.length) {
      await client.query("DELETE FROM session WHERE sess->>'userId' = ANY($1::text[])", [rows.map((r) => r.id)])
    }
    await client.query('COMMIT')
    return rows.length
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Runs the sweep now and then daily. Logs counts only, never who. */
export function scheduleUnusedAccountSweep(pool, { intervalMs = RETENTION_INTERVAL_MS } = {}) {
  const sweep = async () => {
    try {
      const count = await deleteUnusedAccounts(pool)
      if (count) console.log(`Deleted ${count} account(s) unused for over ${UNUSED_ACCOUNT_MONTHS} months.`)
    } catch (err) {
      console.error('Deleting unused accounts failed:', err.message)
    }
  }
  sweep()
  return setInterval(sweep, intervalMs).unref()
}
