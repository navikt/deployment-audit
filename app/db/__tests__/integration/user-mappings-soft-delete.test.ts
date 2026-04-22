import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  clearUserMappingCache,
  deleteUserMapping,
  getAllUserMappings,
  getUnmappedUsers,
  getUserMapping,
  getUserMappingByNavIdent,
  getUserMappingBySlackId,
  getUserMappings,
  upsertUserMapping,
} from '../../user-mappings.server'
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
  clearUserMappingCache()
})

async function seedDeploy(pool: Pool, deployer: string) {
  const app = await pool.query<{ id: number }>(
    `INSERT INTO monitored_applications (team_slug, app_name, environment_name, is_active)
     VALUES ('t', 'a', 'dev', true) RETURNING id`,
  )
  await pool.query(
    `INSERT INTO deployments (
       monitored_app_id, nais_deployment_id, team_slug, app_name, environment_name,
       commit_sha, created_at, four_eyes_status, deployer_username
     ) VALUES ($1, $2, 't', 'a', 'dev', $3, NOW(), 'pending', $4)`,
    [app.rows[0].id, `nd-${deployer}-${Date.now()}`, `sha-${deployer}`, deployer],
  )
}

describe('user_mappings soft delete', () => {
  beforeEach(async () => {
    await truncateAllTables(pool)
    clearUserMappingCache()
  })

  it('soft-deletes by setting deleted_at and deleted_by', async () => {
    await upsertUserMapping({ githubUsername: 'octocat', displayName: 'Octo Cat', navIdent: 'O123456' })
    await deleteUserMapping('octocat', 'A999999')

    const { rows } = await pool.query('SELECT deleted_at, deleted_by FROM user_mappings WHERE github_username = $1', [
      'octocat',
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].deleted_at).not.toBeNull()
    expect(rows[0].deleted_by).toBe('A999999')
  })

  it('getUserMapping still returns soft-deleted mapping (audit history)', async () => {
    await upsertUserMapping({ githubUsername: 'octocat', displayName: 'Octo Cat' })
    await deleteUserMapping('octocat', 'A999999')

    const mapping = await getUserMapping('octocat')
    expect(mapping?.display_name).toBe('Octo Cat')
    expect(mapping?.deleted_at).not.toBeNull()
  })

  it('getUserMappings still returns soft-deleted mappings', async () => {
    await upsertUserMapping({ githubUsername: 'octocat', displayName: 'Octo Cat' })
    await deleteUserMapping('octocat', null)

    const mappings = await getUserMappings(['octocat'])
    expect(mappings.get('octocat')?.display_name).toBe('Octo Cat')
  })

  it('getAllUserMappings excludes soft-deleted', async () => {
    await upsertUserMapping({ githubUsername: 'alive', displayName: 'Alive' })
    await upsertUserMapping({ githubUsername: 'dead', displayName: 'Dead' })
    await deleteUserMapping('dead', null)

    const all = await getAllUserMappings()
    expect(all.map((m) => m.github_username).sort()).toEqual(['alive'])
  })

  it('getUserMappingByNavIdent excludes soft-deleted (current-state lookup)', async () => {
    await upsertUserMapping({ githubUsername: 'octocat', navIdent: 'O123456' })
    await deleteUserMapping('octocat', null)

    expect(await getUserMappingByNavIdent('O123456')).toBeNull()
  })

  it('getUserMappingBySlackId excludes soft-deleted (current-state lookup)', async () => {
    await upsertUserMapping({ githubUsername: 'octocat', slackMemberId: 'U001' })
    await deleteUserMapping('octocat', null)

    expect(await getUserMappingBySlackId('U001')).toBeNull()
  })

  it('getUnmappedUsers treats soft-deleted as missing mapping', async () => {
    await seedDeploy(pool, 'octocat')
    await upsertUserMapping({ githubUsername: 'octocat', displayName: 'Octo Cat' })

    expect(await getUnmappedUsers()).toEqual([])

    await deleteUserMapping('octocat', null)
    const unmapped = await getUnmappedUsers()
    expect(unmapped.map((u) => u.github_username)).toEqual(['octocat'])
  })

  it('upsertUserMapping undeletes a soft-deleted row and updates fields', async () => {
    await upsertUserMapping({ githubUsername: 'octocat', displayName: 'Octo Cat', navIdent: 'O123456' })
    await deleteUserMapping('octocat', 'A999999')

    const restored = await upsertUserMapping({ githubUsername: 'octocat', displayName: 'Octo Cat 2' })

    expect(restored.deleted_at).toBeNull()
    expect(restored.deleted_by).toBeNull()
    expect(restored.display_name).toBe('Octo Cat 2')
    // Pre-existing nav_ident is preserved by COALESCE merge semantics.
    expect(restored.nav_ident).toBe('O123456')

    expect((await getAllUserMappings()).length).toBe(1)
  })

  it('deleteUserMapping is idempotent (re-deleting does not change deleted_at/by)', async () => {
    await upsertUserMapping({ githubUsername: 'octocat' })
    await deleteUserMapping('octocat', 'A111111')

    const { rows: first } = await pool.query<{ deleted_at: Date; deleted_by: string }>(
      'SELECT deleted_at, deleted_by FROM user_mappings WHERE github_username = $1',
      ['octocat'],
    )

    // Second delete with a different actor should be a no-op (WHERE deleted_at IS NULL guards).
    await deleteUserMapping('octocat', 'B222222')

    const { rows: second } = await pool.query<{ deleted_at: Date; deleted_by: string }>(
      'SELECT deleted_at, deleted_by FROM user_mappings WHERE github_username = $1',
      ['octocat'],
    )

    expect(second[0].deleted_at.getTime()).toBe(first[0].deleted_at.getTime())
    expect(second[0].deleted_by).toBe('A111111')
  })
})
