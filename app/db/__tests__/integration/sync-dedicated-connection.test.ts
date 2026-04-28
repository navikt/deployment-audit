/**
 * Integration test: Sync-dedicated connection via AsyncLocalStorage.
 * Tests that withSyncClient() acquires an advisory lock, routes queries
 * through a single client, and correctly handles transactions.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { truncateAllTables } from './helpers'

let pool: Pool

beforeAll(() => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL })
})

afterAll(async () => {
  await pool.end()
})

afterEach(async () => {
  await truncateAllTables(pool)
})

// ─── Advisory lock ───────────────────────────────────────────────────────────

describe('withSyncClient advisory lock', () => {
  it('should acquire lock and run function', async () => {
    const { withSyncClient } = await import('~/db/connection.server')

    const result = await withSyncClient(async () => {
      return 'sync-completed'
    })

    expect(result).toBe('sync-completed')
  })

  it('should return null when lock is already held by another session', async () => {
    const { withSyncClient } = await import('~/db/connection.server')

    // Acquire advisory lock on a separate connection to simulate another pod
    const holdingClient = await pool.connect()
    try {
      const { rows } = await holdingClient.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(839201471) AS locked',
      )
      expect(rows[0].locked).toBe(true)

      // withSyncClient should fail to acquire and return null
      const result = await withSyncClient(async () => {
        return 'should-not-run'
      })

      expect(result).toBeNull()
    } finally {
      await holdingClient.query('SELECT pg_advisory_unlock(839201471)')
      holdingClient.release()
    }
  })

  it('should release lock after function completes', async () => {
    const { withSyncClient } = await import('~/db/connection.server')

    await withSyncClient(async () => {
      // Lock is held here
    })

    // After withSyncClient returns, lock should be released — try acquiring it
    const testClient = await pool.connect()
    try {
      const { rows } = await testClient.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(839201471) AS locked')
      expect(rows[0].locked).toBe(true)
    } finally {
      await testClient.query('SELECT pg_advisory_unlock(839201471)')
      testClient.release()
    }
  })

  it('should release lock even if function throws', async () => {
    const { withSyncClient } = await import('~/db/connection.server')

    await expect(
      withSyncClient(async () => {
        throw new Error('sync-error')
      }),
    ).rejects.toThrow('sync-error')

    // Lock should still be released
    const testClient = await pool.connect()
    try {
      const { rows } = await testClient.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(839201471) AS locked')
      expect(rows[0].locked).toBe(true)
    } finally {
      await testClient.query('SELECT pg_advisory_unlock(839201471)')
      testClient.release()
    }
  })
})

// ─── Query routing ───────────────────────────────────────────────────────────

describe('sync client query routing', () => {
  it('should route pool.query() through the sync client', async () => {
    const { withSyncClient, pool: appPool } = await import('~/db/connection.server')

    const result = await withSyncClient(async () => {
      // This query should run on the sync client, not a fresh pool connection.
      // We verify by checking that the backend PID is consistent across calls.
      const { rows: r1 } = await appPool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      const { rows: r2 } = await appPool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      return { pid1: r1[0].pid, pid2: r2[0].pid }
    })

    expect(result).not.toBeNull()
    // Both queries should have run on the same backend (same connection)
    expect(result?.pid1).toBe(result?.pid2)
  })

  it('should route pool.connect() through the sync client', async () => {
    const { withSyncClient, pool: appPool } = await import('~/db/connection.server')

    const result = await withSyncClient(async () => {
      // Get the sync client PID via pool.query
      const { rows: queryPid } = await appPool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')

      // Get a "client" via pool.connect — should be the sync client (wrapped)
      const client = await appPool.connect()
      try {
        const { rows: clientPid } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        return { queryPid: queryPid[0].pid, connectPid: clientPid[0].pid }
      } finally {
        client.release() // should be a no-op
      }
    })

    expect(result).not.toBeNull()
    // pool.query() and pool.connect() should use the same backend
    expect(result?.queryPid).toBe(result?.connectPid)
  })

  it('should not affect queries outside sync context', async () => {
    const { withSyncClient, pool: appPool } = await import('~/db/connection.server')

    let syncPid: number | undefined

    await withSyncClient(async () => {
      const { rows } = await appPool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      syncPid = rows[0].pid
    })

    // After withSyncClient, queries should go through the pool (possibly different PID)
    // The key assertion is that getSyncClient() returns undefined outside the context
    const { getSyncClient } = await import('~/db/connection.server')
    expect(getSyncClient()).toBeUndefined()
    expect(syncPid).toBeDefined()
  })
})

// ─── Transactions within sync context ────────────────────────────────────────

describe('transactions within sync context', () => {
  it('should support BEGIN/COMMIT via pool.connect() inside sync context', async () => {
    const { withSyncClient, pool: appPool } = await import('~/db/connection.server')

    await withSyncClient(async () => {
      const client = await appPool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO monitored_applications (team_slug, environment_name, app_name)
           VALUES ($1, $2, $3)`,
          ['test-team', 'test-env', 'test-app'],
        )
        await client.query('COMMIT')
      } catch {
        await client.query('ROLLBACK')
        throw new Error('Transaction failed')
      } finally {
        client.release()
      }
    })

    // Verify the row was committed
    const { rows } = await pool.query('SELECT app_name FROM monitored_applications WHERE team_slug = $1', ['test-team'])
    expect(rows).toHaveLength(1)
    expect(rows[0].app_name).toBe('test-app')
  })

  it('should support ROLLBACK via pool.connect() inside sync context', async () => {
    const { withSyncClient, pool: appPool } = await import('~/db/connection.server')

    await withSyncClient(async () => {
      const client = await appPool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO monitored_applications (team_slug, environment_name, app_name)
           VALUES ($1, $2, $3)`,
          ['rollback-team', 'test-env', 'test-app'],
        )
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })

    // Verify the row was NOT committed
    const { rows } = await pool.query('SELECT app_name FROM monitored_applications WHERE team_slug = $1', [
      'rollback-team',
    ])
    expect(rows).toHaveLength(0)
  })
})
