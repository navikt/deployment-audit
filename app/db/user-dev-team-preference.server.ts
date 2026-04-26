import { pool } from './connection.server'
import type { DevTeamWithNaisTeams } from './dev-teams.server'

/**
 * Get all dev teams the user is connected to (with nais_team_slugs).
 */
export async function getUserDevTeams(navIdent: string): Promise<DevTeamWithNaisTeams[]> {
  const result = await pool.query(
    `SELECT dt.*, s.slug as section_slug,
       COALESCE(array_agg(dn.nais_team_slug ORDER BY dn.nais_team_slug) FILTER (WHERE dn.nais_team_slug IS NOT NULL), '{}') as nais_team_slugs
     FROM user_dev_team_preference p
     JOIN dev_teams dt ON dt.id = p.dev_team_id
     LEFT JOIN sections s ON s.id = dt.section_id
     LEFT JOIN dev_team_nais_teams dn ON dn.dev_team_id = dt.id AND dn.deleted_at IS NULL
     WHERE p.nav_ident = $1 AND dt.is_active = true
     GROUP BY dt.id, s.slug
     ORDER BY dt.name`,
    [navIdent],
  )
  return result.rows
}

/**
 * Get dev team IDs for all users (for admin listing).
 * Returns a map of nav_ident → array of dev_team_id.
 */
export async function getAllUserDevTeamMappings(): Promise<Map<string, number[]>> {
  const result = await pool.query(
    `SELECT p.nav_ident, array_agg(p.dev_team_id ORDER BY dt.name) as dev_team_ids
     FROM user_dev_team_preference p
     JOIN dev_teams dt ON dt.id = p.dev_team_id AND dt.is_active = true
     GROUP BY p.nav_ident`,
  )
  const map = new Map<string, number[]>()
  for (const row of result.rows) {
    map.set(row.nav_ident, row.dev_team_ids)
  }
  return map
}

/**
 * Set the dev teams for a user (replaces all existing).
 */
export async function setUserDevTeams(navIdent: string, devTeamIds: number[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM user_dev_team_preference WHERE nav_ident = $1', [navIdent])
    for (const id of devTeamIds) {
      await client.query(
        'INSERT INTO user_dev_team_preference (nav_ident, dev_team_id, updated_at) VALUES ($1, $2, NOW())',
        [navIdent, id],
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

/**
 * Add a dev team to the user's team list.
 */
export async function addUserDevTeam(navIdent: string, devTeamId: number): Promise<void> {
  await pool.query(
    `INSERT INTO user_dev_team_preference (nav_ident, dev_team_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (nav_ident, dev_team_id) DO NOTHING`,
    [navIdent, devTeamId],
  )
}

/**
 * Remove a dev team from the user's team list.
 */
export async function removeUserDevTeam(navIdent: string, devTeamId: number): Promise<void> {
  await pool.query('DELETE FROM user_dev_team_preference WHERE nav_ident = $1 AND dev_team_id = $2', [
    navIdent,
    devTeamId,
  ])
}

export interface DevTeamMember {
  nav_ident: string
  github_username: string | null
  display_name: string | null
}

/**
 * Get all members of a dev team (users who have selected this team).
 */
export async function getDevTeamMembers(devTeamId: number): Promise<DevTeamMember[]> {
  const result = await pool.query(
    `SELECT p.nav_ident, um.github_username, um.display_name
     FROM user_dev_team_preference p
     LEFT JOIN user_mappings um
       ON UPPER(um.nav_ident) = UPPER(p.nav_ident) AND um.deleted_at IS NULL
     WHERE p.dev_team_id = $1
     ORDER BY COALESCE(um.display_name, p.nav_ident)`,
    [devTeamId],
  )
  return result.rows
}

/**
 * Get the unique GitHub usernames of all members across the given dev teams.
 * Used to filter deployments to "delivered by team members" in the deployments
 * list view.
 *
 * GitHub usernames are returned exactly as stored in `user_mappings`. The
 * deployer-side comparison (`deployer_username`) is also case-preserved, so
 * an exact `=` match works the way the existing "Meg" filter on the same
 * page does.
 *
 * Returns an empty array if no dev teams are given, or if none of the members
 * have a github_username mapping. Callers must distinguish the two cases —
 * an empty result with non-empty input means "team has no GitHub-mapped
 * members; show 0 deployments".
 */
export async function getMembersGithubUsernamesForDevTeams(devTeamIds: number[]): Promise<string[]> {
  if (devTeamIds.length === 0) return []
  const result = await pool.query(
    `SELECT DISTINCT um.github_username
     FROM user_dev_team_preference p
     JOIN user_mappings um
       ON UPPER(um.nav_ident) = UPPER(p.nav_ident) AND um.deleted_at IS NULL
     WHERE p.dev_team_id = ANY($1)
       AND um.github_username IS NOT NULL`,
    [devTeamIds],
  )
  return result.rows.map((r) => r.github_username as string)
}
