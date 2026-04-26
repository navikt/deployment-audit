#!/usr/bin/env tsx
/**
 * Backfill missing github_pr_url for deployments
 *
 * This script populates github_pr_url for deployments where:
 * - github_pr_number is set
 * - github_pr_url is NULL
 * - detected_github_owner and detected_github_repo_name are set
 *
 * Run with: tsx scripts/backfill-github-pr-urls.ts
 */

import 'dotenv/config'
import { pool } from '../app/db/connection.server'
import { logger } from '../app/lib/logger.server'

async function backfillGithubPrUrls() {
  try {
    logger.info('🔄 Starting github_pr_url backfill...')

    // Count rows that need updating
    const countResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM deployments
      WHERE github_pr_url IS NULL
        AND github_pr_number IS NOT NULL
        AND detected_github_owner IS NOT NULL
        AND detected_github_repo_name IS NOT NULL
    `)
    const rowCount = parseInt(countResult.rows[0].count, 10)

    if (rowCount === 0) {
      logger.info('✅ No rows need updating')
      return
    }

    logger.info(`📊 Found ${rowCount} deployments missing github_pr_url`)

    // Update rows
    const updateResult = await pool.query(`
      UPDATE deployments
      SET github_pr_url = 'https://github.com/' || detected_github_owner || '/' || detected_github_repo_name || '/pull/' || github_pr_number::text
      WHERE github_pr_url IS NULL
        AND github_pr_number IS NOT NULL
        AND detected_github_owner IS NOT NULL
        AND detected_github_repo_name IS NOT NULL
    `)

    logger.info(`✅ Updated ${updateResult.rowCount} rows`)

    // Verify some examples
    const examplesResult = await pool.query(`
      SELECT id, github_pr_number, github_pr_url
      FROM deployments
      WHERE github_pr_number IS NOT NULL
        AND github_pr_url IS NOT NULL
      ORDER BY id DESC
      LIMIT 5
    `)

    logger.info('📋 Sample of updated rows:')
    for (const row of examplesResult.rows) {
      logger.info(`  Deployment ${row.id}: PR #${row.github_pr_number} → ${row.github_pr_url}`)
    }
  } catch (error) {
    logger.error('❌ Backfill failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

backfillGithubPrUrls()
