import { describe, expect, it } from 'vitest'
import { parseAppIds } from '../parse-app-ids'

describe('Dev team admin - parseAppIds', () => {
  it('parses valid integer strings', () => {
    expect(parseAppIds(['1', '2', '3'])).toEqual([1, 2, 3])
  })

  it('returns empty array for empty input', () => {
    expect(parseAppIds([])).toEqual([])
  })

  it('deduplicates IDs', () => {
    expect(parseAppIds(['1', '2', '1', '3'])).toEqual([1, 2, 3])
  })

  it('rejects non-integer values', () => {
    expect(parseAppIds(['1', '1.5', '3'])).toBeNull()
  })

  it('rejects negative values', () => {
    expect(parseAppIds(['1', '-2', '3'])).toBeNull()
  })

  it('rejects zero', () => {
    expect(parseAppIds(['0', '1'])).toBeNull()
  })

  it('rejects non-numeric strings', () => {
    expect(parseAppIds(['1', 'abc', '3'])).toBeNull()
  })

  it('rejects NaN values', () => {
    expect(parseAppIds(['NaN'])).toBeNull()
  })

  it('rejects File objects (non-string FormDataEntryValue)', () => {
    const file = new File([''], 'test.txt')
    expect(parseAppIds([file as unknown as FormDataEntryValue])).toBeNull()
  })
})
