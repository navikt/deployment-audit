import { NOT_APPROVED_STATUSES, PENDING_STATUSES } from '~/lib/four-eyes-status'
import { pool } from '../connection.server'
import type { AppWithIssues, DeploymentWithApp } from '../deployments.server'
import { lowerUsernames, userDeploymentMatchAnySql, userDeploymentMatchSql } from '../user-deployment-match'

/**
 * Get apps with issues filtered to a dev team's scope.
 *
 * The scope is the **union** of `nais_team_slugs` (apps owned by the team via
 * their nais team slug) and `directAppIds` (apps explicitly attached to the
 * dev team in NDA). An app is included if it matches either side — this
 * matches user expectations on /my-teams where teams may have both.
 *
 * `deployerUsernames` (optional) restricts the deployment-derived counts
 * (`without_four_eyes`, `pending_verification`, `missing_goal_links`) to
 * deployments where the deployer or PR creator matches one of the given
 * GitHub usernames. Repository-level alert counts are NOT filtered (they
 * track Dependabot/CodeQL events which aren't tied to a deployer). When the
 * filter is provided as an empty array the deployment counts are 0 — callers
 * should surface a hint to the user that no team members are GitHub-mapped.
 * When the parameter is `undefined` no deployer filter is applied (callers
 * that want app-scope semantics, e.g. the Slack home tab, omit it).
 */
export async function getDevTeamAppsWithIssues(
  naisTeamSlugs: string[],
  directAppIds?: number[],
  deployerUsernames?: string[],
): Promise<AppWithIssues[]> {
  const ids = directAppIds ?? []

  const hasDeployerFilter = deployerUsernames !== undefined
  const deployerFilterClause = hasDeployerFilter ? ` AND ${userDeploymentMatchAnySql(5, 'd')}` : ''
  const params: unknown[] = [NOT_APPROVED_STATUSES, PENDING_STATUSES, naisTeamSlugs, ids]
  if (hasDeployerFilter) params.push(lowerUsernames(deployerUsernames))

  const result = await pool.query(
    `
    SELECT 
      ma.app_name,
      ma.team_slug,
      ma.environment_name,
      COALESCE(dep.without_four_eyes, 0)::integer as without_four_eyes,
      COALESCE(dep.pending_verification, 0)::integer as pending_verification,
      COALESCE(alerts.count, 0)::integer as alert_count,
      COALESCE(dep.missing_goal_links, 0)::integer as missing_goal_links
    FROM monitored_applications ma
    LEFT JOIN LATERAL (
      SELECT 
        SUM(CASE WHEN d.four_eyes_status = ANY($1)${deployerFilterClause} THEN 1 ELSE 0 END) as without_four_eyes,
        SUM(CASE WHEN d.four_eyes_status = ANY($2)${deployerFilterClause} THEN 1 ELSE 0 END) as pending_verification,
        SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM deployment_goal_links dgl WHERE dgl.deployment_id = d.id AND dgl.is_active = true)${deployerFilterClause} THEN 1 ELSE 0 END) as missing_goal_links
      FROM deployments d
      WHERE d.monitored_app_id = ma.id
        AND (ma.audit_start_year IS NULL OR d.created_at >= make_date(ma.audit_start_year, 1, 1))
    ) dep ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as count
      FROM repository_alerts ra
      WHERE ra.monitored_app_id = ma.id AND ra.resolved_at IS NULL
    ) alerts ON true
    WHERE ma.is_active = true
      AND (ma.team_slug = ANY($3::text[]) OR ma.id = ANY($4::int[]))
      AND (COALESCE(dep.without_four_eyes, 0) > 0 
        OR COALESCE(dep.pending_verification, 0) > 0 
        OR COALESCE(alerts.count, 0) > 0
        OR COALESCE(dep.missing_goal_links, 0) > 0)
    ORDER BY COALESCE(dep.without_four_eyes, 0) DESC, COALESCE(dep.missing_goal_links, 0) DESC, COALESCE(alerts.count, 0) DESC
  `,
    params,
  )
  return result.rows
}

/**
 * Get recent deployments for Slack Home Tab
 */
async function _getRecentDeploymentsForHomeTab(limit = 10): Promise<DeploymentWithApp[]> {
  const result = await pool.query(
    `SELECT d.*, 
            ma.team_slug, ma.environment_name, ma.app_name
     FROM deployments d
     JOIN monitored_applications ma ON d.monitored_app_id = ma.id
     WHERE ma.is_active = true
     ORDER BY d.created_at DESC
     LIMIT $1`,
    [limit],
  )
  return result.rows
}

/**
 * Count deployments where the given GitHub user is the deployer or the PR
 * creator, AND the deployment has no active goal-link.
 *
 * Used by the personalised Slack home tab to surface "your own deployments
 * that lack endringsopphav (goal linkage)" so that the user can act on them.
 *
 * Filters:
 * - Only `is_active = true` monitored applications.
 * - Respects `audit_start_year` per app (matches existing dashboard queries).
 * - Excludes deployments with any `is_active = true` row in
 *   `deployment_goal_links`.
 *
 * The username match is case-insensitive on both `deployer_username` and
 * `github_pr_data->'creator'->>'username'`.
 */
export async function getPersonalDeploymentsMissingGoalLinks(githubUsername: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM deployments d
     JOIN monitored_applications ma ON d.monitored_app_id = ma.id
     WHERE ma.is_active = true
       AND (ma.audit_start_year IS NULL OR d.created_at >= make_date(ma.audit_start_year, 1, 1))
       AND ${userDeploymentMatchSql(1)}
       AND NOT EXISTS (
         SELECT 1 FROM deployment_goal_links dgl
         WHERE dgl.deployment_id = d.id AND dgl.is_active = true
       )`,
    [githubUsername],
  )
  return result.rows[0]?.count ?? 0
}
