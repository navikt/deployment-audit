/**
 * Sets a Date to the end of the day (23:59:59.999).
 * Useful when comparing a timestamp against a date-only period boundary.
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}
