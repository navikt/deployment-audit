import { pool } from './connection.server'

/**
 * Advisory-lock namespace (first key for pg_advisory_xact_lock(int4, int4)).
 * Arbitrary stable integer that scopes the per-team lock to this table's
 * write path so it cannot collide with future advisory-lock callers.
 */
const DEV_TEAM_APPLICATIONS_LOCK_NAMESPACE = 1772400000

export interface DevTeam {
  id: number
  section_id: number
  slug: string
  name: string
  is_active: boolean
  created_at: Date
}

export interface DevTeamWithNaisTeams extends DevTeam {
  nais_team_slugs: string[]
  section_slug?: string
}

export interface DevTeamApplication {
  monitored_app_id: number
  team_slug: string
  environment_name: string
  app_name: string
}

export async function getAllDevTeams(): Promise<DevTeamWithNaisTeams[]> {
  const result = await pool.query(
    `SELECT dt.*, s.slug as section_slug,
       COALESCE(array_agg(dn.nais_team_slug ORDER BY dn.nais_team_slug) FILTER (WHERE dn.nais_team_slug IS NOT NULL), '{}') as nais_team_slugs
     FROM dev_teams dt
     JOIN sections s ON s.id = dt.section_id
     LEFT JOIN dev_team_nais_teams dn ON dn.dev_team_id = dt.id
     WHERE dt.is_active = true
     GROUP BY dt.id, s.slug
     ORDER BY dt.name`,
  )
  return result.rows
}

export async function getDevTeamsBySection(sectionId: number): Promise<DevTeamWithNaisTeams[]> {
  const result = await pool.query(
    `SELECT dt.*, s.slug as section_slug,
       COALESCE(array_agg(dn.nais_team_slug ORDER BY dn.nais_team_slug) FILTER (WHERE dn.nais_team_slug IS NOT NULL), '{}') as nais_team_slugs
     FROM dev_teams dt
     LEFT JOIN sections s ON s.id = dt.section_id
     LEFT JOIN dev_team_nais_teams dn ON dn.dev_team_id = dt.id
     WHERE dt.section_id = $1 AND dt.is_active = true
     GROUP BY dt.id, s.slug
     ORDER BY dt.name`,
    [sectionId],
  )
  return result.rows
}

export async function getDevTeamBySlug(slug: string): Promise<DevTeamWithNaisTeams | null> {
  const result = await pool.query(
    `SELECT dt.*, s.slug as section_slug,
       COALESCE(array_agg(dn.nais_team_slug ORDER BY dn.nais_team_slug) FILTER (WHERE dn.nais_team_slug IS NOT NULL), '{}') as nais_team_slugs
     FROM dev_teams dt
     JOIN sections s ON s.id = dt.section_id
     LEFT JOIN dev_team_nais_teams dn ON dn.dev_team_id = dt.id
     WHERE dt.slug = $1
     GROUP BY dt.id, s.slug`,
    [slug],
  )
  return result.rows[0] ?? null
}

async function getDevTeamById(id: number): Promise<DevTeamWithNaisTeams | null> {
  const result = await pool.query(
    `SELECT dt.*,
       COALESCE(array_agg(dn.nais_team_slug ORDER BY dn.nais_team_slug) FILTER (WHERE dn.nais_team_slug IS NOT NULL), '{}') as nais_team_slugs
     FROM dev_teams dt
     LEFT JOIN dev_team_nais_teams dn ON dn.dev_team_id = dt.id
     WHERE dt.id = $1
     GROUP BY dt.id`,
    [id],
  )
  return result.rows[0] ?? null
}

/** Find the dev team that a Nais team belongs to */
async function _getDevTeamForNaisTeam(naisTeamSlug: string): Promise<DevTeam | null> {
  const result = await pool.query(
    `SELECT dt.* FROM dev_teams dt
     JOIN dev_team_nais_teams dn ON dn.dev_team_id = dt.id
     WHERE dn.nais_team_slug = $1 AND dt.is_active = true`,
    [naisTeamSlug],
  )
  return result.rows[0] ?? null
}

/** Find all dev teams for a monitored app (via direct app link and nais team) */
export async function getDevTeamsForApp(
  monitoredAppId: number,
  teamSlug: string,
): Promise<(DevTeam & { section_slug: string })[]> {
  const result = await pool.query(
    `SELECT DISTINCT dt.*, s.slug AS section_slug FROM dev_teams dt
     JOIN sections s ON s.id = dt.section_id
     LEFT JOIN dev_team_applications dta
       ON dta.dev_team_id = dt.id AND dta.monitored_app_id = $1 AND dta.deleted_at IS NULL
     LEFT JOIN dev_team_nais_teams dnt ON dnt.dev_team_id = dt.id AND dnt.nais_team_slug = $2
     WHERE dt.is_active = true AND (dta.monitored_app_id IS NOT NULL OR dnt.nais_team_slug IS NOT NULL)
     ORDER BY dt.name`,
    [monitoredAppId, teamSlug],
  )
  return result.rows
}

