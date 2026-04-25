import { APPROVED_STATUSES_SQL } from '~/lib/four-eyes-status'
import { pool } from './connection.server'

export interface SectionOverallStats {
  total_deployments: number
  with_four_eyes: number
  without_four_eyes: number
  pending_verification: number
  linked_to_goal: number
  four_eyes_coverage: number
  goal_coverage: number
}

export interface DevTeamDashboardStats {
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
       COUNT(d.id) FILTER (WHERE d.four_eyes_status IN (${APPROVED_STATUSES_SQL}))::int AS with_four_eyes,
       COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('direct_push', 'unverified_commits', 'approved_pr_with_unreviewed', 'unauthorized_repository', 'unauthorized_branch'))::int AS without_four_eyes,
       COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('pending', 'pending_baseline', 'pending_approval', 'unknown'))::int AS pending_verification,
       COUNT(DISTINCT dgl.deployment_id)::int AS linked_to_goal
     FROM section_teams st
     JOIN deployments d ON d.team_slug = st.team_slug
       AND ($2::timestamptz IS NULL OR d.created_at >= $2)
       AND ($3::timestamptz IS NULL OR d.created_at < $3)
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
              COUNT(d.id) FILTER (WHERE d.four_eyes_status IN (${APPROVED_STATUSES_SQL})) AS with_four_eyes,
              COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('direct_push', 'unverified_commits', 'approved_pr_with_unreviewed', 'unauthorized_repository', 'unauthorized_branch')) AS without_four_eyes,
              COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('pending', 'pending_baseline', 'pending_approval', 'unknown')) AS pending_verification,
              COUNT(DISTINCT dgl.deployment_id) AS linked_to_goal
       FROM team_apps ta
       LEFT JOIN deployments d ON (
         d.team_slug = ANY(ta.nais_team_slugs)
         OR d.monitored_app_id = ANY(COALESCE(ta.direct_app_ids, '{}'::int[]))
       ) AND ($2::timestamptz IS NULL OR d.created_at >= $2)
         AND ($3::timestamptz IS NULL OR d.created_at < $3)
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
 */
export async function getDevTeamSummaryStats(
  naisTeamSlugs: string[],
  directAppIds?: number[],
  startDate?: Date,
): Promise<DevTeamSummaryStats> {
  const ids = directAppIds ?? []

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
              COUNT(d.id) FILTER (WHERE d.four_eyes_status IN (${APPROVED_STATUSES_SQL})) AS with_four_eyes,
              COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('direct_push', 'unverified_commits', 'approved_pr_with_unreviewed', 'unauthorized_repository', 'unauthorized_branch')) AS without_four_eyes,
              COUNT(d.id) FILTER (WHERE d.four_eyes_status IN ('pending', 'pending_baseline', 'pending_approval', 'unknown')) AS pending_verification,
              COUNT(DISTINCT dgl.deployment_id) AS linked_to_goal
       FROM team_apps ta
       JOIN deployments d ON d.monitored_app_id = ta.id
         AND ($3::timestamptz IS NULL OR d.created_at >= $3)
         AND ($3::timestamptz IS NOT NULL OR ta.audit_start_year IS NULL OR d.created_at >= make_date(ta.audit_start_year, 1, 1))
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
    [naisTeamSlugs, ids, startDate ?? null],
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
 */
export async function getBoardObjectiveProgress(boardId: number): Promise<BoardObjectiveProgress[]> {
  const objectives = await pool.query(
    'SELECT id, title FROM board_objectives WHERE board_id = $1 AND is_active = true ORDER BY sort_order, id',
    [boardId],
  )

  const result: BoardObjectiveProgress[] = []

  for (const obj of objectives.rows) {
    const krResult = await pool.query(
      `SELECT bkr.id, bkr.title,
              COUNT(DISTINCT dgl.deployment_id) AS linked_deployments
       FROM board_key_results bkr
       LEFT JOIN deployment_goal_links dgl ON dgl.key_result_id = bkr.id AND dgl.is_active = true
       WHERE bkr.objective_id = $1 AND bkr.is_active = true
       GROUP BY bkr.id, bkr.title
       ORDER BY bkr.sort_order, bkr.id`,
      [obj.id],
    )

    const objLinks = await pool.query(
      'SELECT COUNT(DISTINCT deployment_id) AS cnt FROM deployment_goal_links WHERE objective_id = $1 AND is_active = true',
      [obj.id],
    )

    const krLinkedTotal = krResult.rows.reduce(
      (sum: number, kr: { linked_deployments: string }) => sum + Number(kr.linked_deployments),
      0,
    )

    result.push({
      objective_id: obj.id,
      objective_title: obj.title,
      key_results: krResult.rows.map((kr) => ({
        id: kr.id,
        title: kr.title,
        linked_deployments: Number(kr.linked_deployments),
      })),
      total_linked_deployments: Number(objLinks.rows[0]?.cnt ?? 0) + krLinkedTotal,
    })
  }

  return result
}
