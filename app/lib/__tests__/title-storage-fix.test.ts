/**
 * Tests for the title storage bug fix.
 *
 * Bug: store-data.server.ts used `result.deployedPr?.title || result.unverifiedCommits[0]?.message`
 * as the title. When deployedPr was null, this fell back to the first unverified commit message,
 * which could be from a DIFFERENT PR in the compare range — causing wrong titles.
 *
 * Fix: Only use `result.deployedPr?.title || null`. The TITLE_COALESCE_SQL in SELECT queries
 * handles display fallbacks at runtime.
 */
import { describe, expect, it } from 'vitest'
import type { VerificationResult } from '~/lib/verification/types'

/**
 * Simulate the title value that store-data.server.ts passes as $6
 * to the SQL: `title = COALESCE($6, title)`
 */
function getTitleForStorage(result: Pick<VerificationResult, 'deployedPr' | 'unverifiedCommits'>): string | null {
  // This is the FIXED logic (deployedPr?.title only, no fallback to unverifiedCommits)
  return result.deployedPr?.title || null
}

describe('Title storage: no fallback to unverifiedCommits', () => {
  it('uses deployedPr.title when PR is found', () => {
    const result: Pick<VerificationResult, 'deployedPr' | 'unverifiedCommits'> = {
      deployedPr: {
        number: 370,
        url: 'https://github.com/navikt/repo/pull/370',
        title: 'Bump the aksel group with 3 updates',
        author: 'dependabot[bot]',
      },
      unverifiedCommits: [
        {
          sha: 'abc123',
          message: 'Some other commit from different PR',
          author: 'dev',
          date: '2026-01-01',
          htmlUrl: '',
          prNumber: 999,
          reason: 'pr_not_approved',
        },
      ],
    }

    expect(getTitleForStorage(result)).toBe('Bump the aksel group with 3 updates')
  })

  it('returns null when deployedPr is null — does NOT fall back to unverifiedCommits', () => {
    const result: Pick<VerificationResult, 'deployedPr' | 'unverifiedCommits'> = {
      deployedPr: null,
      unverifiedCommits: [
        {
          sha: 'abc123',
          message: 'Commit from a completely different PR',
          author: 'dev',
          date: '2026-01-01',
          htmlUrl: '',
          prNumber: 999,
          reason: 'no_pr',
        },
      ],
    }

    // The old buggy code would return "Commit from a completely different PR"
    // The fix returns null so COALESCE($6, title) preserves the existing title
    expect(getTitleForStorage(result)).toBeNull()
  })

  it('returns null when both deployedPr and unverifiedCommits are empty', () => {
    const result: Pick<VerificationResult, 'deployedPr' | 'unverifiedCommits'> = {
      deployedPr: null,
      unverifiedCommits: [],
    }

    expect(getTitleForStorage(result)).toBeNull()
  })

  it('prefers deployedPr.title over unverifiedCommits even when both exist', () => {
    const result: Pick<VerificationResult, 'deployedPr' | 'unverifiedCommits'> = {
      deployedPr: {
        number: 42,
        url: 'https://github.com/navikt/repo/pull/42',
        title: 'The real PR title',
        author: 'dev',
      },
      unverifiedCommits: [
        {
          sha: 'abc123',
          message: 'A misleading commit message',
          author: 'dev',
          date: '2026-01-01',
          htmlUrl: '',
          prNumber: 99,
          reason: 'pr_not_approved',
        },
      ],
    }

    expect(getTitleForStorage(result)).toBe('The real PR title')
  })
})

describe('Title storage: COALESCE($6, title) behavior', () => {
  /**
   * Simulates `COALESCE($6, title)` — the SQL used in updateDeploymentVerification
   */
  function coalesce(newTitle: string | null, existingTitle: string | null): string | null {
    return newTitle ?? existingTitle
  }

  it('preserves existing correct title when deployedPr is null', () => {
    const existingTitle = 'Correct PR title set by previous verification'
    const newTitle = getTitleForStorage({
      deployedPr: null,
      unverifiedCommits: [
        { sha: 'x', message: 'Wrong commit', author: 'a', date: '', htmlUrl: '', prNumber: null, reason: 'no_pr' },
      ],
    })

    // With the fix, newTitle is null, so COALESCE keeps existing
    expect(coalesce(newTitle, existingTitle)).toBe('Correct PR title set by previous verification')
  })

  it('overwrites existing title when deployedPr has a title', () => {
    const existingTitle = 'Old wrong title from a bug'
    const newTitle = getTitleForStorage({
      deployedPr: { number: 1, url: '', title: 'Corrected PR title', author: 'dev' },
      unverifiedCommits: [],
    })

    expect(coalesce(newTitle, existingTitle)).toBe('Corrected PR title')
  })

  it('keeps null title when both are null', () => {
    const existingTitle = null
    const newTitle = getTitleForStorage({ deployedPr: null, unverifiedCommits: [] })

    expect(coalesce(newTitle, existingTitle)).toBeNull()
  })
})
