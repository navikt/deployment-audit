/**
 * Small pure helpers for route loaders/actions.
 */

/**
 * Parse a positive-integer ID from form data. Returns null for missing,
 * non-numeric, non-integer, or non-positive values. Avoids the
 * `Number(null) === 0` pitfall that would otherwise let a missing field
 * fall through to a misleading "row not found"-style error.
 */
export function parseId(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null
  const str = String(raw).trim()
  if (str === '') return null
  const n = Number(str)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

/**
 * Returns true only for absolute http/https URLs. Anything else
 * (javascript:, data:, vbscript:, relative paths, malformed strings, etc.)
 * returns false. Use this to gate user-provided URLs that will be rendered
 * into an `<a href>` so a stored javascript: payload cannot execute when an
 * admin (or any other user) clicks the link.
 */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
