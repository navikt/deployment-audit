/**
 * Integration test: Dashboard statistics SQL queries.
 * Tests the exact SQL used in dashboard-stats.server.ts against a real PostgreSQL instance.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getBoardObjectiveProgress, getDevTeamStatsBatch, getDevTeamSummaryStats } from '../../dashboard-stats.server'
import { getAppDeploymentStatsBatch } from '../../deployments/stats.server'
import { seedApp, seedDevTeam, seedSection, truncateAllTables } from './helpers'

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

describe('getSectionOverallStats SQL', () => {
  it('should count deployments by four_eyes status', async () => {
    const sectionId = await seedSection(pool, 'sec-stats')

    // Link a nais team to the section
    await pool.query(`INSERT INTO section_teams (section_id, team_slug) VALUES ($1, $2)`, [sectionId, 'team-a'])

    const appId = await seedApp(pool, { teamSlug: 'team-a', appName: 'app1', environment: 'prod' })
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    // Create deployments with various statuses
    await seedDeploymentWithStatus(pool, appId, 'team-a', now, 'approved_pr')
    await seedDeploymentWithStatus(pool, appId, 'team-a', now, 'approved_pr')
    await seedDeploymentWithStatus(pool, appId, 'team-a', now, 'direct_push')
    await seedDeploymentWithStatus(pool, appId, 'team-a', now, 'pending')

    const result = await pool.query(
      `SELECT
         COUNT(d.id)::int AS total_deployments,
         COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('approved', 'approved_pr', 'implicitly_approved', 'manually_approved', 'no_changes'))::int AS with_four_eyes,
         COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('direct_push', 'unverified_commits', 'approved_pr_with_unreviewed', 'unauthorized_repository', 'unauthorized_branch'))::int AS without_four_eyes,
         COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('pending', 'pending_baseline', 'pending_approval', 'unknown'))::int AS pending_verification,
         COUNT(DISTINCT dgl.deployment_id)::int AS linked_to_goal
       FROM section_teams st
       JOIN deployments d ON d.team_slug = st.team_slug
         AND d.created_at >= $2 AND d.created_at < $3
       LEFT JOIN deployment_goal_links dgl ON dgl.deployment_id = d.id
       WHERE st.section_id = $1`,
      [sectionId, startDate, endDate],
    )

    expect(result.rows[0].total_deployments).toBe(4)
    expect(result.rows[0].with_four_eyes).toBe(2)
    expect(result.rows[0].without_four_eyes).toBe(1)
    expect(result.rows[0].pending_verification).toBe(1)
    expect(result.rows[0].linked_to_goal).toBe(0)
  })

  it('should count goal-linked deployments', async () => {
    const sectionId = await seedSection(pool, 'sec-goals')
    await pool.query(`INSERT INTO section_teams (section_id, team_slug) VALUES ($1, $2)`, [sectionId, 'team-b'])

    const appId = await seedApp(pool, { teamSlug: 'team-b', appName: 'app2', environment: 'prod' })
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const depId1 = await seedDeploymentWithStatus(pool, appId, 'team-b', now, 'approved_pr')
    const depId2 = await seedDeploymentWithStatus(pool, appId, 'team-b', now, 'approved_pr')
    await seedDeploymentWithStatus(pool, appId, 'team-b', now, 'approved_pr')

    // Create a board + objective to link to
    const {
      rows: [devTeam],
    } = await pool.query(`INSERT INTO dev_teams (section_id, slug, name) VALUES ($1, $2, $3) RETURNING id`, [
      sectionId,
      'dt-b',
      'Dev Team B',
    ])
    const {
      rows: [board],
    } = await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, $2, 'quarterly', $3, $4, 'Q1') RETURNING id`,
      [devTeam.id, 'Board 1', startDate, endDate],
    )
    const {
      rows: [objective],
    } = await pool.query(`INSERT INTO board_objectives (board_id, title) VALUES ($1, $2) RETURNING id`, [
      board.id,
      'Objective 1',
    ])

    // Link 2 deployments to the objective
    await pool.query(
      `INSERT INTO deployment_goal_links (deployment_id, objective_id, link_method) VALUES ($1, $2, 'manual'), ($3, $2, 'manual')`,
      [depId1, objective.id, depId2],
    )

    const result = await pool.query(
      `SELECT
         COUNT(d.id)::int AS total_deployments,
         COUNT(DISTINCT dgl.deployment_id)::int AS linked_to_goal
       FROM section_teams st
       JOIN deployments d ON d.team_slug = st.team_slug
         AND d.created_at >= $2 AND d.created_at < $3
       LEFT JOIN deployment_goal_links dgl ON dgl.deployment_id = d.id
       WHERE st.section_id = $1`,
      [sectionId, startDate, endDate],
    )

    expect(result.rows[0].total_deployments).toBe(3)
    expect(result.rows[0].linked_to_goal).toBe(2)
  })

  it('should return zeros for sections with no deployments', async () => {
    const sectionId = await seedSection(pool, 'sec-empty')
    await pool.query(`INSERT INTO section_teams (section_id, team_slug) VALUES ($1, $2)`, [sectionId, 'team-empty'])

    const startDate = new Date('2025-01-01')
    const endDate = new Date('2025-02-01')

    const result = await pool.query(
      `SELECT
         COUNT(d.id)::int AS total_deployments,
         COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('approved', 'approved_pr', 'implicitly_approved', 'manually_approved', 'no_changes'))::int AS with_four_eyes,
         COUNT(DISTINCT dgl.deployment_id)::int AS linked_to_goal
       FROM section_teams st
       JOIN deployments d ON d.team_slug = st.team_slug
         AND d.created_at >= $2 AND d.created_at < $3
       LEFT JOIN deployment_goal_links dgl ON dgl.deployment_id = d.id
       WHERE st.section_id = $1`,
      [sectionId, startDate, endDate],
    )

    expect(result.rows[0].total_deployments).toBe(0)
    expect(result.rows[0].with_four_eyes).toBe(0)
    expect(result.rows[0].linked_to_goal).toBe(0)
  })
})

describe('getDevTeamSummaryStats SQL', () => {
  it('unions naisTeamSlugs and directAppIds when both are provided', async () => {
    // App reachable only via nais team slug
    const naisAppId = await seedApp(pool, { teamSlug: 'team-nais', appName: 'nais-app', environment: 'prod' })
    // App reachable only via direct attachment
    const directAppId = await seedApp(pool, { teamSlug: 'other-team', appName: 'direct-app', environment: 'prod' })

    const now = new Date()
    await seedDeploymentWithStatus(pool, naisAppId, 'team-nais', now, 'approved_pr')
    await seedDeploymentWithStatus(pool, naisAppId, 'team-nais', now, 'direct_push')
    await seedDeploymentWithStatus(pool, directAppId, 'other-team', now, 'approved_pr')
    await seedDeploymentWithStatus(pool, directAppId, 'other-team', now, 'pending')

    const stats = await getDevTeamSummaryStats(['team-nais'], [directAppId])

    expect(stats.total_apps).toBe(2)
    expect(stats.total_deployments).toBe(4)
    expect(stats.with_four_eyes).toBe(2)
    expect(stats.without_four_eyes).toBe(1)
    expect(stats.pending_verification).toBe(1)
  })

  it('uses only naisTeamSlugs when directAppIds is empty/undefined', async () => {
    const naisAppId = await seedApp(pool, { teamSlug: 'team-only-nais', appName: 'a', environment: 'prod' })
    await seedDeploymentWithStatus(pool, naisAppId, 'team-only-nais', new Date(), 'approved_pr')

    const stats = await getDevTeamSummaryStats(['team-only-nais'])
    expect(stats.total_apps).toBe(1)
    expect(stats.total_deployments).toBe(1)
  })

  it('uses only directAppIds when naisTeamSlugs is empty', async () => {
    const directAppId = await seedApp(pool, { teamSlug: 'unrelated', appName: 'd', environment: 'prod' })
    await seedDeploymentWithStatus(pool, directAppId, 'unrelated', new Date(), 'approved_pr')

    const stats = await getDevTeamSummaryStats([], [directAppId])
    expect(stats.total_apps).toBe(1)
    expect(stats.total_deployments).toBe(1)
  })

  it('does not double-count an app that matches both nais slug and direct id', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-overlap', appName: 'overlap', environment: 'prod' })
    await seedDeploymentWithStatus(pool, appId, 'team-overlap', new Date(), 'approved_pr')

    const stats = await getDevTeamSummaryStats(['team-overlap'], [appId])
    expect(stats.total_apps).toBe(1)
    expect(stats.total_deployments).toBe(1)
  })

  it('restricts deployment counts to the given deployerUsernames (person-scope)', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team-scope', appName: 'scoped', environment: 'prod' })
    // 3 deployments by team member, 2 by an outsider
    await seedDeploymentWithStatus(pool, appId, 'team-scope', new Date(), 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'team-scope', new Date(), 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'team-scope', new Date(), 'direct_push', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'team-scope', new Date(), 'approved_pr', 'outsider')
    await seedDeploymentWithStatus(pool, appId, 'team-scope', new Date(), 'direct_push', 'outsider')

    const personScope = await getDevTeamSummaryStats(['team-scope'], undefined, undefined, ['alice'])
    expect(personScope.total_apps).toBe(1) // app-scope: app is still in scope
    expect(personScope.total_deployments).toBe(3) // person-scope: only alice's
    expect(personScope.with_four_eyes).toBe(2)
    expect(personScope.without_four_eyes).toBe(1)

    // Empty array ⇒ no team members mapped ⇒ deployment counts are 0.
    const emptyScope = await getDevTeamSummaryStats(['team-scope'], undefined, undefined, [])
    expect(emptyScope.total_apps).toBe(1)
    expect(emptyScope.total_deployments).toBe(0)

    // undefined ⇒ no filter ⇒ all 5 deployments.
    const noFilter = await getDevTeamSummaryStats(['team-scope'])
    expect(noFilter.total_deployments).toBe(5)
  })
})

async function seedDeploymentWithStatus(
  pool: Pool,
  monitoredAppId: number,
  teamSlug: string,
  createdAt: Date,
  fourEyesStatus: string,
  deployerUsername: string = 'test-user',
): Promise<number> {
  const naisId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO deployments (
      monitored_app_id, nais_deployment_id, team_slug, app_name, environment_name,
      commit_sha, created_at, four_eyes_status, deployer_username
    ) VALUES ($1, $2, $3, 'test-app', 'prod', $4, $5, $6, $7)
    RETURNING id`,
    [monitoredAppId, naisId, teamSlug, `sha-${naisId}`, createdAt, fourEyesStatus, deployerUsername],
  )
  return rows[0].id
}

describe('getBoardObjectiveProgress', () => {
  it('returns empty array for board with no objectives', async () => {
    const sectionId = await seedSection(pool, 'sec-bop-empty')
    const devTeamId = await seedDevTeam(pool, 'team-bop-empty', 'BOP', sectionId)
    const { rows } = await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, 'B', 'tertiary', '2026-01-01', '2026-04-30', 'T1') RETURNING id`,
      [devTeamId],
    )
    const result = await getBoardObjectiveProgress(rows[0].id)
    expect(result.objectives).toEqual([])
    expect(result.totalDistinctDeployments).toBe(0)
  })

  it('aggregates linked deployment counts per objective and key result in constant queries', async () => {
    const sectionId = await seedSection(pool, 'sec-bop')
    const devTeamId = await seedDevTeam(pool, 'team-bop', 'BOP', sectionId)
    const { rows: br } = await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, 'B', 'tertiary', '2026-01-01', '2026-04-30', 'T1') RETURNING id`,
      [devTeamId],
    )
    const boardId = br[0].id

    const { rows: o1 } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'O1', 0) RETURNING id",
      [boardId],
    )
    const { rows: o2 } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'O2-no-kr', 1) RETURNING id",
      [boardId],
    )
    // inactive objective should be skipped
    await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order, is_active) VALUES ($1, 'O-inactive', 2, false)",
      [boardId],
    )
    const { rows: kr1 } = await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR1', 0) RETURNING id",
      [o1[0].id],
    )
    const { rows: kr2 } = await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR2', 1) RETURNING id",
      [o1[0].id],
    )
    // inactive KR should be skipped
    await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order, is_active) VALUES ($1, 'KR-inactive', 2, false)",
      [o1[0].id],
    )

    const appId = await seedApp(pool, { teamSlug: 'team-bop', appName: 'app-bop', environment: 'prod' })
    const d1 = await seedDeploymentWithStatus(pool, appId, 'team-bop', new Date(), 'approved_pr')
    const d2 = await seedDeploymentWithStatus(pool, appId, 'team-bop', new Date(), 'approved_pr')
    const d3 = await seedDeploymentWithStatus(pool, appId, 'team-bop', new Date(), 'approved_pr')

    // 2 deployments linked to KR1, 1 to KR2, 1 directly to objective O1
    await pool.query(
      "INSERT INTO deployment_goal_links (deployment_id, key_result_id, link_method) VALUES ($1, $2, 'manual')",
      [d1, kr1[0].id],
    )
    await pool.query(
      "INSERT INTO deployment_goal_links (deployment_id, key_result_id, link_method) VALUES ($1, $2, 'manual')",
      [d2, kr1[0].id],
    )
    await pool.query(
      "INSERT INTO deployment_goal_links (deployment_id, key_result_id, link_method) VALUES ($1, $2, 'manual')",
      [d2, kr2[0].id],
    )
    await pool.query(
      "INSERT INTO deployment_goal_links (deployment_id, objective_id, link_method) VALUES ($1, $2, 'manual')",
      [d3, o1[0].id],
    )
    // inactive link should be ignored
    await pool.query(
      "INSERT INTO deployment_goal_links (deployment_id, key_result_id, link_method, is_active) VALUES ($1, $2, 'manual', false)",
      [d1, kr2[0].id],
    )

    const { objectives: result, totalDistinctDeployments } = await getBoardObjectiveProgress(boardId)
    expect(result).toHaveLength(2)

    const r1 = result.find((r) => r.objective_id === o1[0].id)
    if (!r1) throw new Error('expected r1')
    expect(r1.objective_title).toBe('O1')
    expect(r1.key_results.map((k) => ({ id: k.id, linked: k.linked_deployments }))).toEqual([
      { id: kr1[0].id, linked: 2 },
      { id: kr2[0].id, linked: 1 },
    ])
    // 1 (objective-direct d3) + 2 distinct deployments via KRs (d1, d2) = 3
    // d2 is linked to both KR1 and KR2, but counts only once at objective level
    expect(r1.total_linked_deployments).toBe(3)

    const r2 = result.find((r) => r.objective_id === o2[0].id)
    if (!r2) throw new Error('expected r2')
    expect(r2.key_results).toEqual([])
    expect(r2.total_linked_deployments).toBe(0)

    // Total distinct deployments linked to this board = d1 (KR1), d2 (KR1+KR2), d3 (O1) = 3
    expect(totalDistinctDeployments).toBe(3)
  })
})

describe('getDevTeamStatsBatch vs getAppDeploymentStatsBatch consistency', () => {
  /**
   * Helper: seed a dev team with nais team link, team members, and user mappings.
   */
  async function seedTeamWithMembers(
    sectionId: number,
    opts: {
      teamSlug: string
      naisTeamSlug: string
      members: Array<{ navIdent: string; githubUsername: string }>
    },
  ) {
    const devTeamId = await seedDevTeam(pool, opts.teamSlug, opts.teamSlug, sectionId)
    await pool.query(`INSERT INTO dev_team_nais_teams (dev_team_id, nais_team_slug) VALUES ($1, $2)`, [
      devTeamId,
      opts.naisTeamSlug,
    ])
    for (const m of opts.members) {
      await pool.query(`INSERT INTO user_mappings (github_username, nav_ident) VALUES ($1, $2)`, [
        m.githubUsername,
        m.navIdent,
      ])
      await pool.query(`INSERT INTO user_dev_team_preference (dev_team_id, nav_ident) VALUES ($1, $2)`, [
        devTeamId,
        m.navIdent,
      ])
    }
    return { devTeamId, githubUsernames: opts.members.map((m) => m.githubUsername) }
  }

  async function seedDeployWithPrCreator(
    monitoredAppId: number,
    teamSlug: string,
    createdAt: Date,
    fourEyesStatus: string,
    deployerUsername: string,
    prCreatorUsername?: string,
  ): Promise<number> {
    const naisId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const prData = prCreatorUsername ? JSON.stringify({ creator: { username: prCreatorUsername } }) : null
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO deployments (
        monitored_app_id, nais_deployment_id, team_slug, app_name, environment_name,
        commit_sha, created_at, four_eyes_status, deployer_username, github_pr_data
      ) VALUES ($1, $2, $3, 'test-app', 'prod', $4, $5, $6, $7, $8)
      RETURNING id`,
      [monitoredAppId, naisId, teamSlug, `sha-${naisId}`, createdAt, fourEyesStatus, deployerUsername, prData],
    )
    return rows[0].id
  }

  it('batch team stats matches per-app stats for without_four_eyes', async () => {
    const sectionId = await seedSection(pool, 'sec-consistency')
    const { devTeamId, githubUsernames } = await seedTeamWithMembers(sectionId, {
      teamSlug: 'team-consistency',
      naisTeamSlug: 'nais-team-c',
      members: [
        { navIdent: 'A100001', githubUsername: 'alice' },
        { navIdent: 'B200002', githubUsername: 'bob' },
      ],
    })

    const appId = await seedApp(pool, { teamSlug: 'nais-team-c', appName: 'app-c', environment: 'prod' })
    const now = new Date()
    const startDate = new Date(now.getFullYear(), 0, 1)

    // 2 approved by alice, 1 direct_push by bob
    await seedDeploymentWithStatus(pool, appId, 'nais-team-c', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'nais-team-c', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'nais-team-c', now, 'direct_push', 'bob')
    // outsider — should not be counted by either query
    await seedDeploymentWithStatus(pool, appId, 'nais-team-c', now, 'direct_push', 'mallory')

    const batchMap = await getDevTeamStatsBatch([devTeamId], startDate)
    const teamStats = batchMap.get(devTeamId)

    const appStatsMap = await getAppDeploymentStatsBatch([{ id: appId }], githubUsernames, { startDate })
    const appStats = appStatsMap.get(appId)

    expect(teamStats).toBeDefined()
    expect(appStats).toBeDefined()

    // Both queries should agree on totals and four-eyes counts
    expect(teamStats?.total_deployments).toBe(3)
    expect(appStats?.total).toBe(3)
    expect(teamStats?.without_four_eyes).toBe(appStats?.without_four_eyes)
    expect(teamStats?.with_four_eyes).toBe(appStats?.with_four_eyes)
    expect(teamStats?.without_four_eyes).toBe(1)
    expect(teamStats?.with_four_eyes).toBe(2)
  })

  it('does not double-count when deployer AND pr_creator are both team members', async () => {
    const sectionId = await seedSection(pool, 'sec-double')
    const { devTeamId, githubUsernames } = await seedTeamWithMembers(sectionId, {
      teamSlug: 'team-double',
      naisTeamSlug: 'nais-team-d',
      members: [
        { navIdent: 'A100002', githubUsername: 'alice' },
        { navIdent: 'B200003', githubUsername: 'bob' },
      ],
    })

    const appId = await seedApp(pool, { teamSlug: 'nais-team-d', appName: 'app-d', environment: 'prod' })
    const now = new Date()
    const startDate = new Date(now.getFullYear(), 0, 1)

    // Deployment where deployer=alice AND pr_creator=bob — both are team members.
    // This must be counted exactly once, not twice.
    await seedDeployWithPrCreator(appId, 'nais-team-d', now, 'direct_push', 'alice', 'bob')
    // A normal deployment by alice (no PR creator overlap)
    await seedDeploymentWithStatus(pool, appId, 'nais-team-d', now, 'approved_pr', 'alice')

    const batchMap = await getDevTeamStatsBatch([devTeamId], startDate)
    const teamStats = batchMap.get(devTeamId)

    const appStatsMap = await getAppDeploymentStatsBatch([{ id: appId }], githubUsernames, { startDate })
    const appStats = appStatsMap.get(appId)

    expect(teamStats).toBeDefined()
    expect(appStats).toBeDefined()

    // Both should count exactly 2 deployments total
    expect(teamStats?.total_deployments).toBe(2)
    expect(appStats?.total).toBe(2)

    // Both should agree: 1 without four-eyes, 1 with four-eyes
    expect(teamStats?.without_four_eyes).toBe(1)
    expect(teamStats?.with_four_eyes).toBe(1)
    expect(teamStats?.without_four_eyes).toBe(appStats?.without_four_eyes)
    expect(teamStats?.with_four_eyes).toBe(appStats?.with_four_eyes)
  })

  it('legacy deployments are counted as without_four_eyes in both queries', async () => {
    // Legacy/error/mismatch statuses must count as failures (without_four_eyes)
    // so app cards show them and match the top card's gap.
    const sectionId = await seedSection(pool, 'sec-legacy-gap')
    const { devTeamId, githubUsernames } = await seedTeamWithMembers(sectionId, {
      teamSlug: 'team-legacy-gap',
      naisTeamSlug: 'nais-team-lg',
      members: [{ navIdent: 'A100003', githubUsername: 'alice' }],
    })

    const appId = await seedApp(pool, { teamSlug: 'nais-team-lg', appName: 'app-lg', environment: 'prod' })
    const now = new Date()
    const startDate = new Date(now.getFullYear(), 0, 1)

    // 3 approved + 2 legacy → legacy should count as failures
    await seedDeploymentWithStatus(pool, appId, 'nais-team-lg', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'nais-team-lg', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'nais-team-lg', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'nais-team-lg', now, 'legacy', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'nais-team-lg', now, 'legacy', 'alice')

    const batchMap = await getDevTeamStatsBatch([devTeamId], startDate)
    const teamStats = batchMap.get(devTeamId)

    const appStatsMap = await getAppDeploymentStatsBatch([{ id: appId }], githubUsernames, { startDate })
    const appStats = appStatsMap.get(appId)

    // Both should count 5 total, 3 approved, 2 without four-eyes (legacy)
    expect(teamStats?.total_deployments).toBe(5)
    expect(teamStats?.with_four_eyes).toBe(3)
    expect(teamStats?.without_four_eyes).toBe(2)
    expect(teamStats?.pending_verification).toBe(0)

    expect(appStats?.total).toBe(5)
    expect(appStats?.with_four_eyes).toBe(3)
    expect(appStats?.without_four_eyes).toBe(2)
    expect(appStats?.pending_verification).toBe(0)

    // No gap: total = with_four_eyes + without_four_eyes + pending
    const total = teamStats?.total_deployments ?? 0
    const covered =
      (teamStats?.with_four_eyes ?? 0) + (teamStats?.without_four_eyes ?? 0) + (teamStats?.pending_verification ?? 0)
    expect(total).toBe(covered)
  })

  it('bot deployer with team member PR creator: both queries agree', async () => {
    // Production scenario: CI bot deploys, but PR was created by a team member.
    // Both queries should match via PR creator.
    const sectionId = await seedSection(pool, 'sec-bot')
    const { devTeamId, githubUsernames } = await seedTeamWithMembers(sectionId, {
      teamSlug: 'team-bot',
      naisTeamSlug: 'nais-team-bot',
      members: [{ navIdent: 'A100004', githubUsername: 'alice' }],
    })

    const appId = await seedApp(pool, { teamSlug: 'nais-team-bot', appName: 'app-bot', environment: 'prod' })
    const now = new Date()
    const startDate = new Date(now.getFullYear(), 0, 1)

    // Bot deploys, but alice created the PR. Status = legacy (not approved).
    await seedDeployWithPrCreator(appId, 'nais-team-bot', now, 'legacy', 'github-actions[bot]', 'alice')
    // Bot deploys approved PR by alice
    await seedDeployWithPrCreator(appId, 'nais-team-bot', now, 'approved_pr', 'github-actions[bot]', 'alice')

    const batchMap = await getDevTeamStatsBatch([devTeamId], startDate)
    const teamStats = batchMap.get(devTeamId)

    const appStatsMap = await getAppDeploymentStatsBatch([{ id: appId }], githubUsernames, { startDate })
    const appStats = appStatsMap.get(appId)

    // Both should find 2 deployments (matched via PR creator)
    expect(teamStats?.total_deployments).toBe(2)
    expect(appStats?.total).toBe(2)
    expect(teamStats?.without_four_eyes).toBe(1)
    expect(appStats?.without_four_eyes).toBe(1)
    expect(teamStats?.with_four_eyes).toBe(1)
    expect(appStats?.with_four_eyes).toBe(1)
  })

  it('multiple apps across nais teams: team total equals sum of app totals', async () => {
    // Production scenario: team has apps across multiple nais teams.
    // Top card total must equal sum of all app card totals.
    const sectionId = await seedSection(pool, 'sec-multi')
    const { devTeamId, githubUsernames } = await seedTeamWithMembers(sectionId, {
      teamSlug: 'team-multi',
      naisTeamSlug: 'nais-team-m1',
      members: [
        { navIdent: 'A100005', githubUsername: 'alice' },
        { navIdent: 'B200005', githubUsername: 'bob' },
      ],
    })
    // Add a second nais team
    await pool.query(`INSERT INTO dev_team_nais_teams (dev_team_id, nais_team_slug) VALUES ($1, $2)`, [
      devTeamId,
      'nais-team-m2',
    ])

    const app1 = await seedApp(pool, { teamSlug: 'nais-team-m1', appName: 'app-m1', environment: 'prod' })
    const app2 = await seedApp(pool, { teamSlug: 'nais-team-m2', appName: 'app-m2', environment: 'prod' })
    const now = new Date()
    const startDate = new Date(now.getFullYear(), 0, 1)

    // App1: 3 approved by alice, 1 legacy by bob
    await seedDeploymentWithStatus(pool, app1, 'nais-team-m1', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, app1, 'nais-team-m1', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, app1, 'nais-team-m1', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, app1, 'nais-team-m1', now, 'legacy', 'bob')

    // App2: 2 approved by bob, 1 error by alice
    await seedDeploymentWithStatus(pool, app2, 'nais-team-m2', now, 'approved_pr', 'bob')
    await seedDeploymentWithStatus(pool, app2, 'nais-team-m2', now, 'approved_pr', 'bob')
    await seedDeploymentWithStatus(pool, app2, 'nais-team-m2', now, 'error', 'alice')

    const batchMap = await getDevTeamStatsBatch([devTeamId], startDate)
    const teamStats = batchMap.get(devTeamId)

    const appStatsMap = await getAppDeploymentStatsBatch([{ id: app1 }, { id: app2 }], githubUsernames, { startDate })
    const app1Stats = appStatsMap.get(app1)
    const app2Stats = appStatsMap.get(app2)

    // Team total must equal sum of app totals
    const sumTotal = (app1Stats?.total ?? 0) + (app2Stats?.total ?? 0)
    const sumWithout = (app1Stats?.without_four_eyes ?? 0) + (app2Stats?.without_four_eyes ?? 0)
    const sumWith = (app1Stats?.with_four_eyes ?? 0) + (app2Stats?.with_four_eyes ?? 0)

    expect(teamStats?.total_deployments).toBe(7)
    expect(sumTotal).toBe(7)
    expect(teamStats?.total_deployments).toBe(sumTotal)
    expect(teamStats?.without_four_eyes).toBe(sumWithout)
    expect(teamStats?.with_four_eyes).toBe(sumWith)
    expect(teamStats?.without_four_eyes).toBe(2)
    expect(teamStats?.with_four_eyes).toBe(5)
  })

  it('NULL four_eyes_status deployments are counted in totals consistently', async () => {
    // Regression test: NULL four_eyes_status must be treated as 'unknown' (pending).
    // The DB column allows NULL (DEFAULT 'unknown' without NOT NULL constraint).
    // Without COALESCE, NULL falls through all category FILTERs, causing total > sum.
    const sectionId = await seedSection(pool, 'sec-null-status')
    const { githubUsernames } = await seedTeamWithMembers(sectionId, {
      teamSlug: 'team-null-status',
      naisTeamSlug: 'nais-team-null',
      members: [{ navIdent: 'A100006', githubUsername: 'alice' }],
    })

    const appId = await seedApp(pool, {
      teamSlug: 'nais-team-null',
      appName: 'app-null',
      environment: 'prod',
    })
    const now = new Date()
    const startDate = new Date(now.getFullYear(), 0, 1)

    // 2 approved + 1 with NULL four_eyes_status
    await seedDeploymentWithStatus(pool, appId, 'nais-team-null', now, 'approved_pr', 'alice')
    await seedDeploymentWithStatus(pool, appId, 'nais-team-null', now, 'approved_pr', 'alice')

    // Insert deployment with NULL four_eyes_status
    const naisId = `deploy-null-${Date.now()}`
    await pool.query(
      `INSERT INTO deployments (
        monitored_app_id, nais_deployment_id, team_slug, app_name, environment_name,
        commit_sha, created_at, four_eyes_status, deployer_username
      ) VALUES ($1, $2, $3, 'app-null', 'prod', $4, $5, NULL, 'alice')`,
      [appId, naisId, 'nais-team-null', `sha-${naisId}`, now],
    )

    const appStatsMap = await getAppDeploymentStatsBatch([{ id: appId }], githubUsernames, { startDate })
    const appStats = appStatsMap.get(appId)

    expect(appStats).toBeDefined()
    expect(appStats?.total).toBe(3)

    // NULL is treated as 'unknown' (pending), so categories must sum to total
    const sumCategories =
      (appStats?.with_four_eyes ?? 0) + (appStats?.without_four_eyes ?? 0) + (appStats?.pending_verification ?? 0)
    expect(sumCategories).toBe(appStats?.total)
    expect(appStats?.pending_verification).toBe(1)
  })
})
