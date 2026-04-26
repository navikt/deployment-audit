/**
 * Integration test: Team-based filtering on the deployments list.
 *
 * Covers `getMembersGithubUsernamesForDevTeams` and the
 * `deployer_usernames` filter on `getDeploymentsPaginated`.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getDeploymentsPaginated } from '~/db/deployments.server'
import { getMembersGithubUsernamesForDevTeams } from '~/db/user-dev-team-preference.server'
import { seedApp, seedDeployment, seedDevTeam, seedSection, truncateAllTables } from './helpers'

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

async function seedUser(navIdent: string, githubUsername: string) {
  await pool.query(
    `INSERT INTO user_mappings (nav_ident, github_username, display_name)
     VALUES ($1, $2, $3)`,
    [navIdent, githubUsername, navIdent],
  )
}

async function joinDevTeam(navIdent: string, devTeamId: number) {
  await pool.query(
    `INSERT INTO user_dev_team_preference (nav_ident, dev_team_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [navIdent, devTeamId],
  )
}

describe('getMembersGithubUsernamesForDevTeams', () => {
  it('returns empty array for empty input', async () => {
    expect(await getMembersGithubUsernamesForDevTeams([])).toEqual([])
  })

  it('returns deduplicated github usernames across multiple teams', async () => {
    const sectionId = await seedSection(pool, 'sec')
    const teamA = await seedDevTeam(pool, 'team-a', 'Team A', sectionId)
    const teamB = await seedDevTeam(pool, 'team-b', 'Team B', sectionId)
    await seedUser('A111111', 'alice')
    await seedUser('B222222', 'bob')
    await seedUser('C333333', 'carol')
    // Alice is in both teams — should only appear once
    await joinDevTeam('A111111', teamA)
    await joinDevTeam('A111111', teamB)
    await joinDevTeam('B222222', teamA)
    await joinDevTeam('C333333', teamB)

    const usernames = await getMembersGithubUsernamesForDevTeams([teamA, teamB])
    expect(usernames.sort()).toEqual(['alice', 'bob', 'carol'])
  })

  it('skips users without a github_username mapping', async () => {
    const sectionId = await seedSection(pool, 'sec')
    const team = await seedDevTeam(pool, 'team-x', 'Team X', sectionId)
    await seedUser('A111111', 'alice')
    // B222222 has no user_mappings row at all → excluded by inner join
    await joinDevTeam('A111111', team)
    await joinDevTeam('B222222', team)

    const usernames = await getMembersGithubUsernamesForDevTeams([team])
    expect(usernames).toEqual(['alice'])
  })

  it('excludes soft-deleted user mappings', async () => {
    const sectionId = await seedSection(pool, 'sec')
    const team = await seedDevTeam(pool, 'team-y', 'Team Y', sectionId)
    await seedUser('A111111', 'alice')
    await seedUser('B222222', 'bob')
    await pool.query(`UPDATE user_mappings SET deleted_at = NOW() WHERE nav_ident = 'B222222'`)
    await joinDevTeam('A111111', team)
    await joinDevTeam('B222222', team)

    const usernames = await getMembersGithubUsernamesForDevTeams([team])
    expect(usernames).toEqual(['alice'])
  })
})

describe('getDeploymentsPaginated with deployer_usernames filter', () => {
  it('filters deployments to the given usernames', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-1', appName: 'app-1', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-1',
      environment: 'prod',
      deployerUsername: 'alice',
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-1',
      environment: 'prod',
      deployerUsername: 'bob',
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-1',
      environment: 'prod',
      deployerUsername: 'carol',
    })

    const result = await getDeploymentsPaginated({
      monitored_app_id: appId,
      deployer_usernames: ['alice', 'carol'],
    })
    expect(result.total).toBe(2)
    const deployers = result.deployments.map((d) => d.deployer_username).sort()
    expect(deployers).toEqual(['alice', 'carol'])
  })

  it('returns zero rows when given an empty username list', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-1', appName: 'app-1', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-1',
      environment: 'prod',
      deployerUsername: 'alice',
    })

    const result = await getDeploymentsPaginated({
      monitored_app_id: appId,
      deployer_usernames: [],
    })
    expect(result.total).toBe(0)
    expect(result.deployments).toHaveLength(0)
  })

  it('combines with deployer_username filter as AND', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-1', appName: 'app-1', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-1',
      environment: 'prod',
      deployerUsername: 'alice',
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-1',
      environment: 'prod',
      deployerUsername: 'bob',
    })

    // Both filters: only deployments by alice that are also in {alice,bob}
    const result = await getDeploymentsPaginated({
      monitored_app_id: appId,
      deployer_username: 'alice',
      deployer_usernames: ['alice', 'bob'],
    })
    expect(result.total).toBe(1)
    expect(result.deployments[0].deployer_username).toBe('alice')

    // Conflicting filters: deployer_username not in deployer_usernames
    const conflict = await getDeploymentsPaginated({
      monitored_app_id: appId,
      deployer_username: 'alice',
      deployer_usernames: ['bob'],
    })
    expect(conflict.total).toBe(0)
  })
})
