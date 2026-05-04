import { APPROVED_STATUSES_SQL, NOT_APPROVED_STATUSES_SQL, PENDING_STATUSES_SQL } from '~/lib/four-eyes-status'
import { AUDIT_START_YEAR_FILTER } from './audit-start-year'
import { pool } from './connection.server'
import { lowerUsernames, userDeploymentMatchAnySql } from './user-deployment-match'

interface SectionOverallStats {
  total_deployments: number
  with_four_eyes: number
  without_four_eyes: number
  pending_verification: number
  linked_to_goal: number
  four_eyes_coverage: number
  goal_coverage: number
}

interface DevTeamDashboardStats {
  dev_team_id: number
  dev_team_name: string
  dev_team_slug: string
  nais_team_slugs: string[]
  total_deployments: number
  with_four_eyes: number
  without_four_eyes: number
  pending_verification: number
  linked_to_goal: number
  four_eyes_coverage: number
  goal_coverage: number
}

export interface BoardObjectiveProgress {
  objective_id: number
  objective_title: string
  key_results: {
    id: number
    title: string
    linked_deployments: number
  }[]
  total_linked_deployments: number
}

export interface BoardProgressResult {
  objectives: BoardObjectiveProgress[]
  /** Total distinct deployments linked to any objective/KR on the board (no double-counting) */
  totalDistinctDeployments: number
}

interface DevTeamSummaryStats {
  total_apps: number
  total_deployments: number
  with_four_eyes: number
  without_four_eyes: number
  pending_verification: number
  linked_to_goal: number
  four_eyes_coverage: number
  goal_coverage: number
  four_eyes_percentage: number
  goal_percentage: number
  apps_with_issues: number
}

/**
 * Get overall section stats using section_teams for the full picture.
 * This includes ALL deployments for nais teams in the section, regardless of dev team assignment.
 */
export async function getSectionOverallStats(
  sectionId: number,
  startDate?: Date,
  endDate?: Date,
): Promise<SectionOverallStats> {
  const result = await pool.query(
    `SELECT
       COUNT(d.id)::int AS total_deployments,
       COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${APPROVED_STATUSES_SQL}))::int AS with_four_eyes,
       COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${NOT_APPROVED_STATUSES_SQL}))::int AS without_four_eyes,
       COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${PENDING_STATUSES_SQL}))::int AS pending_verification,
       COUNT(DISTINCT dgl.deployment_id)::int AS linked_to_goal
     FROM section_teams st
     JOIN deployments d ON d.team_slug = st.team_slug
       AND ($2::timestamptz IS NULL OR d.created_at >= $2)
       AND ($3::timestamptz IS NULL OR d.created_at < $3)
     JOIN monitored_applications ma ON ma.id = d.monitored_app_id
       AND ${AUDIT_START_YEAR_FILTER}
     LEFT JOIN deployment_goal_links dgl ON dgl.deployment_id = d.id AND dgl.is_active = true
     WHERE st.section_id = $1 AND st.deleted_at IS NULL`,
    [sectionId, startDate ?? null, endDate ?? null],
  )

  const row = result.rows[0]
  const total = row?.total_deployments ?? 0
  const withFourEyes = row?.with_four_eyes ?? 0
  const linked = row?.linked_to_goal ?? 0

  return {
    total_deployments: total,
    with_four_eyes: withFourEyes,
    without_four_eyes: row?.without_four_eyes ?? 0,
    pending_verification: row?.pending_verification ?? 0,
    linked_to_goal: linked,
    four_eyes_coverage: total > 0 ? withFourEyes / total : 0,
    goal_coverage: total > 0 ? linked / total : 0,
  }
}

/**
 * Get dashboard stats for all dev teams in a section within a date range.
 * The per-team scope is the **union** of direct app links
 * (dev_team_applications) and nais team links (dev_team_nais_teams), so a
 * deployment is counted if it matches either side.
 */
