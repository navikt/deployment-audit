/**
 * Integration test: getDevTeamsForGithubUsernames
 * Validates reverse lookup from GitHub usernames → dev teams.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getDevTeamsForGithubUsernames } from '~/db/user-dev-team-preference.server'
import { seedSection, truncateAllTables } from './helpers'

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

async function seedDevTeam(sectionId: number, slug: string, name: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO dev_teams (section_id, slug, name, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
    [sectionId, slug, name],
  )
  return rows[0].id
}

async function seedUserMapping(github: string, navIdent: string, opts?: { deletedAt?: Date }): Promise<void> {
  await pool.query(
    `INSERT INTO user_mappings (github_username, nav_ident, display_name, deleted_at)
     VALUES ($1, $2, $3, $4)`,
    [github, navIdent, `${github} Display`, opts?.deletedAt ?? null],
  )
}

async function seedDevTeamPreference(navIdent: string, devTeamId: number): Promise<void> {
  await pool.query(`INSERT INTO user_dev_team_preference (nav_ident, dev_team_id, updated_at) VALUES ($1, $2, NOW())`, [
    navIdent,
    devTeamId,
  ])
}

describe('getDevTeamsForGithubUsernames', () => {
  it('returns dev teams for matching GitHub usernames', async () => {
    const sectionId = await seedSection(pool, 'sec1')
    const teamId = await seedDevTeam(sectionId, 'alpha', 'Team Alpha')

    await seedUserMapping('alice-gh', 'A123456')
    await seedDevTeamPreference('A123456', teamId)

    const result = await getDevTeamsForGithubUsernames(['alice-gh'])

    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('alpha')
    expect(result[0].name).toBe('Team Alpha')
  })

  it('matches case-insensitively on GitHub username', async () => {
    const sectionId = await seedSection(pool, 'sec1')
    const teamId = await seedDevTeam(sectionId, 'beta', 'Team Beta')

    await seedUserMapping('Bob-GH', 'B654321')
    await seedDevTeamPreference('B654321', teamId)

    const result = await getDevTeamsForGithubUsernames(['bob-gh'])

    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('beta')
  })

  it('excludes soft-deleted user mappings', async () => {
    const sectionId = await seedSection(pool, 'sec1')
    const teamId = await seedDevTeam(sectionId, 'gamma', 'Team Gamma')

    await seedUserMapping('charlie-gh', 'C111111', { deletedAt: new Date() })
    await seedDevTeamPreference('C111111', teamId)

    const result = await getDevTeamsForGithubUsernames(['charlie-gh'])

    expect(result).toHaveLength(0)
  })

  it('excludes inactive dev teams', async () => {
    const sectionId = await seedSection(pool, 'sec1')
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO dev_teams (section_id, slug, name, is_active) VALUES ($1, $2, $3, false) RETURNING id`,
      [sectionId, 'inactive', 'Inactive Team'],
    )
    const teamId = rows[0].id

    await seedUserMapping('dave-gh', 'D222222')
    await seedDevTeamPreference('D222222', teamId)

    const result = await getDevTeamsForGithubUsernames(['dave-gh'])

    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty input', async () => {
    const result = await getDevTeamsForGithubUsernames([])
    expect(result).toEqual([])
  })

  it('returns distinct teams when multiple members match', async () => {
    const sectionId = await seedSection(pool, 'sec1')
    const teamId = await seedDevTeam(sectionId, 'delta', 'Team Delta')

    await seedUserMapping('eve-gh', 'E333333')
    await seedUserMapping('frank-gh', 'F444444')
    await seedDevTeamPreference('E333333', teamId)
    await seedDevTeamPreference('F444444', teamId)

    const result = await getDevTeamsForGithubUsernames(['eve-gh', 'frank-gh'])

    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('delta')
  })
})
