/**
 * Integration test: Migration ordering conflict
 *
 * Simulates the production scenario where the old migration
 * (1772700000000_populate-missing-github-pr-urls) has already run,
 * and we need to verify that a fix can be applied.
 */

import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { seedApp } from './helpers'

let pool: Pool

describe('Migration ordering with prod scenario', () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  })

  afterAll(async () => {
    await pool.end()
  })

  test('should handle migration ordering when old migration already ran', async () => {
    // This test simulates the production scenario:
    // 1. Old migration 1772700000000 ran (with wrong SQL that tried to use github_pr_data->>'url')
    // 2. It's marked as "ran" in pgmigrations table even though it didn't populate data correctly
    // 3. New migration 1772700000001 needs to run to actually fix the data

    // Check if the old migration is marked as run
    const oldMigrationResult = await pool.query(`SELECT * FROM pgmigrations WHERE name = $1`, [
      '1772700000000_populate-missing-github-pr-urls',
    ])

    console.log('Old migration status:', oldMigrationResult.rows.length > 0 ? 'RAN' : 'NOT RUN')

    // Check if the new migration is marked as run
    const newMigrationResult = await pool.query(`SELECT * FROM pgmigrations WHERE name = $1`, [
      '1772700000001_backfill-github-pr-urls-from-pr-number',
    ])

    console.log('New migration status:', newMigrationResult.rows.length > 0 ? 'RAN' : 'NOT RUN')

    // Create test data that mimics production state:
    // - github_pr_number is set
    // - github_pr_url is NULL (because old migration failed to populate it)
    // - github_pr_data exists but doesn't have 'url' field

    const appId = await seedApp(pool, { teamSlug: 'test-team', appName: 'test-app', environment: 'prod-gcp' })

    const { rows: insertRows } = await pool.query<{ id: number }>(
      `INSERT INTO deployments (
        nais_deployment_id, 
        monitored_app_id, 
        team_slug,
        app_name,
        environment_name,
        commit_sha, 
        detected_github_owner,
        detected_github_repo_name,
        github_pr_number,
        github_pr_url,
        four_eyes_status,
        github_pr_data,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
      RETURNING id`,
      [
        'test-migration-order-1',
        appId,
        'test-team',
        'test-app',
        'prod-gcp',
        'abc1234567890123456789012345678901234567',
        'navikt',
        'test-repo',
        123,
        null, // NULL because old migration failed
        'approved',
        JSON.stringify({ title: 'Test PR', body: 'Test body' }), // No 'url' field!
      ],
    )
    const deploymentId = insertRows[0].id

    // Verify initial state (like production)
    const beforeResult = await pool.query(
      'SELECT github_pr_number, github_pr_url, github_pr_data FROM deployments WHERE id = $1',
      [deploymentId],
    )
    expect(beforeResult.rows[0].github_pr_number).toBe(123)
    expect(beforeResult.rows[0].github_pr_url).toBeNull()
    expect(beforeResult.rows[0].github_pr_data).toHaveProperty('title')
    expect(beforeResult.rows[0].github_pr_data).not.toHaveProperty('url')

    // NOW: Execute the fix SQL (what the new migration should do)
    // This SQL constructs the URL from repo info + PR number instead of trying to read from github_pr_data
    const updateResult = await pool.query(`
      UPDATE deployments
      SET github_pr_url = 'https://github.com/' || detected_github_owner || '/' || detected_github_repo_name || '/pull/' || github_pr_number::text
      WHERE github_pr_url IS NULL
        AND github_pr_number IS NOT NULL
        AND detected_github_owner IS NOT NULL
        AND detected_github_repo_name IS NOT NULL
    `)

    console.log('Updated rows:', updateResult.rowCount)

    // Verify the fix worked
    const afterResult = await pool.query('SELECT github_pr_number, github_pr_url FROM deployments WHERE id = $1', [
      deploymentId,
    ])
    expect(afterResult.rows[0].github_pr_number).toBe(123)
    expect(afterResult.rows[0].github_pr_url).toBe('https://github.com/navikt/test-repo/pull/123')

    // Cleanup
    await pool.query('DELETE FROM deployments WHERE id = $1', [deploymentId])
  })
})