export async function getSectionDashboardStats(
  sectionId: number,
  startDate?: Date,
  endDate?: Date,
): Promise<DevTeamDashboardStats[]> {
  const result = await pool.query(
    `WITH team_apps AS (
       -- Direct app links
       SELECT dt.id AS dev_team_id, dt.name AS dev_team_name, dt.slug AS dev_team_slug,
              COALESCE(array_agg(DISTINCT dtn.nais_team_slug) FILTER (WHERE dtn.nais_team_slug IS NOT NULL), '{}') AS nais_team_slugs,
              array_agg(DISTINCT dta.monitored_app_id) FILTER (WHERE dta.monitored_app_id IS NOT NULL) AS direct_app_ids
       FROM dev_teams dt
       LEFT JOIN dev_team_nais_teams dtn ON dtn.dev_team_id = dt.id AND dtn.deleted_at IS NULL
       LEFT JOIN dev_team_applications dta ON dta.dev_team_id = dt.id AND dta.deleted_at IS NULL
       WHERE dt.section_id = $1 AND dt.is_active = true
       GROUP BY dt.id
     ),
     deployment_stats AS (
       SELECT ta.dev_team_id,
              COUNT(d.id) AS total_deployments,
              COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${APPROVED_STATUSES_SQL})) AS with_four_eyes,
              COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${NOT_APPROVED_STATUSES_SQL})) AS without_four_eyes,
              COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${PENDING_STATUSES_SQL})) AS pending_verification,
              COUNT(DISTINCT dgl.deployment_id) AS linked_to_goal
       FROM team_apps ta
       LEFT JOIN LATERAL (
         SELECT d.*
         FROM deployments d
         JOIN monitored_applications ma ON ma.id = d.monitored_app_id
         WHERE (
           d.team_slug = ANY(ta.nais_team_slugs)
           OR d.monitored_app_id = ANY(COALESCE(ta.direct_app_ids, '{}'::int[]))
         )
           AND ($2::timestamptz IS NULL OR d.created_at >= $2)
           AND ($3::timestamptz IS NULL OR d.created_at < $3)
           AND ${AUDIT_START_YEAR_FILTER}
       ) d ON true
       LEFT JOIN deployment_goal_links dgl ON dgl.deployment_id = d.id AND dgl.is_active = true
       GROUP BY ta.dev_team_id
     )
     SELECT ta.dev_team_id, ta.dev_team_name, ta.dev_team_slug,
            ta.nais_team_slugs,
            COALESCE(ds.total_deployments, 0)::int AS total_deployments,
            COALESCE(ds.with_four_eyes, 0)::int AS with_four_eyes,
            COALESCE(ds.without_four_eyes, 0)::int AS without_four_eyes,
            COALESCE(ds.pending_verification, 0)::int AS pending_verification,
            COALESCE(ds.linked_to_goal, 0)::int AS linked_to_goal
     FROM team_apps ta
     LEFT JOIN deployment_stats ds ON ds.dev_team_id = ta.dev_team_id
     ORDER BY ta.dev_team_name`,
    [sectionId, startDate ?? null, endDate ?? null],
  )

  return result.rows.map((row) => ({
    ...row,
    four_eyes_coverage: row.total_deployments > 0 ? row.with_four_eyes / row.total_deployments : 0,
    goal_coverage: row.total_deployments > 0 ? row.linked_to_goal / row.total_deployments : 0,
  }))
}

