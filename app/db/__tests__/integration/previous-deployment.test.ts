/**
 * Integration test: getPreviousDeployment query logic.
 *
 * Verifies that legacy deployments and invalid refs are excluded
 * when finding the previous deployment for verification.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { assignAppToGroup, seedApp, seedApplicationGroup, seedDeployment, truncateAllTables } from './helpers'

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

/**
 * Replicates the getPreviousDeployment query from fetch-data.server.ts.
 * We test the SQL directly since the function is private.
 */
async function getPreviousDeployment(
  currentDeploymentId: number,
  environmentName: string,
  owner: string,
  repo: string,
): Promise<{ id: number; commitSha: string } | null> {
  const result = await pool.query(
    `SELECT d.id, d.commit_sha
     FROM deployments d
     JOIN monitored_applications ma ON d.monitored_app_id = ma.id
     WHERE d.created_at < (SELECT created_at FROM deployments WHERE id = $1)
       AND ma.environment_name = $2
       AND d.detected_github_owner = $3
       AND d.detected_github_repo_name = $4
       AND d.commit_sha IS NOT NULL
       AND d.four_eyes_status NOT IN ('legacy', 'legacy_pending')
       AND d.commit_sha !~ '^refs/'
     ORDER BY d.created_at DESC
     LIMIT 1`,
    [currentDeploymentId, environmentName, owner, repo],
  )

  if (result.rows.length === 0) return null
  return { id: result.rows[0].id, commitSha: result.rows[0].commit_sha }
}

describe('getPreviousDeployment query', () => {
  const owner = 'navikt'
  const repo = 'pensjon-regler'

  it('should skip legacy deployments and return null when no valid previous exists', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team', appName: 'app', environment: 'prod' })

    // Legacy deployment (old)
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'refs/heads/main',
      fourEyesStatus: 'legacy',
      createdAt: new Date('2025-01-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    // Current deployment (new)
    const currentId = await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'abc123',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-02-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const prev = await getPreviousDeployment(currentId, 'prod', owner, repo)
    expect(prev).toBeNull()
  })

  it('should skip deployments with refs/ commit SHAs', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team', appName: 'app', environment: 'prod' })

    // Deployment with refs/ SHA but not legacy status
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'refs/heads/feature',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-01-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const currentId = await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'def456',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-02-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const prev = await getPreviousDeployment(currentId, 'prod', owner, repo)
    expect(prev).toBeNull()
  })

  it('should return a valid non-legacy previous deployment', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team', appName: 'app', environment: 'prod' })

    // Legacy (oldest)
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'refs/heads/main',
      fourEyesStatus: 'legacy',
      createdAt: new Date('2025-01-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    // Valid previous deployment (middle)
    const validId = await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'aaa111',
      fourEyesStatus: 'pending_baseline',
      createdAt: new Date('2025-02-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    // Current deployment (newest)
    const currentId = await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'bbb222',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-03-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const prev = await getPreviousDeployment(currentId, 'prod', owner, repo)
    expect(prev).not.toBeNull()
    expect(prev?.id).toBe(validId)
    expect(prev?.commitSha).toBe('aaa111')
  })

  it('should skip legacy_pending deployments', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team', appName: 'app', environment: 'prod' })

    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'ccc333',
      fourEyesStatus: 'legacy_pending',
      createdAt: new Date('2025-01-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const currentId = await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      commitSha: 'ddd444',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-02-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const prev = await getPreviousDeployment(currentId, 'prod', owner, repo)
    expect(prev).toBeNull()
  })
})

/**
 * Replicates the getPreviousDeploymentFromGroupSibling query from fetch-data.server.ts.
 * First checks if the app has a group, then queries sibling environments.
 */
