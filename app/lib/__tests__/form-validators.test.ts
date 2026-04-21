import { describe, expect, it } from 'vitest'
import { isValidEmail, isValidGitHubUsername, isValidNavIdent, isValidSlackChannel } from '../form-validators'

describe('form-validators', () => {
  describe('isValidEmail', () => {
    it('accepts valid email addresses', () => {
      expect(isValidEmail('ola@nav.no')).toBe(true)
      expect(isValidEmail('user.name@example.com')).toBe(true)
      expect(isValidEmail('a@b.c')).toBe(true)
    })

    it('rejects invalid email addresses', () => {
      expect(isValidEmail('')).toBe(false)
      expect(isValidEmail('not-an-email')).toBe(false)
      expect(isValidEmail('missing@domain')).toBe(false)
      expect(isValidEmail('@no-local.com')).toBe(false)
      expect(isValidEmail('spaces in@email.com')).toBe(false)
    })
  })

  describe('isValidNavIdent', () => {
    it('accepts valid nav idents (letter + 6 digits)', () => {
      expect(isValidNavIdent('A123456')).toBe(true)
      expect(isValidNavIdent('z000000')).toBe(true)
      expect(isValidNavIdent('M999999')).toBe(true)
    })

    it('rejects invalid nav idents', () => {
      expect(isValidNavIdent('')).toBe(false)
      expect(isValidNavIdent('1234567')).toBe(false)
      expect(isValidNavIdent('AB12345')).toBe(false)
      expect(isValidNavIdent('A12345')).toBe(false)
      expect(isValidNavIdent('A1234567')).toBe(false)
    })
  })

  describe('isValidSlackChannel', () => {
    it('accepts valid Slack channel IDs (C + alphanumeric)', () => {
      expect(isValidSlackChannel('C01ABC23DEF')).toBe(true)
      expect(isValidSlackChannel('C0')).toBe(true)
    })

    it('accepts hash-prefixed channel names', () => {
      expect(isValidSlackChannel('#general')).toBe(true)
      expect(isValidSlackChannel('#my-channel')).toBe(true)
      expect(isValidSlackChannel('#deploy_alerts')).toBe(true)
    })

    it('rejects invalid channel identifiers', () => {
      expect(isValidSlackChannel('')).toBe(false)
      expect(isValidSlackChannel('general')).toBe(false)
      expect(isValidSlackChannel('D01ABC')).toBe(false)
      expect(isValidSlackChannel('#has spaces')).toBe(false)
    })
  })

  describe('isValidGitHubUsername', () => {
    it('accepts valid GitHub usernames', () => {
      expect(isValidGitHubUsername('octocat')).toBe(true)
      expect(isValidGitHubUsername('user-name')).toBe(true)
      expect(isValidGitHubUsername('a')).toBe(true)
      expect(isValidGitHubUsername('user123')).toBe(true)
      expect(isValidGitHubUsername('123user')).toBe(true)
    })

    it('rejects invalid GitHub usernames', () => {
      expect(isValidGitHubUsername('')).toBe(false)
      expect(isValidGitHubUsername('-starts-with-hyphen')).toBe(false)
      expect(isValidGitHubUsername('ends-with-hyphen-')).toBe(false)
      expect(isValidGitHubUsername('has spaces')).toBe(false)
      expect(isValidGitHubUsername('has/slash')).toBe(false)
      expect(isValidGitHubUsername('has..dots')).toBe(false)
      expect(isValidGitHubUsername('double--hyphen')).toBe(false)
      expect(isValidGitHubUsername('a'.repeat(40))).toBe(false)
    })
  })
})
