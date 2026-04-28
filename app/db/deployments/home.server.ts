import { NOT_APPROVED_STATUSES, PENDING_STATUSES } from '~/lib/four-eyes-status'
import { isGitHubBot } from '~/lib/github-bots'
import { pool } from '../connection.server'
import type { AppWithIssues, DeploymentWithApp } from '../deployments.server'
import { getDevTeamApplications, getGroupAppIdsForDevTeams } from '../dev-teams.server'
import { lowerUsernames, userDeploymentMatchAnySql, userDeploymentMatchSql } from '../user-deployment-match'
import { getMembersGithubUsernamesForDevTeams } from '../user-dev-team-preference.server'

// ---------------------------------------------------------------------------
// Shared dev-team scope resolution
// ---------------------------------------------------------------------------

interface DevTeamScope {
  naisTeamSlugs: string[]
  directAppIds: number[] | undefined
  deployerUsernames: string[] | undefined
  noMembersMapped: boolean
}

/**
 * Resolve the full query scope for a set of dev teams.
 *
 * Combines:
 * - Nais team slugs (deduped)
 * - Direct app IDs + application-group app IDs (merged, deduped)
 * - Deployer usernames (person-scope filter)
 *
 * Both the `/my-teams` page and the Slack Home Tab call this so that they
 * operate on the same scope and produce consistent numbers.
 */
export async function resolveDevTeamScope(
  devTeams: { id: number; nais_team_slugs: string[] }[],
): Promise<DevTeamScope> {
  const naisTeamSlugs = [...new Set(devTeams.flatMap((t) => t.nais_team_slugs))]
  const devTeamIds = devTeams.map((t) => t.id)

  const [directAppsResults, groupAppIds] = await Promise.all([
    Promise.all(devTeams.map((t) => getDevTeamApplications(t.id))),
    getGroupAppIdsForDevTeams(devTeamIds),
  ])
  const allDirectAppIds = [...new Set([...directAppsResults.flat().map((a) => a.monitored_app_id), ...groupAppIds])]
  const directAppIds = allDirectAppIds.length > 0 ? allDirectAppIds : undefined

  let deployerUsernames: string[] | undefined
  try {
    deployerUsernames = await getMembersGithubUsernamesForDevTeams(devTeamIds)
  } catch {
    deployerUsernames = undefined
  }

  const noMembersMapped = deployerUsernames !== undefined && deployerUsernames.length === 0

  return { naisTeamSlugs, directAppIds, deployerUsernames, noMembersMapped }
}

/**
 * Find GitHub usernames that appear as deployers or PR creators in a dev
 * team's apps but do NOT have a corresponding `user_mappings` row.
 *
 * Includes both `deployer_username` and `github_pr_data.creator.username`
 * because both roles need a user mapping for the person-scope filter to
 * count their deployments correctly.
 *
 * Excludes bot accounts using the canonical `isGitHubBot` helper.
 */
export async function getUnmappedContributors(
  naisTeamSlugs: string[],
  directAppIds?: number[],
  since?: Date,
): Promise<string[]> {
  const ids = directAppIds ?? []
  const sinceDate = since ?? new Date(new Date().getFullYear(), 0, 1)
  const result = await pool.query<{ username: string }>(
    `WITH team_deployers AS (
       SELECT username FROM (
         SELECT LOWER(d.deployer_username) AS username
         FROM deployments d
         JOIN monitored_applications ma ON d.monitored_app_id = ma.id
         WHERE ma.is_active = true
           AND (ma.team_slug = ANY($1::text[]) OR ma.id = ANY($2::int[]))
           AND d.deployer_username IS NOT NULL
           AND d.created_at >= $3
         UNION
         SELECT LOWER(d.github_pr_data->'creator'->>'username') AS username
         FROM deployments d
         JOIN monitored_applications ma ON d.monitored_app_id = ma.id
         WHERE ma.is_active = true
           AND (ma.team_slug = ANY($1::text[]) OR ma.id = ANY($2::int[]))
           AND d.github_pr_data->'creator'->>'username' IS NOT NULL
           AND d.created_at >= $3
       ) all_deployers
       WHERE username != ''
     ),
     mapped_usernames AS (
       SELECT DISTINCT LOWER(um.github_username) AS username
       FROM user_mappings um
       WHERE um.deleted_at IS NULL
     )
     SELECT td.username
     FROM team_deployers td
     LEFT JOIN mapped_usernames mu ON mu.username = td.username
     WHERE mu.username IS NULL
     ORDER BY td.username`,
    [naisTeamSlugs, ids, sinceDate],
  )
  return result.rows.map((r) => r.username).filter((u) => !isGitHubBot(u))
}

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
 * When the parameter is `undefined` no deployer filter is applied.
 *
 * Both `/my-teams` and the Slack Home Tab use {@link resolveDevTeamScope} to
 * obtain the same `deployerUsernames` filter so that their numbers agree.
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
