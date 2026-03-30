import { pool } from './connection.server'
import type { DevTeamWithNaisTeams } from './dev-teams.server'

/**
 * Get the user's selected dev team (with nais_team_slugs).
 */
export async function getUserDevTeam(navIdent: string): Promise<DevTeamWithNaisTeams | null> {
  const result = await pool.query(
    `SELECT dt.*,
       COALESCE(array_agg(dn.nais_team_slug ORDER BY dn.nais_team_slug) FILTER (WHERE dn.nais_team_slug IS NOT NULL), '{}') as nais_team_slugs
     FROM user_dev_team_preference p
     JOIN dev_teams dt ON dt.id = p.dev_team_id
     LEFT JOIN dev_team_nais_teams dn ON dn.dev_team_id = dt.id
     WHERE p.nav_ident = $1 AND dt.is_active = true
     GROUP BY dt.id`,
    [navIdent],
  )
  return result.rows[0] ?? null
}

/**
 * Set the user's active dev team (insert or update).
 */
export async function setUserDevTeam(navIdent: string, devTeamId: number): Promise<void> {
  await pool.query(
    `INSERT INTO user_dev_team_preference (nav_ident, dev_team_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (nav_ident) DO UPDATE SET dev_team_id = $2, updated_at = NOW()`,
    [navIdent, devTeamId],
  )
}