/**
 * Get summary stats for a single dev team.
 *
 * The scope is the **union** of `naisTeamSlugs` (apps owned via the team's
 * nais team slugs) and `directAppIds` (apps explicitly attached to the dev
 * team in NDA). An app is included if it matches either side — matches
 * `getDevTeamAppsWithIssues` so that summary stats and issue lists agree.
 *
 * Optional `startDate` filters deployments to a date range (e.g. YTD).
 *
 * Optional `deployerUsernames` switches deployment-derived counts
 * (`total_deployments`, `with_four_eyes`, `without_four_eyes`,
 * `pending_verification`, `linked_to_goal`, and the `apps_with_issues`
 * derived from these) to person-scope: only deployments whose deployer or
 * PR creator matches one of the given GitHub usernames are counted.
 * `total_apps` and the alert-driven part of `apps_with_issues` remain
 * app-scope (apps and repository alerts aren't tied to a deployer).
 * Empty array ⇒ deployment counts are 0; `undefined` ⇒ no filter.
 */
export async function getDevTeamSummaryStats(
  naisTeamSlugs: string[],
  directAppIds?: number[],
  startDate?: Date,
  deployerUsernames?: string[],
): Promise<DevTeamSummaryStats> {
  const ids = directAppIds ?? []

  const hasDeployerFilter = deployerUsernames !== undefined
  const deployerFilterClause = hasDeployerFilter ? ` AND ${userDeploymentMatchAnySql(4, 'd')}` : ''
  const params: unknown[] = [naisTeamSlugs, ids, startDate ?? null]
  if (hasDeployerFilter) params.push(lowerUsernames(deployerUsernames))

  const result = await pool.query(
    `WITH team_apps AS (
       SELECT ma.id, ma.audit_start_year
       FROM monitored_applications ma
       WHERE ma.is_active = true
         AND (ma.team_slug = ANY($1::text[]) OR ma.id = ANY($2::int[]))
     ),
     app_stats AS (
       SELECT d.monitored_app_id,
              COUNT(d.id) AS total_deployments,
              COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${APPROVED_STATUSES_SQL})) AS with_four_eyes,
              COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${NOT_APPROVED_STATUSES_SQL})) AS without_four_eyes,
              COUNT(d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${PENDING_STATUSES_SQL})) AS pending_verification,
              COUNT(DISTINCT dgl.deployment_id) AS linked_to_goal
       FROM team_apps ta
       JOIN deployments d ON d.monitored_app_id = ta.id
         AND ($3::timestamptz IS NULL OR d.created_at >= $3)
         AND (ta.audit_start_year IS NULL OR d.created_at >= make_date(ta.audit_start_year, 1, 1))${deployerFilterClause}
       LEFT JOIN deployment_goal_links dgl ON dgl.deployment_id = d.id AND dgl.is_active = true
       GROUP BY d.monitored_app_id
     ),
     app_alerts AS (
       SELECT ra.monitored_app_id, COUNT(*) AS alert_count
       FROM team_apps ta
       JOIN repository_alerts ra ON ra.monitored_app_id = ta.id AND ra.resolved_at IS NULL
       GROUP BY ra.monitored_app_id
     )
     SELECT
       (SELECT COUNT(*) FROM team_apps)::int AS total_apps,
       COALESCE(SUM(s.total_deployments), 0)::int AS total_deployments,
       COALESCE(SUM(s.with_four_eyes), 0)::int AS with_four_eyes,
       COALESCE(SUM(s.without_four_eyes), 0)::int AS without_four_eyes,
       COALESCE(SUM(s.pending_verification), 0)::int AS pending_verification,
       COALESCE(SUM(s.linked_to_goal), 0)::int AS linked_to_goal,
       COUNT(*) FILTER (WHERE COALESCE(s.without_four_eyes, 0) > 0 OR COALESCE(s.pending_verification, 0) > 0 OR COALESCE(a.alert_count, 0) > 0 OR (COALESCE(s.total_deployments, 0) > 0 AND COALESCE(s.linked_to_goal, 0) < COALESCE(s.total_deployments, 0)))::int AS apps_with_issues
     FROM team_apps ta
     LEFT JOIN app_stats s ON s.monitored_app_id = ta.id
     LEFT JOIN app_alerts a ON a.monitored_app_id = ta.id`,
    params,
  )

  const row = result.rows[0]
  const total = row?.total_deployments ?? 0
  const withFourEyes = row?.with_four_eyes ?? 0
  const linkedToGoal = row?.linked_to_goal ?? 0

  return {
    total_apps: row?.total_apps ?? 0,
    total_deployments: total,
    with_four_eyes: withFourEyes,
    without_four_eyes: row?.without_four_eyes ?? 0,
    pending_verification: row?.pending_verification ?? 0,
    linked_to_goal: linkedToGoal,
    four_eyes_coverage: total > 0 ? withFourEyes / total : 0,
    goal_coverage: total > 0 ? linkedToGoal / total : 0,
    four_eyes_percentage: total > 0 ? Math.round((withFourEyes / total) * 100) : 0,
    goal_percentage: total > 0 ? Math.round((linkedToGoal / total) * 100) : 0,
    apps_with_issues: row?.apps_with_issues ?? 0,
  }
}

