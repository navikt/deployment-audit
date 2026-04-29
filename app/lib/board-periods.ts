/**
 * Board period helpers — compute tertial/quarterly start/end dates and labels.
 */

export type BoardPeriodType = 'tertiary' | 'quarterly'

interface BoardPeriod {
  type: BoardPeriodType
  label: string
  start: string // ISO date (YYYY-MM-DD)
  end: string // ISO date (YYYY-MM-DD)
}

function getTertial(month: number): 1 | 2 | 3 {
  if (month < 4) return 1
  if (month < 8) return 2
  return 3
}

function getQuarter(month: number): 1 | 2 | 3 | 4 {
  if (month < 3) return 1
  if (month < 6) return 2
  if (month < 9) return 3
  return 4
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getCurrentPeriod(type: BoardPeriodType, date = new Date()): BoardPeriod {
  const year = date.getFullYear()
  const month = date.getMonth()

  if (type === 'tertiary') {
    const t = getTertial(month)
    const startMonth = (t - 1) * 4
    const endMonth = startMonth + 3
    return {
      type,
      label: `T${t} ${year}`,
      start: `${year}-${String(startMonth + 1).padStart(2, '0')}-01`,
      end: formatLocalDate(new Date(year, endMonth + 1, 0)),
    }
  }

  const q = getQuarter(month)
  const startMonth = (q - 1) * 3
  const endMonth = startMonth + 2
  return {
    type,
    label: `Q${q} ${year}`,
    start: `${year}-${String(startMonth + 1).padStart(2, '0')}-01`,
    end: formatLocalDate(new Date(year, endMonth + 1, 0)),
  }
}

/**
 * Format a board's display label as `{teamName} - {periodLabel}`.
 * Brukes alle steder hvor en måltavle vises i UI, slik at vi har én sannhet for visningsnavnet.
 */
export function formatBoardLabel(input: { teamName: string; periodLabel: string }): string {
  const teamName = input.teamName.trim()
  const periodLabel = input.periodLabel.trim()
  if (!teamName) return periodLabel
  if (!periodLabel) return teamName
  return `${teamName} - ${periodLabel}`
}

/** Get a list of periods for the given year and type. */
export function getPeriodsForYear(type: BoardPeriodType, year: number): BoardPeriod[] {
  const count = type === 'tertiary' ? 3 : 4
  return Array.from({ length: count }, (_, i) => {
    const month = type === 'tertiary' ? i * 4 : i * 3
    return getCurrentPeriod(type, new Date(year, month, 15))
  })
}

/**
 * Compute period start/end dates from a board's `period_type` and `period_label`.
 * This is the authoritative way to derive dates — no stored dates needed.
 *
 * Supports labels like "T1 2026", "T2 2026", "Q3 2025", etc.
 */
export function computePeriodDates(periodType: BoardPeriodType, periodLabel: string): { start: string; end: string } {
  const trimmedLabel = periodLabel.trim()
  const match = trimmedLabel.match(/^([TQ])(\d)\s+(\d{4})$/)
  if (!match) {
    throw new Error(`Invalid period label: "${periodLabel}"`)
  }

  const labelPrefix = match[1]
  const expectedPrefix = periodType === 'tertiary' ? 'T' : 'Q'
  if (labelPrefix !== expectedPrefix) {
    throw new Error(`Period label "${trimmedLabel}" does not match period type "${periodType}"`)
  }

  const periodNumber = Number.parseInt(match[2], 10)
  const year = Number.parseInt(match[3], 10)

  if (periodType === 'tertiary') {
    if (periodNumber < 1 || periodNumber > 3) throw new Error(`Invalid tertial number: ${periodNumber}`)
    const startMonth = (periodNumber - 1) * 4
    const endMonth = startMonth + 3
    return {
      start: `${year}-${String(startMonth + 1).padStart(2, '0')}-01`,
      end: formatLocalDate(new Date(year, endMonth + 1, 0)),
    }
  }

  if (periodNumber < 1 || periodNumber > 4) throw new Error(`Invalid quarter number: ${periodNumber}`)
  const startMonth = (periodNumber - 1) * 3
  const endMonth = startMonth + 2
  return {
    start: `${year}-${String(startMonth + 1).padStart(2, '0')}-01`,
    end: formatLocalDate(new Date(year, endMonth + 1, 0)),
  }
}
