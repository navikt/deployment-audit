/**
 * Parse GitHub owner/repo from various repository string formats.
 * Consolidates the two different parsing approaches used in sync code.
 */
export function parseRepository(repository: string | null | undefined): { owner: string; repo: string } | null {
  if (!repository) return null

  // Try full GitHub URL first (e.g., "https://github.com/navikt/pensjon-pen")
  const urlMatch = repository.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] }
  }

  // Try owner/repo format (e.g., "navikt/pensjon-pen")
  if (repository.includes('/')) {
    const parts = repository.split('/')
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] }
    }
  }

  return null
}