/**
 * Get objective progress for a board — how many deployments are linked to each objective/key result.
 *
 * When `deployerUsernames` is provided, only deployments made by those users
 * (deployer or PR creator) are counted. This keeps counts consistent with the
 * team-member-filtered stats shown on team pages and section pages.
 *
 * Implementation: 3 queries total (objectives, all KR-linked deployment
 * counts via ANY($1::int[]), all objective-linked deployment counts via
 * ANY($1::int[])) regardless of objective/key-result count.
 */
export async function getBoardObjectiveProgress(
  boardId: number,
  deployerUsernames?: string[],
  options?: { startDate?: Date },
): Promise<BoardProgressResult> {
  const objectivesResult = await pool.query(
    'SELECT id, title FROM board_objectives WHERE board_id = $1 AND is_active = true ORDER BY sort_order, id',
    [boardId],
  )
  const objectiveIds = objectivesResult.rows.map((o) => o.id as number)
  if (objectiveIds.length === 0) return { objectives: [], totalDistinctDeployments: 0 }

  const hasDeployerFilter = deployerUsernames !== undefined && deployerUsernames.length > 0
  // Always join deployments when we need deployer filter OR date filter
  const needsDeploymentJoin = hasDeployerFilter || options?.startDate
  const deployerJoin = needsDeploymentJoin ? ' JOIN deployments d ON d.id = dgl.deployment_id' : ''

  const baseParams: any[] = [objectiveIds]
  let paramIndex = 2
  let filterWhere = ''

  if (hasDeployerFilter) {
    filterWhere += ` AND ${userDeploymentMatchAnySql(paramIndex, 'd')}`
    baseParams.push(lowerUsernames(deployerUsernames))
    paramIndex++
  }
  if (options?.startDate) {
    filterWhere += ` AND d.created_at >= $${paramIndex}`
    baseParams.push(options.startDate)
    paramIndex++
  }

  const krResult = await pool.query(
    `SELECT bkr.id, bkr.objective_id, bkr.title, bkr.sort_order,
            COUNT(DISTINCT dgl.deployment_id) AS linked_deployments
     FROM board_key_results bkr
     LEFT JOIN deployment_goal_links dgl ON dgl.key_result_id = bkr.id AND dgl.is_active = true${deployerJoin}${filterWhere}
     WHERE bkr.objective_id = ANY($1::int[]) AND bkr.is_active = true
     GROUP BY bkr.id, bkr.objective_id, bkr.title, bkr.sort_order
     ORDER BY bkr.sort_order, bkr.id`,
    baseParams,
  )

  // Count distinct deployments linked to objectives directly
  const objLinksResult = await pool.query(
    `SELECT dgl.objective_id, COUNT(DISTINCT dgl.deployment_id) AS cnt
     FROM deployment_goal_links dgl${deployerJoin}
     WHERE dgl.objective_id = ANY($1::int[]) AND dgl.is_active = true${filterWhere}
     GROUP BY dgl.objective_id`,
    baseParams,
  )

  // Count distinct deployments linked via KRs per objective (avoids double-counting
  // when a deployment is linked to multiple KRs under the same objective)
  const krDistinctResult = await pool.query(
    `SELECT bkr.objective_id, COUNT(DISTINCT dgl.deployment_id) AS cnt
     FROM deployment_goal_links dgl
     JOIN board_key_results bkr ON bkr.id = dgl.key_result_id AND bkr.is_active = true${deployerJoin}
     WHERE bkr.objective_id = ANY($1::int[]) AND dgl.is_active = true${filterWhere}
     GROUP BY bkr.objective_id`,
    baseParams,
  )

  const krsByObjective = new Map<number, Array<{ id: number; title: string; linked_deployments: number }>>()
  for (const kr of krResult.rows) {
    const linked = Number(kr.linked_deployments)
    const list = krsByObjective.get(kr.objective_id) ?? []
    list.push({ id: kr.id, title: kr.title, linked_deployments: linked })
    krsByObjective.set(kr.objective_id, list)
  }

  const objLinksByObjective = new Map<number, number>()
  for (const row of objLinksResult.rows) {
    objLinksByObjective.set(row.objective_id as number, Number(row.cnt))
  }

  const krDistinctByObjective = new Map<number, number>()
  for (const row of krDistinctResult.rows) {
    krDistinctByObjective.set(row.objective_id as number, Number(row.cnt))
  }

  // Total distinct deployments linked to this board (across all objectives and KRs, no double-counting)
  const totalDistinctResult = await pool.query(
    `SELECT COUNT(DISTINCT dgl.deployment_id)::int AS cnt
     FROM deployment_goal_links dgl${deployerJoin}
     WHERE dgl.is_active = true${filterWhere}
       AND (dgl.objective_id = ANY($1::int[])
            OR dgl.key_result_id IN (
              SELECT bkr.id FROM board_key_results bkr
              WHERE bkr.objective_id = ANY($1::int[]) AND bkr.is_active = true
            ))`,
    baseParams,
  )
  const totalDistinctDeployments = Number(totalDistinctResult.rows[0]?.cnt ?? 0)

  return {
    objectives: objectivesResult.rows.map((obj) => ({
      objective_id: obj.id,
      objective_title: obj.title,
      key_results: krsByObjective.get(obj.id) ?? [],
      total_linked_deployments: (objLinksByObjective.get(obj.id) ?? 0) + (krDistinctByObjective.get(obj.id) ?? 0),
    })),
    totalDistinctDeployments,
  }
}