export async function createDevTeam(sectionId: number, slug: string, name: string): Promise<DevTeam> {
  const result = await pool.query('INSERT INTO dev_teams (section_id, slug, name) VALUES ($1, $2, $3) RETURNING *', [
    sectionId,
    slug,
    name,
  ])
  return result.rows[0]
}

export async function updateDevTeam(id: number, data: { name?: string; is_active?: boolean }): Promise<DevTeam | null> {
  const sets: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (data.name !== undefined) {
    sets.push(`name = $${idx++}`)
    values.push(data.name)
  }
  if (data.is_active !== undefined) {
    sets.push(`is_active = $${idx++}`)
    values.push(data.is_active)
  }

  if (sets.length === 0) return getDevTeamById(id)

  values.push(id)
  const result = await pool.query(`UPDATE dev_teams SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, values)
  return result.rows[0] ?? null
}

export async function setDevTeamNaisTeams(devTeamId: number, naisTeamSlugs: string[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM dev_team_nais_teams WHERE dev_team_id = $1', [devTeamId])
    for (const slug of naisTeamSlugs) {
      await client.query('INSERT INTO dev_team_nais_teams (dev_team_id, nais_team_slug) VALUES ($1, $2)', [
        devTeamId,
        slug,
      ])
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** Get all applications directly linked to a dev team (active links only) */
export async function getDevTeamApplications(devTeamId: number): Promise<DevTeamApplication[]> {
  const result = await pool.query(
    `SELECT ma.id AS monitored_app_id, ma.team_slug, ma.environment_name, ma.app_name
     FROM dev_team_applications dta
     JOIN monitored_applications ma ON ma.id = dta.monitored_app_id
     WHERE dta.dev_team_id = $1 AND dta.deleted_at IS NULL
     ORDER BY ma.team_slug, ma.environment_name, ma.app_name`,
    [devTeamId],
  )
  return result.rows
}

/**
 * Set the full list of directly linked applications for a dev team.
 *
 * Soft-deletes any existing active link not in `monitoredAppIds` (recording
 * `deletedBy`), and undeletes / inserts the requested links in a single
 * transaction. Existing active links present in the new set are left
 * untouched to avoid unnecessary row-version churn and preserve the
 * existing row.
 */
export async function setDevTeamApplications(
  devTeamId: number,
  monitoredAppIds: number[],
  deletedBy: string,
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Serialize concurrent replace-all writes for the same dev team to avoid
    // deadlocks (parallel UPDATE+UPSERT lock orderings) and lost updates
    // (two transactions each soft-deleting the other's set, then both
    // inserting their own → union of both sets active).
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [DEV_TEAM_APPLICATIONS_LOCK_NAMESPACE, devTeamId])

    // Soft-delete active links no longer present in the new set.
    await client.query(
      `UPDATE dev_team_applications
       SET deleted_at = NOW(), deleted_by = $2
       WHERE dev_team_id = $1
         AND deleted_at IS NULL
         AND NOT (monitored_app_id = ANY($3::int[]))`,
      [devTeamId, deletedBy, monitoredAppIds],
    )

    // Insert / undelete each requested link. The WHERE guard on the
    // DO UPDATE branch prevents already-active rows from being rewritten,
    // so unchanged links produce no row version churn.
    for (const appId of monitoredAppIds) {
      await client.query(
        `INSERT INTO dev_team_applications (dev_team_id, monitored_app_id)
         VALUES ($1, $2)
         ON CONFLICT (dev_team_id, monitored_app_id)
         DO UPDATE SET deleted_at = NULL, deleted_by = NULL
         WHERE dev_team_applications.deleted_at IS NOT NULL`,
        [devTeamId, appId],
      )
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** Add a single application link to a dev team (idempotent; undeletes a soft-deleted link) */
export async function addAppToDevTeam(devTeamId: number, monitoredAppId: number): Promise<void> {
  await pool.query(
    `INSERT INTO dev_team_applications (dev_team_id, monitored_app_id)
     VALUES ($1, $2)
     ON CONFLICT (dev_team_id, monitored_app_id)
     DO UPDATE SET deleted_at = NULL, deleted_by = NULL
     WHERE dev_team_applications.deleted_at IS NOT NULL`,
    [devTeamId, monitoredAppId],
  )
}

/** Get all active apps with their link status for a dev team (soft-deleted links count as not linked) */
export async function getAvailableAppsForDevTeam(
  devTeamId: number,
): Promise<{ id: number; team_slug: string; environment_name: string; app_name: string; is_linked: boolean }[]> {
  const result = await pool.query(
    `SELECT ma.id, ma.team_slug, ma.environment_name, ma.app_name,
            (dta.dev_team_id IS NOT NULL) AS is_linked
     FROM monitored_applications ma
     LEFT JOIN dev_team_applications dta
       ON dta.monitored_app_id = ma.id AND dta.dev_team_id = $1 AND dta.deleted_at IS NULL
     WHERE ma.is_active = true
     ORDER BY ma.team_slug, ma.environment_name, ma.app_name`,
    [devTeamId],
  )
  return result.rows
}
