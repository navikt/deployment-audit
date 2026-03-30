import { pool } from './connection.server'
import type { DevTeamWithNaisTeams } from './dev-teams.server'

/**
 * Get all dev teams the user is connected to (with nais_team_slugs).
 */
export async function getUserDevTeams(navIdent: string): Promise<DevTeamWithNaisTeams[]> {
  const result = await pool.query(
    `SELECT dt.*,
       COALESCE(array_agg(dn.nais_team_slug ORDER BY dn.nais_team_slug) FILTER (WHERE dn.nais_team_slug IS NOT NULL), '{}') as nais_team_slugs
     FROM user_dev_team_preference p
     JOIN dev_teams dt ON dt.id = p.dev_team_id
     LEFT JOIN dev_team_nais_teams dn ON dn.dev_team_id = dt.id
     WHERE p.nav_ident = $1 AND dt.is_active = true
     GROUP BY dt.id
     ORDER BY dt.name`,
    [navIdent],
  )
  return result.rows
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