export interface DevTeamBatchStats {
  dev_team_id: number
  dev_team_name: string
  dev_team_slug: string
  total_deployments: number
  with_four_eyes: number
  without_four_eyes: number
  pending_verification: number
  linked_to_goal: number
  four_eyes_coverage: number
  goal_coverage: number
}

/**
 * Batch-compute per-team deployment stats with team-member deployer filtering.
 *
 * This is the single source of truth for team-level stats across all pages
 * (sections list, section detail, and team page). Stats are scoped to:
 * - Apps owned by the team (via nais team slugs OR direct app links)
 * - Deployments made by team members (deployer_username or PR creator)
 * - Date range (typically YTD)
 *
 * Returns a Map keyed by dev_team_id. Teams with no mapped members show 0 deployments.
 */
export async function getDevTeamStatsBatch(
  devTeamIds: number[],
  startDate: Date,
  endDate?: Date,
): Promise<Map<number, DevTeamBatchStats>> {
  if (devTeamIds.length === 0) return new Map()

  const result = await pool.query<{
    dev_team_id: number
    dev_team_name: string
    dev_team_slug: string
    total_deployments: number
    with_four_eyes: number
    without_four_eyes: number
    pending_verification: number
    linked_to_goal: number
  }>(
    `WITH team_members AS (
       SELECT p.dev_team_id, LOWER(um.github_username) AS github_username
       FROM user_dev_team_preference p
       JOIN user_mappings um
         ON UPPER(um.nav_ident) = UPPER(p.nav_ident) AND um.deleted_at IS NULL
       WHERE p.dev_team_id = ANY($1::int[])
         AND um.github_username IS NOT NULL
     ),
     team_apps AS (
       SELECT dt.id AS dev_team_id, dt.name AS dev_team_name, dt.slug AS dev_team_slug,
              ma.id AS app_id, ma.audit_start_year
       FROM dev_teams dt
       LEFT JOIN dev_team_nais_teams dtn ON dtn.dev_team_id = dt.id AND dtn.deleted_at IS NULL
       LEFT JOIN dev_team_applications dta ON dta.dev_team_id = dt.id AND dta.deleted_at IS NULL
       JOIN monitored_applications ma ON ma.is_active = true
         AND (ma.team_slug = dtn.nais_team_slug OR ma.id = dta.monitored_app_id)
       WHERE dt.id = ANY($1::int[]) AND dt.is_active = true
       GROUP BY dt.id, dt.name, dt.slug, ma.id, ma.audit_start_year
     ),
     deployment_stats AS (
       SELECT ta.dev_team_id,
              COUNT(DISTINCT d.id)::int AS total_deployments,
              COUNT(DISTINCT d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${APPROVED_STATUSES_SQL}))::int AS with_four_eyes,
              COUNT(DISTINCT d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${NOT_APPROVED_STATUSES_SQL}))::int AS without_four_eyes,
              COUNT(DISTINCT d.id) FILTER (WHERE COALESCE(d.four_eyes_status, 'unknown') IN (${PENDING_STATUSES_SQL}))::int AS pending_verification,
              COUNT(DISTINCT dgl.deployment_id)::int AS linked_to_goal
       FROM team_apps ta
       JOIN team_members tm ON tm.dev_team_id = ta.dev_team_id
       JOIN deployments d ON d.monitored_app_id = ta.app_id
         AND d.created_at >= $2
         AND ($3::timestamptz IS NULL OR d.created_at < $3)
         AND (ta.audit_start_year IS NULL OR d.created_at >= make_date(ta.audit_start_year, 1, 1))
         AND (LOWER(d.deployer_username) = tm.github_username
              OR LOWER(d.github_pr_data->'creator'->>'username') = tm.github_username)
       LEFT JOIN deployment_goal_links dgl ON dgl.deployment_id = d.id AND dgl.is_active = true
       GROUP BY ta.dev_team_id
     )
     SELECT ta_distinct.dev_team_id, ta_distinct.dev_team_name, ta_distinct.dev_team_slug,
            COALESCE(ds.total_deployments, 0)::int AS total_deployments,
            COALESCE(ds.with_four_eyes, 0)::int AS with_four_eyes,
            COALESCE(ds.without_four_eyes, 0)::int AS without_four_eyes,
            COALESCE(ds.pending_verification, 0)::int AS pending_verification,
            COALESCE(ds.linked_to_goal, 0)::int AS linked_to_goal
     FROM (SELECT DISTINCT dev_team_id, dev_team_name, dev_team_slug FROM team_apps
           UNION
           SELECT dt.id, dt.name, dt.slug FROM dev_teams dt WHERE dt.id = ANY($1::int[]) AND dt.is_active = true
     ) ta_distinct
     LEFT JOIN deployment_stats ds ON ds.dev_team_id = ta_distinct.dev_team_id
     ORDER BY ta_distinct.dev_team_name`,
    [devTeamIds, startDate, endDate ?? null],
  )

  const map = new Map<number, DevTeamBatchStats>()
  for (const row of result.rows) {
    const total = row.total_deployments
    const withFourEyes = row.with_four_eyes
    const linked = row.linked_to_goal
    map.set(row.dev_team_id, {
      ...row,
      four_eyes_coverage: total > 0 ? withFourEyes / total : 0,
      goal_coverage: total > 0 ? linked / total : 0,
    })
  }
  return map
}
