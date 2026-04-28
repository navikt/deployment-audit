/**
 * Integration test: title-mismatches admin page query.
 * Validates that the FILTER aggregate syntax works correctly
 * for counting deployments with missing titles.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { seedApp, seedDeployment, truncateAllTables } from './helpers'

let pool: Pool

beforeAll(() => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL })
})

afterAll(async () => {
  await pool.end()
})

afterEach(async () => {
  await truncateAllTables(pool)
})

// This is the exact query from the title-mismatches route loader (FIXED version)
const FIXED_SUMMARY_SQL = `SELECT
  (COUNT(*) FILTER (WHERE d.title IS NULL))::int AS total_missing,
  (COUNT(*) FILTER (WHERE d.title IS NULL AND d.github_pr_data IS NOT NULL AND d.github_pr_data->>'title' IS NOT NULL))::int AS with_pr_data,
  (COUNT(*) FILTER (WHERE d.title IS NULL AND (d.github_pr_data IS NULL OR d.github_pr_data->>'title' IS NULL) AND d.unverified_commits IS NOT NULL AND jsonb_array_length(d.unverified_commits) > 0))::int AS with_unverified_commits,
  (COUNT(*) FILTER (WHERE d.title IS NULL AND (d.github_pr_data IS NULL OR d.github_pr_data->>'title' IS NULL) AND (d.unverified_commits IS NULL OR jsonb_array_length(d.unverified_commits) = 0)))::int AS no_fallback
FROM deployments d`

// The broken query before the fix — cast before FILTER is invalid SQL
const BROKEN_SUMMARY_SQL = `SELECT
  COUNT(*)::int FILTER (WHERE d.title IS NULL) AS total_missing,
  COUNT(*)::int FILTER (WHERE d.title IS NULL AND d.github_pr_data IS NOT NULL AND d.github_pr_data->>'title' IS NOT NULL) AS with_pr_data,
  COUNT(*)::int FILTER (WHERE d.title IS NULL AND (d.github_pr_data IS NULL OR d.github_pr_data->>'title' IS NULL) AND d.unverified_commits IS NOT NULL AND jsonb_array_length(d.unverified_commits) > 0) AS with_unverified_commits,
  COUNT(*)::int FILTER (WHERE d.title IS NULL AND (d.github_pr_data IS NULL OR d.github_pr_data->>'title' IS NULL) AND (d.unverified_commits IS NULL OR jsonb_array_length(d.unverified_commits) = 0)) AS no_fallback
FROM deployments d`

describe('title-mismatches missing summary query', () => {
  it('broken syntax (regression): COUNT(*)::int FILTER is invalid SQL', async () => {
    await expect(pool.query(BROKEN_SUMMARY_SQL)).rejects.toThrow('syntax error at or near "FILTER"')
  })

  it('should execute without syntax errors', async () => {
    const { rows } = await pool.query(FIXED_SUMMARY_SQL)
    expect(rows).toHaveLength(1)
    expect(rows[0].total_missing).toBe(0)
  })

  it('should count deployments with missing titles correctly', async () => {
    const appId = await seedApp(pool, { teamSlug: 'team', appName: 'app', environment: 'prod' })

    // Deployment with title
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      title: 'Has title',
    })

    // Deployment with missing title but has PR data
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      title: undefined,
      githubPrData: { title: 'PR title' },
    })

    // Deployment with missing title and no fallback
    await seedDeployment(pool, {
      monitoredAppId: appId,
      teamSlug: 'team',
      environment: 'prod',
      title: undefined,
    })

    const { rows } = await pool.query(FIXED_SUMMARY_SQL)
    expect(rows[0].total_missing).toBe(2)
    expect(rows[0].with_pr_data).toBe(1)
    expect(rows[0].no_fallback).toBe(1)
  })
})
