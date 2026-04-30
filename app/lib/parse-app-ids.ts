/** Parse and validate form data app IDs. Returns deduplicated positive integers, or null if any value is invalid. */
export function parseAppIds(values: FormDataEntryValue[]): number[] | null {
  const ids: number[] = []
  for (const value of values) {
    if (typeof value !== 'string') return null
    const n = Number(value)
    if (!Number.isInteger(n) || n <= 0) return null
    ids.push(n)
  }
  return [...new Set(ids)]
}
