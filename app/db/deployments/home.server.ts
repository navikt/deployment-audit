import { NOT_APPROVED_STATUSES, PENDING_STATUSES } from '~/lib/four-eyes-status'
import { pool } from '../connection.server'
import type { AppWithIssues, DeploymentWithApp } from '../deployments.server'
import { userDeploymentMatchSql } from '../user-deployment-match'

/**
 * Get apps with issues filtered to a dev team's scope.
 *
 * The scope is the **union** of `nais_team_slugs` (apps owned by the team via
 * their nais team slug) and `directAppIds` (apps explicitly attached to the
 * dev team in NDA). An app is included if it matches either side — this
 * matches user expectations on /my-teams where teams may have both.
 */
export async function getDevTeamAppsWithIssues(
  naisTeamSlugs: string[],
  directAppIds?: number[],
): Promise<AppWithIssues[]> {
  const ids = directAppIds ?? []

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
        SUM(CASE WHEN d.four_eyes_status = ANY($1) THEN 1 ELSE 0 END) as without_four_eyes,
        SUM(CASE WHEN d.four_eyes_status = ANY($2) THEN 1 ELSE 0 END) as pending_verification,
        SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM deployment_goal_links dgl WHERE dgl.deployment_id = d.id AND dgl.is_active = true) THEN 1 ELSE 0 END) as missing_goal_links
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
    [NOT_APPROVED_STATUSES, PENDING_STATUSES, naisTeamSlugs, ids],
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
