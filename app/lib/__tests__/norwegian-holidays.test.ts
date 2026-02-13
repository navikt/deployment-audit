import { describe, expect, it } from 'vitest'
import { getPublicHolidays, getWeekdayKey, isBusinessDay, isPublicHoliday } from '../norwegian-holidays'

describe('norwegian-holidays', () => {
  describe('getPublicHolidays', () => {
    it('returns fixed holidays for 2026', () => {
      const holidays = getPublicHolidays(2026)
      expect(holidays.get('2026-01-01')).toBe('Første nyttårsdag')
      expect(holidays.get('2026-05-01')).toBe('Arbeidernes dag')
      expect(holidays.get('2026-05-17')).toBe('Grunnlovsdagen')
      expect(holidays.get('2026-12-25')).toBe('Første juledag')
      expect(holidays.get('2026-12-26')).toBe('Andre juledag')
    })

    it('computes correct Easter-based holidays for 2025 (Easter April 20)', () => {
      const holidays = getPublicHolidays(2025)
      expect(holidays.get('2025-04-17')).toBe('Skjærtorsdag')
      expect(holidays.get('2025-04-18')).toBe('Langfredag')
      expect(holidays.get('2025-04-20')).toBe('Første påskedag')
      expect(holidays.get('2025-04-21')).toBe('Andre påskedag')
      expect(holidays.get('2025-05-29')).toBe('Kristi himmelfartsdag')
      expect(holidays.get('2025-06-09')).toBe('Andre pinsedag')
    })

    it('computes correct Easter-based holidays for 2026 (Easter April 5)', () => {
      const holidays = getPublicHolidays(2026)
      expect(holidays.get('2026-04-02')).toBe('Skjærtorsdag')
      expect(holidays.get('2026-04-03')).toBe('Langfredag')
      expect(holidays.get('2026-04-05')).toBe('Første påskedag')
      expect(holidays.get('2026-04-06')).toBe('Andre påskedag')
      expect(holidays.get('2026-05-14')).toBe('Kristi himmelfartsdag')
      expect(holidays.get('2026-05-25')).toBe('Andre pinsedag')
    })

    it('computes correct Easter-based holidays for 2024 (Easter March 31)', () => {
      const holidays = getPublicHolidays(2024)
      expect(holidays.get('2024-03-28')).toBe('Skjærtorsdag')
      expect(holidays.get('2024-03-29')).toBe('Langfredag')
      expect(holidays.get('2024-03-31')).toBe('Første påskedag')
      expect(holidays.get('2024-04-01')).toBe('Andre påskedag')
    })

    it('includes Første pinsedag', () => {
      const holidays = getPublicHolidays(2026)
      expect(holidays.get('2026-05-24')).toBe('Første pinsedag')
    })
  })

  describe('isPublicHoliday', () => {
    it('returns true for Saturdays', () => {
      // 2026-02-14 is a Saturday
      expect(isPublicHoliday(new Date(2026, 1, 14))).toBe(true)
    })

    it('returns true for Sundays', () => {
      // 2026-02-15 is a Sunday
      expect(isPublicHoliday(new Date(2026, 1, 15))).toBe(true)
    })

    it('returns true for fixed holidays', () => {
      expect(isPublicHoliday(new Date(2026, 4, 17))).toBe(true) // 17. mai
    })

    it('returns true for movable holidays', () => {
      expect(isPublicHoliday(new Date(2026, 3, 3))).toBe(true) // Langfredag 2026
    })

    it('returns false for a regular weekday', () => {
      // 2026-02-13 is a Friday
      expect(isPublicHoliday(new Date(2026, 1, 13))).toBe(false)
    })
  })

  describe('isBusinessDay', () => {
    it('returns true for regular weekdays', () => {
      expect(isBusinessDay(new Date(2026, 1, 9))).toBe(true) // Monday
      expect(isBusinessDay(new Date(2026, 1, 13))).toBe(true) // Friday
    })

    it('returns false for weekends', () => {
      expect(isBusinessDay(new Date(2026, 1, 14))).toBe(false) // Saturday
      expect(isBusinessDay(new Date(2026, 1, 15))).toBe(false) // Sunday
    })

    it('returns false for public holidays on weekdays', () => {
      expect(isBusinessDay(new Date(2026, 4, 1))).toBe(false) // 1. mai (Friday)
      expect(isBusinessDay(new Date(2026, 3, 2))).toBe(false) // Skjærtorsdag
    })
  })

  describe('getWeekdayKey', () => {
    it('returns correct day keys', () => {
      expect(getWeekdayKey(new Date(2026, 1, 9))).toBe('mon')
      expect(getWeekdayKey(new Date(2026, 1, 10))).toBe('tue')
      expect(getWeekdayKey(new Date(2026, 1, 11))).toBe('wed')
      expect(getWeekdayKey(new Date(2026, 1, 12))).toBe('thu')
      expect(getWeekdayKey(new Date(2026, 1, 13))).toBe('fri')
      expect(getWeekdayKey(new Date(2026, 1, 14))).toBe('sat')
      expect(getWeekdayKey(new Date(2026, 1, 15))).toBe('sun')
    })
  })

  describe('2022 exhaustive verification (matches Kotlin reference)', () => {
    // All public holidays in 2022 (Easter = April 17)
    const fridager2022 = [
      new Date(2022, 0, 1), // Første nyttårsdag
      new Date(2022, 3, 14), // Skjærtorsdag
      new Date(2022, 3, 15), // Langfredag
      new Date(2022, 3, 17), // Første påskedag (Sunday)
      new Date(2022, 3, 18), // Andre påskedag
      new Date(2022, 4, 1), // Arbeidernes dag
      new Date(2022, 4, 17), // Grunnlovsdagen
      new Date(2022, 4, 26), // Kristi himmelfartsdag
      new Date(2022, 5, 5), // Første pinsedag (Sunday)
      new Date(2022, 5, 6), // Andre pinsedag
      new Date(2022, 11, 25), // Første juledag (Sunday)
      new Date(2022, 11, 26), // Andre juledag
    ]

    it('all 2022 public holidays are recognized as holidays', () => {
      for (const date of fridager2022) {
        expect(isPublicHoliday(date), `Expected ${date.toISOString()} to be a public holiday`).toBe(true)
        expect(isBusinessDay(date), `Expected ${date.toISOString()} to NOT be a business day`).toBe(false)
      }
    })

    it('every non-holiday weekday in 2022 is a business day', () => {
      const fridagerKeys = new Set(
        fridager2022.map(
          (d) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        ),
      )

      const start = new Date(2022, 0, 2) // Jan 2 (Jan 1 is a holiday)
      for (let i = 0; i < 364; i++) {
        const date = new Date(start)
        date.setDate(start.getDate() + i)
        const day = date.getDay()
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

        if (day === 0 || day === 6) {
          // Weekend
          expect(isPublicHoliday(date), `Expected weekend ${key} to be a holiday`).toBe(true)
          expect(isBusinessDay(date), `Expected weekend ${key} to NOT be a business day`).toBe(false)
        } else if (!fridagerKeys.has(key)) {
          // Regular weekday
          expect(isPublicHoliday(date), `Expected weekday ${key} to NOT be a holiday`).toBe(false)
          expect(isBusinessDay(date), `Expected weekday ${key} to be a business day`).toBe(true)
        }
      }
    })
  })
})
