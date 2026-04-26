/**
 * Integration test for github_pr_url backfill migration
 *
 * Tests that the migration correctly populates missing github_pr_url
 * from github_pr_number and repo info when github_pr_url is NULL.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { seedApp, truncateAllTables } from './helpers'

let pool: Pool

describe('GitHub PR URL backfill migration', () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  })

  afterAll(async () => {
    await pool.end()
  })

  afterEach(async () => {
    await truncateAllTables(pool)
  })

  test('should populate github_pr_url when NULL but github_pr_number exists', async () => {
    // Setup: Create app and deployment with PR number but no URL
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
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id`,
      [
        'test-nais-id-1',
        appId,
        'test-team',
        'test-app',
        'prod-gcp',
        'abc1234567890123456789012345678901234567',
        'navikt',
        'test-repo',
        123,
        null, // No URL initially
        'approved',
      ],
    )
    const deploymentId = insertRows[0].id

    // Verify initial state
    const beforeResult = await pool.query('SELECT github_pr_number, github_pr_url FROM deployments WHERE id = $1', [
      deploymentId,
    ])
    expect(beforeResult.rows[0].github_pr_number).toBe(123)
    expect(beforeResult.rows[0].github_pr_url).toBeNull()

    // Execute the migration logic (what the migration does)
    await pool.query(`
      UPDATE deployments
      SET github_pr_url = 'https://github.com/' || detected_github_owner || '/' || detected_github_repo_name || '/pull/' || github_pr_number::text
      WHERE github_pr_url IS NULL
        AND github_pr_number IS NOT NULL
        AND detected_github_owner IS NOT NULL
        AND detected_github_repo_name IS NOT NULL
    `)

    // Verify URL was populated
    const afterResult = await pool.query('SELECT github_pr_number, github_pr_url FROM deployments WHERE id = $1', [
      deploymentId,
    ])
    expect(afterResult.rows[0].github_pr_number).toBe(123)
    expect(afterResult.rows[0].github_pr_url).toBe('https://github.com/navikt/test-repo/pull/123')
  })

  test('should not overwrite existing github_pr_url', async () => {
    // Setup: Create app and deployment with both PR number and URL
    const appId = await seedApp(pool, { teamSlug: 'test-team', appName: 'test-app', environment: 'prod-gcp' })
    const existingUrl = 'https://github.com/navikt/existing-repo/pull/456'

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
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id`,
      [
        'test-nais-id-2',
        appId,
        'test-team',
        'test-app',
        'prod-gcp',
        'def1234567890123456789012345678901234567',
        'navikt',
        'another-repo',
        456,
        existingUrl,
        'approved',
      ],
    )
    const deploymentId = insertRows[0].id

    // Execute the migration logic
    await pool.query(`
      UPDATE deployments
      SET github_pr_url = 'https://github.com/' || detected_github_owner || '/' || detected_github_repo_name || '/pull/' || github_pr_number::text
      WHERE github_pr_url IS NULL
        AND github_pr_number IS NOT NULL
        AND detected_github_owner IS NOT NULL
        AND detected_github_repo_name IS NOT NULL
    `)

    // Verify URL was NOT changed
    const afterResult = await pool.query('SELECT github_pr_number, github_pr_url FROM deployments WHERE id = $1', [
      deploymentId,
    ])
    expect(afterResult.rows[0].github_pr_number).toBe(456)
    expect(afterResult.rows[0].github_pr_url).toBe(existingUrl)
  })

  test('should not populate github_pr_url when github_pr_number is NULL', async () => {
    // Setup: Create app and deployment without PR number
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
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id`,
      [
        'test-nais-id-3',
        appId,
        'test-team',
        'test-app',
        'prod-gcp',
        'ghi1234567890123456789012345678901234567',
        'navikt',
        'direct-push-repo',
        null, // No PR number
        null,
        'direct_push',
      ],
    )
    const deploymentId = insertRows[0].id

    // Execute the migration logic
    await pool.query(`
      UPDATE deployments
      SET github_pr_url = 'https://github.com/' || detected_github_owner || '/' || detected_github_repo_name || '/pull/' || github_pr_number::text
      WHERE github_pr_url IS NULL
        AND github_pr_number IS NOT NULL
        AND detected_github_owner IS NOT NULL
        AND detected_github_repo_name IS NOT NULL
    `)

    // Verify URL was NOT populated (no PR number means no URL)
    const afterResult = await pool.query('SELECT github_pr_number, github_pr_url FROM deployments WHERE id = $1', [
      deploymentId,
    ])
    expect(afterResult.rows[0].github_pr_number).toBeNull()
    expect(afterResult.rows[0].github_pr_url).toBeNull()
  })

  test('should not populate github_pr_url when repo info is missing', async () => {
    // Setup: Create app and deployment with PR number but no repo info
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
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id`,
      [
        'test-nais-id-4',
        appId,
        'test-team',
        'test-app',
        'prod-gcp',
        'jkl1234567890123456789012345678901234567',
        null, // No owner
        null, // No repo name
        789,
        null,
        'error',
      ],
    )
    const deploymentId = insertRows[0].id

    // Execute the migration logic
    await pool.query(`
      UPDATE deployments
      SET github_pr_url = 'https://github.com/' || detected_github_owner || '/' || detected_github_repo_name || '/pull/' || github_pr_number::text
      WHERE github_pr_url IS NULL
        AND github_pr_number IS NOT NULL
        AND detected_github_owner IS NOT NULL
        AND detected_github_repo_name IS NOT NULL
    `)

    // Verify URL was NOT populated (missing repo info)
    const afterResult = await pool.query('SELECT github_pr_number, github_pr_url FROM deployments WHERE id = $1', [
      deploymentId,
    ])
    expect(afterResult.rows[0].github_pr_number).toBe(789)
    expect(afterResult.rows[0].github_pr_url).toBeNull()
  })
})
