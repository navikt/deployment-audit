import { describe, expect, it } from 'vitest'
import { homeTabFixtures } from '~/lib/__fixtures__/slack-fixtures'
import {
  buildHomeTabBlocks,
  buildKeywordsModalView,
  decodeKeywordsButtonValue,
  encodeKeywordsButtonValue,
  SHOW_KEYWORDS_ACTION_ID,
} from '~/lib/slack/blocks'

describe('buildHomeTabBlocks (personalized)', () => {
  it('produces blocks for a fully populated user (boards + team + person issues)', () => {
    const blocks = buildHomeTabBlocks(homeTabFixtures.withIssues)
    expect(blocks.length).toBeGreaterThan(0)
    const text = JSON.stringify(blocks)
    expect(text).not.toContain('Deployment Audit')
    expect(text).toContain('Skjermbildemodernisering')
    expect(text).toContain('godkjenning')
    expect(text).toContain('endringsopphav')
    expect(text).toContain(SHOW_KEYWORDS_ACTION_ID)
  })

  it('shows "ingen mangler" when there are no issues', () => {
    const blocks = buildHomeTabBlocks(homeTabFixtures.noIssues)
    const text = JSON.stringify(blocks)
    expect(text).toMatch(/Ingen åpne|Alle dine deployments/)
  })

  it('renders an onboarding hint (not the empty-state) when github_username is missing', () => {
    const blocks = buildHomeTabBlocks(homeTabFixtures.noGithubUser)
    const text = JSON.stringify(blocks)
    // The personal section IS rendered, but with guidance — not the
    // "Alle dine deployments har endringsopphav" empty state.
    expect(text).toContain('Endringsopphav')
    expect(text).toContain('GitHub-brukernavnet')
    expect(text).toContain('open_profile')
    expect(text).not.toContain('Alle dine deployments har endringsopphav')
  })

  it('shows onboarding when user has no mapping', () => {
    const blocks = buildHomeTabBlocks(homeTabFixtures.noMapping)
    const text = JSON.stringify(blocks)
    expect(text.toLowerCase()).toMatch(/koble|mapping|nda/)
  })

  it('handles users without active boards', () => {
    const blocks = buildHomeTabBlocks(homeTabFixtures.noBoards)
    expect(blocks.length).toBeGreaterThan(0)
  })

  it('respects Slack 100-block limit', () => {
    const blocks = buildHomeTabBlocks(homeTabFixtures.withIssues)
    expect(blocks.length).toBeLessThanOrEqual(100)
  })
})

describe('keywords button value encode/decode', () => {
  it('roundtrips a value', () => {
    const value = { title: 'KR: Lansere ny flyt', keywords: ['saksbehandler-flyt', 'ny-flyt'] }
    const encoded = encodeKeywordsButtonValue(value)
    const decoded = decodeKeywordsButtonValue(encoded)
    expect(decoded).toEqual(value)
  })

  it('returns null on invalid input', () => {
    expect(decodeKeywordsButtonValue('not-json')).toBeNull()
    expect(decodeKeywordsButtonValue('{}')).toBeNull()
  })

  it('keeps encoded value within Slack 2000-char limit', () => {
    const value = {
      title: 'A'.repeat(100),
      keywords: Array.from({ length: 50 }, (_, i) => `keyword-${i}`),
    }
    const encoded = encodeKeywordsButtonValue(value)
    expect(encoded.length).toBeLessThanOrEqual(2000)
  })
})

describe('buildKeywordsModalView', () => {
  it('builds a modal view with the keywords', () => {
    const view = buildKeywordsModalView({
      title: 'KR: Lansere',
      keywords: ['nokkel-1', 'nokkel-2'],
    })
    expect(view.type).toBe('modal')
    const text = JSON.stringify(view)
    expect(text).toContain('nokkel-1')
    expect(text).toContain('nokkel-2')
  })

  it('handles empty keywords gracefully', () => {
    const view = buildKeywordsModalView({ title: 'Tomt', keywords: [] })
    expect(view.type).toBe('modal')
  })

  it('strips backticks from keywords so inline-code spans cannot be broken', () => {
    const view = buildKeywordsModalView({ title: 'Med backtick', keywords: ['evil`keyword'] })
    const text = JSON.stringify(view)
    expect(text).not.toContain('evil`keyword')
    expect(text).toContain('evilkeyword')
  })

  it('keeps the modal title within Slack 24-character limit even when truncating', () => {
    const long = buildKeywordsModalView({
      title: 'A'.repeat(200),
      keywords: ['x'],
    })
    expect(long.title.text.length).toBeLessThanOrEqual(24)
    const short = buildKeywordsModalView({ title: 'Kort', keywords: ['x'] })
    expect(short.title.text).toBe('Kodeord: Kort')
  })
})
