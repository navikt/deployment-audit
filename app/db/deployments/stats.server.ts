import { APPROVED_STATUSES, NOT_APPROVED_STATUSES, PENDING_STATUSES } from '~/lib/four-eyes-status'
import { pool } from '../connection.server'
import type { AppDeploymentStats } from '../deployments.server'
import { lowerUsernames, userDeploymentMatchAnySql } from '../user-deployment-match'

interface StatsOptions {
  startDate?: Date
  endDate?: Date
}

/**
 * Get deployment stats for a single app.
 *
 * Delegates to {@link getAppDeploymentStatsBatch} so there is a single SQL
 * implementation for all stats queries — deployer filtering, date ranges,
 * audit year, and goal-link counting all behave identically everywhere.
 *
 * If you need deployer-scoped stats (e.g. "stats for team X's deploys"),
 * call `getAppDeploymentStatsBatch` directly with `deployerUsernames`.
 */
export async function getAppDeploymentStats(
  monitoredAppId: number,
  startDate?: Date,
  endDate?: Date,
  auditStartYear?: number | null,
): Promise<AppDeploymentStats> {
  const map = await getAppDeploymentStatsBatch([{ id: monitoredAppId, audit_start_year: auditStartYear }], undefined, {
    startDate,
    endDate,
  })
  return (
    map.get(monitoredAppId) ?? {
      total: 0,
      with_four_eyes: 0,
      without_four_eyes: 0,
      pending_verification: 0,
      last_deployment: null,
      last_deployment_id: null,
      four_eyes_percentage: 0,
    }
  )
}

/**
 * Get deployment stats for multiple apps in a single query.
 *
 * When `deployerUsernames` is provided, count columns (total, with_four_eyes,
 * without_four_eyes, etc.) are filtered to deployments where a given username
 * is the deployer **or** PR creator — via `userDeploymentMatchAnySql`. This
 * is the same matching logic used in `getDeploymentsPaginated`'s
 * `deployer_usernames` filter, ensuring stat counts agree with list results.
 *
 * `last_deployment` is intentionally **not** filtered by deployer so AppCard
 * always shows the chronologically latest deploy to the app.
 *
 * @returns Map of appId → AppDeploymentStats
 */
export async function getAppDeploymentStatsBatch(
  apps: Array<{ id: number; audit_start_year?: number | null }>,
  deployerUsernames?: string[],
  options?: StatsOptions,
): Promise<Map<number, AppDeploymentStats>> {
  if (apps.length === 0) {
    return new Map()
  }

  const appIds = apps.map((a) => a.id)

  // Build the audit year filter as a CASE expression
  const auditYearCases = apps
    .filter((a) => a.audit_start_year)
    .map((a) => `WHEN monitored_app_id = ${a.id} THEN EXTRACT(YEAR FROM created_at) >= ${a.audit_start_year}`)
    .join(' ')

  const auditYearFilter = auditYearCases ? `AND (CASE ${auditYearCases} ELSE true END)` : ''

  // Build base params and track param index dynamically so deployer/date
  // placeholders bind to the correct $N regardless of which optional
  // filters are active.
  const baseParams: any[] = [appIds, APPROVED_STATUSES, NOT_APPROVED_STATUSES, PENDING_STATUSES]
  let paramIndex = 5

  // Date range filter — applied to the main WHERE clause (affects all aggregates).
  let dateFilter = ''
  if (options?.startDate) {
    dateFilter += ` AND created_at >= $${paramIndex}`
    baseParams.push(options.startDate)
    paramIndex++
  }
  if (options?.endDate) {
    dateFilter += ` AND created_at <= $${paramIndex}`
    baseParams.push(options.endDate)
    paramIndex++
  }

  // Deployer filter is applied only to count/aggregate columns, not to last_deployment.
  // The "last deployment" timestamp/id should always reflect the most recent deploy
  // to the app (regardless of deployer), so AppCard's "last deployment" link/timestamp
  // doesn't silently change meaning when filtering by team members.
  // Empty array ⇒ counts are 0 (FILTER clause matches nothing).
  // Matches both deployer_username and PR creator (case-insensitive) so a team
  // member's PR deployed by a bot still counts toward the team's stats.
  const hasDeployerFilter = deployerUsernames !== undefined
  const deployerFilterClause = hasDeployerFilter ? ` AND ${userDeploymentMatchAnySql(paramIndex, 'deployments')}` : ''
  if (hasDeployerFilter) {
    baseParams.push(lowerUsernames(deployerUsernames))
    paramIndex++
  }

  const result = await pool.query(
    `SELECT 
      monitored_app_id,
      COUNT(*) FILTER (WHERE TRUE${deployerFilterClause}) as total,
      COUNT(*) FILTER (WHERE four_eyes_status = ANY($2::text[])${deployerFilterClause}) as with_four_eyes,
      COUNT(*) FILTER (WHERE four_eyes_status = ANY($3)${deployerFilterClause}) as without_four_eyes,
      COUNT(*) FILTER (WHERE four_eyes_status = ANY($4)${deployerFilterClause}) as pending_verification,
      COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM deployment_goal_links dgl WHERE dgl.deployment_id = deployments.id AND dgl.is_active = true)${deployerFilterClause}) as missing_goal_links,
      MAX(created_at) as last_deployment
    FROM deployments
    WHERE monitored_app_id = ANY($1) ${auditYearFilter}${dateFilter}
    GROUP BY monitored_app_id`,
    baseParams,
  )

  // last_deployment_id is intentionally unfiltered by deployer (see note above).
  const lastDeploymentResult = await pool.query(
    `SELECT DISTINCT ON (monitored_app_id) monitored_app_id, id
     FROM deployments
     WHERE monitored_app_id = ANY($1)
     ORDER BY monitored_app_id, created_at DESC`,
    [appIds],
  )

  const lastDeploymentIds = new Map<number, number>()
  for (const row of lastDeploymentResult.rows) {
    lastDeploymentIds.set(row.monitored_app_id, row.id)
  }

  const statsMap = new Map<number, AppDeploymentStats>()

  // Initialize with empty stats for all apps
  for (const app of apps) {
    statsMap.set(app.id, {
      total: 0,
      with_four_eyes: 0,
      without_four_eyes: 0,
      pending_verification: 0,
      last_deployment: null,
      last_deployment_id: lastDeploymentIds.get(app.id) || null,
      four_eyes_percentage: 0,
    })
  }

  // Fill in actual stats
  for (const row of result.rows) {
    const appId = row.monitored_app_id
    const total = parseInt(row.total, 10) || 0
    const withFourEyes = parseInt(row.with_four_eyes, 10) || 0
    const percentage = total > 0 ? Math.round((withFourEyes / total) * 100) : 0

    statsMap.set(appId, {
      total,
      with_four_eyes: withFourEyes,
      without_four_eyes: parseInt(row.without_four_eyes, 10) || 0,
      pending_verification: parseInt(row.pending_verification, 10) || 0,
      missing_goal_links: parseInt(row.missing_goal_links, 10) || 0,
      last_deployment: row.last_deployment ? new Date(row.last_deployment) : null,
      last_deployment_id: lastDeploymentIds.get(appId) || null,
      four_eyes_percentage: percentage,
    })
  }

  return statsMap
}
