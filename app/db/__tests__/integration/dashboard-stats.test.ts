/**
 * Integration test: Dashboard statistics SQL queries.
 * Tests the exact SQL used in dashboard-stats.server.ts against a real PostgreSQL instance.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getBoardObjectiveProgress, getDevTeamSummaryStats } from '../../dashboard-stats.server'
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
