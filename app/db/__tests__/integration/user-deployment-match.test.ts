/**
 * Integration tests for the «mine deployments»-matching helper used both in
 * Slack home tab og på `/users/:username`-siden. Bekrefter at
 * `getDeployerDeploymentsPaginated`, `getDeploymentCountByDeployer`,
 * `getDeployerMonthlyStats`, `getDeployerApps`,
 * `getUnlinkedDependabotDeploymentIds` og
 * `getPersonalDeploymentsMissingGoalLinks` matcher samme deployments —
 * deployer ELLER PR-skaper, case-insensitivt.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getUnlinkedDependabotDeploymentIds } from '../../deployment-goal-links.server'
import { getPersonalDeploymentsMissingGoalLinks } from '../../deployments/home.server'
import {
  getDeployerApps,
  getDeployerDeploymentsPaginated,
  getDeployerMonthlyStats,
  getDeploymentCountByDeployer,
} from '../../deployments.server'
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

describe('user deployment match — deployer ELLER PR-skaper, case-insensitive', () => {
  async function seedScenario() {
    const appId = await seedApp(pool, {
      teamSlug: 'team-a',
      appName: 'app-a',
      environment: 'prod',
      auditStartYear: 2026,
    })
    const now = new Date('2026-03-15T10:00:00Z')
    // 1: pcmoen er deployer (eksakt case)
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'pcmoen',
    })
    // 2: PCMOEN er deployer (annen case)
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'PCMOEN',
    })
    // 3: bot deployet, pcmoen er PR-skaper
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'github-actions[bot]',
      githubPrData: { creator: { username: 'pcmoen' } },
    })
    // 4: irrelevant — annen bruker
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'someoneelse',
      githubPrData: { creator: { username: 'someoneelse' } },
    })
    return appId
  }

  it('getDeploymentCountByDeployer matcher deployer + PR-skaper case-insensitivt', async () => {
    await seedScenario()
    expect(await getDeploymentCountByDeployer('pcmoen')).toBe(3)
  })

  it('getDeployerDeploymentsPaginated matcher deployer + PR-skaper case-insensitivt', async () => {
    await seedScenario()
    const result = await getDeployerDeploymentsPaginated('pcmoen', 1, 20)
    expect(result.total).toBe(3)
  })

  it('getDeployerMonthlyStats matcher deployer + PR-skaper case-insensitivt', async () => {
    await seedScenario()
    const rows = await getDeployerMonthlyStats('pcmoen')
    const total = rows.reduce((sum, r) => sum + r.total, 0)
    expect(total).toBe(3)
  })

  it('getDeployerApps matcher deployer + PR-skaper case-insensitivt', async () => {
    await seedScenario()
    const apps = await getDeployerApps('pcmoen')
    expect(apps).toEqual(['app-a'])
  })

  it('getPersonalDeploymentsMissingGoalLinks matcher deployer + PR-skaper case-insensitivt', async () => {
    await seedScenario()
    expect(await getPersonalDeploymentsMissingGoalLinks('pcmoen')).toBe(3)
  })

  it('getUnlinkedDependabotDeploymentIds matcher PR-skaper når dependabot deployer', async () => {
    const appId = await seedApp(pool, {
      teamSlug: 'team-a',
      appName: 'app-a',
      environment: 'prod',
      auditStartYear: 2026,
    })
    // dependabot deployer, pcmoen er PR-skaper
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: new Date('2026-03-15T10:00:00Z'),
      deployerUsername: 'github-actions[bot]',
      githubPrData: { creator: { username: 'dependabot[bot]' } },
    })
    // pcmoen deployer dependabot-PR direkte
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: new Date('2026-03-15T10:00:00Z'),
      deployerUsername: 'pcmoen',
      githubPrData: { creator: { username: 'dependabot[bot]' } },
    })
    const ids = await getUnlinkedDependabotDeploymentIds('pcmoen')
    // Forventet: kun den andre, siden den første har ingen kobling til pcmoen
    // (verken deployer eller PR-skaper). Den andre har pcmoen som deployer,
    // og dependabot som PR-skaper — så begge filtrene treffer.
    expect(ids.length).toBe(1)
  })

  it('matcher deployments med NULL eller manglende github_pr_data via deployer', async () => {
    const appId = await seedApp(pool, {
      teamSlug: 'team-a',
      appName: 'app-a',
      environment: 'prod',
      auditStartYear: 2026,
    })
    const now = new Date('2026-03-15T10:00:00Z')
    // pcmoen deployer, NULL pr_data (manuell deploy)
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'pcmoen',
      githubPrData: null,
    })
    // pcmoen deployer, tom pr_data
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'pcmoen',
      githubPrData: {},
    })
    // pcmoen deployer, creator uten username
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'pcmoen',
      githubPrData: { creator: {} },
    })
    // bot deployer, NULL pr_data — skal IKKE matche
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'github-actions[bot]',
      githubPrData: null,
    })
    expect(await getDeploymentCountByDeployer('pcmoen')).toBe(3)
  })
})

describe('user deployment match — team-aggregate queries', () => {
  it('getDevTeamCoverageStats matcher team-medlem som PR-skaper også', async () => {
    const { getDevTeamCoverageStats } = await import('../../deployment-goal-links.server')
    const appId = await seedApp(pool, {
      teamSlug: 'team-a',
      appName: 'app-a',
      environment: 'prod',
      auditStartYear: 2026,
    })
    const now = new Date('2026-03-15T10:00:00Z')
    // alice deployer
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'alice',
      fourEyesStatus: 'approved',
    })
    // bot deployer, alice er PR-skaper — skal også telles
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'github-actions[bot]',
      githubPrData: { creator: { username: 'alice' } },
      fourEyesStatus: 'approved',
    })
    // ikke-medlem — skal ikke telles
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'someoneelse',
      fourEyesStatus: 'approved',
    })

    const result = await getDevTeamCoverageStats([appId], ['ALICE'], new Date('2026-01-01'), new Date('2027-01-01'))
    expect(result.total).toBe(2)
  })

  it('getAppDeploymentStatsBatch matcher team-medlem som PR-skaper også', async () => {
    const { getAppDeploymentStatsBatch } = await import('../../deployments/stats.server')
    const appId = await seedApp(pool, {
      teamSlug: 'team-a',
      appName: 'app-a',
      environment: 'prod',
      auditStartYear: 2026,
    })
    const now = new Date('2026-03-15T10:00:00Z')
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'alice',
    })
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team-a',
      environment: 'prod',
      createdAt: now,
      deployerUsername: 'github-actions[bot]',
      githubPrData: { creator: { username: 'alice' } },
    })

    const stats = await getAppDeploymentStatsBatch([{ id: appId }], ['ALICE'])
    expect(stats.get(appId)?.total).toBe(2)
  })
})