async function getPreviousDeploymentFromGroupSibling(
  currentDeploymentId: number,
  owner: string,
  repo: string,
  monitoredAppId: number,
  auditStartYear?: number | null,
): Promise<{ id: number; commitSha: string } | null> {
  // Early return: check if app belongs to a group (matches production)
  const groupCheck = await pool.query<{ application_group_id: number | null }>(
    `SELECT application_group_id FROM monitored_applications WHERE id = $1`,
    [monitoredAppId],
  )
  const groupId = groupCheck.rows[0]?.application_group_id
  if (!groupId) return null

  let query = `
    SELECT d.id, d.commit_sha
    FROM deployments d
    JOIN monitored_applications ma ON d.monitored_app_id = ma.id
    WHERE d.created_at < (SELECT created_at FROM deployments WHERE id = $1)
      AND d.detected_github_owner = $2
      AND d.detected_github_repo_name = $3
      AND d.commit_sha IS NOT NULL
      AND d.four_eyes_status NOT IN ('legacy', 'legacy_pending')
      AND d.commit_sha !~ '^refs/'
      AND ma.application_group_id = $4
  `
  const params: (number | string)[] = [currentDeploymentId, owner, repo, groupId]

  if (auditStartYear) {
    query += ` AND d.created_at >= $5`
    params.push(`${auditStartYear}-01-01`)
  }

  query += ` ORDER BY d.created_at DESC LIMIT 1`

  const result = await pool.query(query, params)

  if (result.rows.length === 0) return null
  return { id: result.rows[0].id, commitSha: result.rows[0].commit_sha }
}

