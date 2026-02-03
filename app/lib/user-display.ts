/**
 * User display utilities for consistent username-to-display-name mapping
 */

export type UserMappingRecord = {
  display_name: string | null
  nav_ident?: string | null
  nav_email?: string | null
}

export type UserMappings = Record<string, UserMappingRecord>

/**
 * Get display name for a GitHub username, falling back to the username if no mapping exists.
 *
 * @param githubUsername - The GitHub username to look up
 * @param userMappings - Record of username -> mapping data
 * @returns Display name, nav_email, or the original username as fallback
 */
export function getUserDisplayName(
  githubUsername: string | undefined | null,
  userMappings: UserMappings,
): string | null {
  if (!githubUsername) return null
  const mapping = userMappings[githubUsername]
  return mapping?.display_name || mapping?.nav_email || githubUsername
}

/**
 * Serialize a Map of user mappings to a plain object for client-side use.
 *
 * @param mappings - Map from getUserMappings()
 * @returns Plain object suitable for JSON serialization
 */
export function serializeUserMappings(
  mappings: Map<string, { display_name: string | null; nav_ident: string | null; nav_email?: string | null }>,
): UserMappings {
  const result: UserMappings = {}
  for (const [username, mapping] of mappings) {
    result[username] = {
      display_name: mapping.display_name,
      nav_ident: mapping.nav_ident,
      nav_email: mapping.nav_email,
    }
  }
  return result
}
