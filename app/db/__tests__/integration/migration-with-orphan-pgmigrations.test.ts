/**
 * Integration test: New backfill migration runs cleanly when an orphan row
 * exists in pgmigrations.
 *
 * Reproduces the EXACT prod state:
 *   - The old migration `1772700000000_populate-missing-github-pr-urls` is
 *     registered in `pgmigrations` (it ran earlier in prod with broken SQL).
 *   - The corresponding migration FILE has been removed (commit a47cdc9).
 *   - Existing deployments have github_pr_number set but github_pr_url NULL.
 *
 * Verifies:
 *   1. node-pg-migrate's checkOrder does NOT throw against this orphan state.
 *   2. The new backfill migration runs and is registered in pgmigrations.
 *   3. The deployment row gets its github_pr_url constructed correctly.
 *   4. Pre-existing github_pr_url values are preserved.
 *   5. Re-running migrations is idempotent.
 *
 * To reproduce the prod scenario faithfully, the test copies all migrations
 * EXCEPT the new backfill into a tmp dir, runs them, then adds the orphan to
 * pgmigrations, then copies in the new backfill migration and runs again.
 */

import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { runner } from 'node-pg-migrate'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { seedApp } from './helpers'

const ORPHAN_MIGRATION_FILE = '1772700000000_populate-missing-github-pr-urls.sql'
const ORPHAN_MIGRATION_NAME = '1772700000000_populate-missing-github-pr-urls'
const NEW_MIGRATION_FILE = '1772800000000_backfill-github-pr-url-from-pr-number.sql'
const NEW_MIGRATION_NAME = '1772800000000_backfill-github-pr-url-from-pr-number'

const realMigrationsDir = join(process.cwd(), 'app/db/migrations')

let container: StartedPostgreSqlContainer
let pool: Pool
let databaseUrl: string
let tmpMigrationsDir: string

describe('Migration runs cleanly against orphan pgmigrations row (prod scenario)', () => {
  beforeAll(async () => {
    // 1. Spin up isolated PostgreSQL container (don't share with global setup)
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
    databaseUrl = container.getConnectionUri()
    pool = new Pool({ connectionString: databaseUrl })

    // 2. Set up a tmp migrations dir that omits BOTH the placeholder and the
    //    new backfill so we can reproduce the prod state where the orphan was
    //    registered without having a local file to align with.
    tmpMigrationsDir = join(tmpdir(), `nda-migrations-${Date.now()}`)
    mkdirSync(tmpMigrationsDir, { recursive: true })
    for (const file of readdirSync(realMigrationsDir)) {
      if (file === NEW_MIGRATION_FILE || file === ORPHAN_MIGRATION_FILE) continue
      copyFileSync(join(realMigrationsDir, file), join(tmpMigrationsDir, file))
    }

    // 3. Run all OTHER migrations (this is the prod schema sans new migration)
    await runner({
      databaseUrl,
      dir: tmpMigrationsDir,
      direction: 'up',
      migrationsTable: 'pgmigrations',
      schema: 'public',
      log: () => {},
    })

    // 4. Simulate prod by inserting the orphan row in pgmigrations.
    //    This row has no matching local file (file removed in commit a47cdc9).
    await pool.query(`INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())`, [ORPHAN_MIGRATION_NAME])
  }, 120_000)

  afterAll(async () => {
    await pool?.end()
    await container?.stop()
    if (tmpMigrationsDir) rmSync(tmpMigrationsDir, { recursive: true, force: true })
  })

  test('reproduces prod state: orphan registered, new migration not run', async () => {
    const orphan = await pool.query(`SELECT name FROM pgmigrations WHERE name = $1`, [ORPHAN_MIGRATION_NAME])
    expect(orphan.rows).toHaveLength(1)

    const newOne = await pool.query(`SELECT name FROM pgmigrations WHERE name = $1`, [NEW_MIGRATION_NAME])
    expect(newOne.rows).toHaveLength(0)
  })

  test('node-pg-migrate runs new migration cleanly despite orphan', async () => {
    // Insert prod-like deployment: PR number set, URL NULL, repo info present
    const appId = await seedApp(pool, { teamSlug: 't', appName: 'a', environment: 'prod-gcp' })

    await pool.query(
      `INSERT INTO deployments (
        nais_deployment_id, monitored_app_id, team_slug, app_name, environment_name,
        commit_sha, detected_github_owner, detected_github_repo_name,
        github_pr_number, github_pr_url, four_eyes_status, created_at
      ) VALUES ('nais-1', $1, 't', 'a', 'prod-gcp',
        'abc1234567890123456789012345678901234567', 'navikt', 'my-repo',
        13631, NULL, 'approved', NOW())`,
      [appId],
    )

    // Pre-existing URL must NOT be overwritten
    await pool.query(
      `INSERT INTO deployments (
        nais_deployment_id, monitored_app_id, team_slug, app_name, environment_name,
        commit_sha, detected_github_owner, detected_github_repo_name,
        github_pr_number, github_pr_url, four_eyes_status, created_at
      ) VALUES ('nais-2', $1, 't', 'a', 'prod-gcp',
        'def1234567890123456789012345678901234567', 'navikt', 'my-repo',
        99, 'https://github.com/navikt/my-repo/pull/99', 'approved', NOW())`,
      [appId],
    )

    // Add BOTH the placeholder (to align with the orphan in pgmigrations) AND
    // the new migration to the tmp dir, then run again — simulates deploy.
    copyFileSync(join(realMigrationsDir, ORPHAN_MIGRATION_FILE), join(tmpMigrationsDir, ORPHAN_MIGRATION_FILE))
    copyFileSync(join(realMigrationsDir, NEW_MIGRATION_FILE), join(tmpMigrationsDir, NEW_MIGRATION_FILE))

    await expect(
      runner({
        databaseUrl,
        dir: tmpMigrationsDir,
        direction: 'up',
        migrationsTable: 'pgmigrations',
        schema: 'public',
        log: () => {},
      }),
    ).resolves.not.toThrow()

    // The new migration should now be registered
    const registered = await pool.query(`SELECT name FROM pgmigrations WHERE name = $1`, [NEW_MIGRATION_NAME])
    expect(registered.rows).toHaveLength(1)

    // The NULL row should be backfilled from owner/repo/number
    const backfilled = await pool.query(`SELECT github_pr_url FROM deployments WHERE nais_deployment_id = 'nais-1'`)
    expect(backfilled.rows[0].github_pr_url).toBe('https://github.com/navikt/my-repo/pull/13631')

    // Pre-existing URL preserved
    const preserved = await pool.query(`SELECT github_pr_url FROM deployments WHERE nais_deployment_id = 'nais-2'`)
    expect(preserved.rows[0].github_pr_url).toBe('https://github.com/navikt/my-repo/pull/99')
  }, 60_000)

  test('re-running migrations is idempotent', async () => {
    await expect(
      runner({
        databaseUrl,
        dir: tmpMigrationsDir,
        direction: 'up',
        migrationsTable: 'pgmigrations',
        schema: 'public',
        log: () => {},
      }),
    ).resolves.not.toThrow()

    const rows = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pgmigrations WHERE name = $1`,
      [NEW_MIGRATION_NAME],
    )
    expect(rows.rows[0].count).toBe('1')
  }, 60_000)
})
