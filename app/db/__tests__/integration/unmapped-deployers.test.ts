/**
 * Integration test: getUnmappedDeployers
 *
 * Verifies that the function correctly identifies GitHub usernames from
 * a team's deployments that lack a corresponding user_mappings row.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getUnmappedDeployers } from '~/db/deployments/home.server'
import { seedApp, seedDeployment, truncateAllTables } from './helpers'

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

async function seedUserMapping(githubUsername: string): Promise<void> {
  await pool.query(`INSERT INTO user_mappings (github_username, display_name) VALUES ($1, $2)`, [
    githubUsername,
    `Name of ${githubUsername}`,
  ])
}

describe('getUnmappedDeployers', () => {
  it('returns deployer usernames that have no user_mappings row', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'alice',
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'bob',
    })
    await seedUserMapping('alice')

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual(['bob'])
  })

  it('returns empty array when all deployers are mapped', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'alice',
    })
    await seedUserMapping('alice')

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual([])
  })

  it('returns empty array when there are no deployments', async () => {
    await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual([])
  })

  it('excludes bot accounts (usernames ending with [bot])', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'dependabot[bot]',
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'real-person',
    })

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual(['real-person'])
  })

  it('includes PR creator usernames from github_pr_data', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'deployer-1',
      githubPrData: { creator: { username: 'pr-author-1' } },
    })
    await seedUserMapping('deployer-1')

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual(['pr-author-1'])
  })

  it('deduplicates usernames across deployer and PR creator', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    // Same person is both deployer and PR creator
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'alice',
      githubPrData: { creator: { username: 'alice' } },
    })

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual(['alice'])
  })

  it('performs case-insensitive matching against user_mappings', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'Alice',
    })
    await seedUserMapping('alice')

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual([])
  })

  it('excludes soft-deleted user mappings', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'alice',
    })
    await seedUserMapping('alice')
    await pool.query(`UPDATE user_mappings SET deleted_at = NOW() WHERE github_username = 'alice'`)

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual(['alice'])
  })

  it('scopes to the given nais team slugs only', async () => {
    const appA = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc-a', environment: 'prod' })
    const appB = await seedApp(pool, { teamSlug: 'team-b', appName: 'svc-b', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appA,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'alice',
    })
    await seedDeployment(pool, {
      monitoredAppId: appB,
      teamSlug: 'team-b',
      environment: 'prod',
      deployerUsername: 'bob',
    })

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual(['alice'])
  })

  it('includes apps matched via directAppIds', async () => {
    const appId = await seedApp(pool, { teamSlug: 'other-team', appName: 'direct-app', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'other-team',
      environment: 'prod',
      deployerUsername: 'charlie',
    })

    const result = await getUnmappedDeployers([], [appId])
    expect(result).toEqual(['charlie'])
  })

  it('ignores inactive apps', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'old-svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'alice',
    })
    await pool.query('UPDATE monitored_applications SET is_active = false WHERE id = $1', [appId])

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual([])
  })

  it('ignores deployments from previous years', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'old-deployer',
      createdAt: new Date('2024-06-15'),
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'current-deployer',
    })

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual(['current-deployer'])
  })

  it('returns usernames sorted alphabetically', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'svc', environment: 'prod' })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'charlie',
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'alice',
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      deployerUsername: 'bob',
    })

    const result = await getUnmappedDeployers(['team-a'])
    expect(result).toEqual(['alice', 'bob', 'charlie'])
  })
})