describe('getPreviousDeploymentFromGroupSibling (group fallback)', () => {
  const owner = 'navikt'
  const repo = 'pensjon-psak'

  it('should find previous deployment from a sibling app in the same group', async () => {
    // App in prod-fss (has history)
    const appFss = await seedApp(pool, { teamSlug: 'team', appName: 'pensjon-psak', environment: 'prod-fss' })
    // App in prod-gcp (new, no history in this env)
    const appGcp = await seedApp(pool, { teamSlug: 'team', appName: 'pensjon-penny', environment: 'prod-gcp' })

    // Group them
    const groupId = await seedApplicationGroup(pool, 'psak-og-penny')
    await assignAppToGroup(pool, appFss, groupId)
    await assignAppToGroup(pool, appGcp, groupId)

    // Existing deployment in prod-fss (older)
    const siblingId = await seedDeployment(pool, {
      monitoredAppId: appFss,
      teamSlug: 'team',
      environment: 'prod-fss',
      commitSha: 'aaa111',
      fourEyesStatus: 'approved',
      createdAt: new Date('2025-01-15T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    // New deployment in prod-gcp (no prior in this env)
    const currentId = await seedDeployment(pool, {
      monitoredAppId: appGcp,
      teamSlug: 'team',
      environment: 'prod-gcp',
      commitSha: 'bbb222',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-02-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    // Standard query finds nothing (different environment)
    const prev = await getPreviousDeployment(currentId, 'prod-gcp', owner, repo)
    expect(prev).toBeNull()

    // Group sibling fallback finds the prod-fss deployment
    const siblingPrev = await getPreviousDeploymentFromGroupSibling(currentId, owner, repo, appGcp)
    expect(siblingPrev).not.toBeNull()
    expect(siblingPrev?.id).toBe(siblingId)
    expect(siblingPrev?.commitSha).toBe('aaa111')
  })

  it('should return null when app has no group', async () => {
    const appGcp = await seedApp(pool, { teamSlug: 'team', appName: 'lonely-app', environment: 'prod-gcp' })

    const currentId = await seedDeployment(pool, {
      monitoredAppId: appGcp,
      teamSlug: 'team',
      environment: 'prod-gcp',
      commitSha: 'ccc333',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-02-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const prev = await getPreviousDeploymentFromGroupSibling(currentId, owner, repo, appGcp)
    expect(prev).toBeNull()
  })

  it('should not return deployments from a different repo in the same group', async () => {
    const appFss = await seedApp(pool, { teamSlug: 'team', appName: 'app-fss', environment: 'prod-fss' })
    const appGcp = await seedApp(pool, { teamSlug: 'team', appName: 'app-gcp', environment: 'prod-gcp' })

    const groupId = await seedApplicationGroup(pool, 'mixed-group')
    await assignAppToGroup(pool, appFss, groupId)
    await assignAppToGroup(pool, appGcp, groupId)

    // Deployment from different repo
    await seedDeployment(pool, {
      monitoredAppId: appFss,
      teamSlug: 'team',
      environment: 'prod-fss',
      commitSha: 'ddd444',
      fourEyesStatus: 'approved',
      createdAt: new Date('2025-01-15T10:00:00Z'),
      githubOwner: owner,
      githubRepo: 'different-repo',
    })

    const currentId = await seedDeployment(pool, {
      monitoredAppId: appGcp,
      teamSlug: 'team',
      environment: 'prod-gcp',
      commitSha: 'eee555',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-02-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const prev = await getPreviousDeploymentFromGroupSibling(currentId, owner, repo, appGcp)
    expect(prev).toBeNull()
  })

  it('should skip legacy deployments in sibling environments', async () => {
    const appFss = await seedApp(pool, { teamSlug: 'team', appName: 'app-fss', environment: 'prod-fss' })
    const appGcp = await seedApp(pool, { teamSlug: 'team', appName: 'app-gcp', environment: 'prod-gcp' })

    const groupId = await seedApplicationGroup(pool, 'test-group')
    await assignAppToGroup(pool, appFss, groupId)
    await assignAppToGroup(pool, appGcp, groupId)

    // Legacy deployment in sibling
    await seedDeployment(pool, {
      monitoredAppId: appFss,
      teamSlug: 'team',
      environment: 'prod-fss',
      commitSha: 'fff666',
      fourEyesStatus: 'legacy',
      createdAt: new Date('2025-01-15T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const currentId = await seedDeployment(pool, {
      monitoredAppId: appGcp,
      teamSlug: 'team',
      environment: 'prod-gcp',
      commitSha: 'ggg777',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-02-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const prev = await getPreviousDeploymentFromGroupSibling(currentId, owner, repo, appGcp)
    expect(prev).toBeNull()
  })

  it('should respect auditStartYear and exclude older sibling deployments', async () => {
    const appFss = await seedApp(pool, {
      teamSlug: 'team',
      appName: 'app-fss',
      environment: 'prod-fss',
      auditStartYear: 2025,
    })
    const appGcp = await seedApp(pool, {
      teamSlug: 'team',
      appName: 'app-gcp',
      environment: 'prod-gcp',
      auditStartYear: 2025,
    })

    const groupId = await seedApplicationGroup(pool, 'audit-year-group')
    await assignAppToGroup(pool, appFss, groupId)
    await assignAppToGroup(pool, appGcp, groupId)

    // Deployment in sibling BEFORE audit start year
    await seedDeployment(pool, {
      monitoredAppId: appFss,
      teamSlug: 'team',
      environment: 'prod-fss',
      commitSha: 'old111',
      fourEyesStatus: 'approved',
      createdAt: new Date('2024-06-15T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    // Deployment in sibling AFTER audit start year
    const validId = await seedDeployment(pool, {
      monitoredAppId: appFss,
      teamSlug: 'team',
      environment: 'prod-fss',
      commitSha: 'new222',
      fourEyesStatus: 'approved',
      createdAt: new Date('2025-03-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    const currentId = await seedDeployment(pool, {
      monitoredAppId: appGcp,
      teamSlug: 'team',
      environment: 'prod-gcp',
      commitSha: 'cur333',
      fourEyesStatus: 'pending',
      createdAt: new Date('2025-04-01T10:00:00Z'),
      githubOwner: owner,
      githubRepo: repo,
    })

    // Without auditStartYear: finds the newest sibling (new222)
    const prevNoFilter = await getPreviousDeploymentFromGroupSibling(currentId, owner, repo, appGcp)
    expect(prevNoFilter?.id).toBe(validId)

    // With auditStartYear=2025: still finds new222 (within window)
    const prevWithYear = await getPreviousDeploymentFromGroupSibling(currentId, owner, repo, appGcp, 2025)
    expect(prevWithYear?.id).toBe(validId)

    // With auditStartYear=2026: excludes both (too old for this window)
    const prevStrictYear = await getPreviousDeploymentFromGroupSibling(currentId, owner, repo, appGcp, 2026)
    expect(prevStrictYear).toBeNull()
  })
})
