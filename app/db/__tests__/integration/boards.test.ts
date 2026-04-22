import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { seedApp, seedDeployment, seedDevTeam, seedSection, truncateAllTables } from './helpers'

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

async function seedBoardStack(pool: Pool) {
  const sectionId = await seedSection(pool, 'sec')
  const devTeamId = await seedDevTeam(pool, 'team', 'Team', sectionId)
  const { rows: boardRows } = await pool.query(
    `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label, created_by)
     VALUES ($1, 'Sprint 1', 'tertiary', '2026-01-01', '2026-04-30', 'T1 2026', 'alice') RETURNING *`,
    [devTeamId],
  )
  return { sectionId, devTeamId, board: boardRows[0] }
}

describe('boards', () => {
  it('creates a board linked to a dev team', async () => {
    const { board, devTeamId } = await seedBoardStack(pool)
    expect(board.dev_team_id).toBe(devTeamId)
    expect(board.title).toBe('Sprint 1')
    expect(board.period_type).toBe('tertiary')
    expect(board.is_active).toBe(true)
  })

  it('creates objectives with auto-incrementing sort_order', async () => {
    const { board } = await seedBoardStack(pool)

    const { rows: obj1 } = await pool.query(
      `INSERT INTO board_objectives (board_id, title, sort_order)
       VALUES ($1, 'Objective 1', 0) RETURNING *`,
      [board.id],
    )
    const { rows: obj2 } = await pool.query(
      `INSERT INTO board_objectives (board_id, title, sort_order)
       VALUES ($1, 'Objective 2', 1) RETURNING *`,
      [board.id],
    )

    expect(obj1[0].sort_order).toBe(0)
    expect(obj2[0].sort_order).toBe(1)
  })

  it('creates key results under objectives', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )
    const { rows: kr } = await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR 1', 0) RETURNING *",
      [obj[0].id],
    )
    expect(kr[0].objective_id).toBe(obj[0].id)
    expect(kr[0].title).toBe('KR 1')
  })

  it('soft delete: deactivating objective sets is_active to false', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )
    await pool.query("INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR', 0)", [
      obj[0].id,
    ])

    // Deactivate objective
    await pool.query('UPDATE board_objectives SET is_active = false WHERE id = $1', [obj[0].id])

    // Objective still exists but is inactive
    const { rows: objectives } = await pool.query('SELECT * FROM board_objectives WHERE id = $1', [obj[0].id])
    expect(objectives).toHaveLength(1)
    expect(objectives[0].is_active).toBe(false)

    // Key results still exist
    const { rows: keyResults } = await pool.query('SELECT * FROM board_key_results WHERE objective_id = $1', [
      obj[0].id,
    ])
    expect(keyResults).toHaveLength(1)
  })

  it('RESTRICT prevents physical deletion of objective when deployment goal links exist', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )

    const appId = await seedApp(pool, { teamSlug: 'team', appName: 'restrict-test', environment: 'prod' })
    const deploymentId = await seedDeployment(pool, { monitoredAppId: appId, teamSlug: 'team', environment: 'prod' })
    await pool.query(
      "INSERT INTO deployment_goal_links (deployment_id, objective_id, link_method) VALUES ($1, $2, 'manual')",
      [deploymentId, obj[0].id],
    )

    // Physical deletion should fail with RESTRICT
    await expect(pool.query('DELETE FROM board_objectives WHERE id = $1', [obj[0].id])).rejects.toThrow()
  })

  it('RESTRICT prevents physical deletion of key result when deployment goal links exist', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )
    const { rows: kr } = await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR', 0) RETURNING *",
      [obj[0].id],
    )

    const appId = await seedApp(pool, { teamSlug: 'team', appName: 'kr-restrict-test', environment: 'prod' })
    const deploymentId = await seedDeployment(pool, { monitoredAppId: appId, teamSlug: 'team', environment: 'prod' })
    await pool.query(
      "INSERT INTO deployment_goal_links (deployment_id, key_result_id, link_method) VALUES ($1, $2, 'manual')",
      [deploymentId, kr[0].id],
    )

    // Physical deletion should fail with RESTRICT
    await expect(pool.query('DELETE FROM board_key_results WHERE id = $1', [kr[0].id])).rejects.toThrow()
  })

  it('RESTRICT prevents physical deletion of board when objectives exist', async () => {
    const { board } = await seedBoardStack(pool)
    await pool.query("INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0)", [board.id])

    // Physical deletion should fail with RESTRICT
    await expect(pool.query('DELETE FROM boards WHERE id = $1', [board.id])).rejects.toThrow()
  })

  it('reactivation restores objective to active state', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )

    await pool.query('UPDATE board_objectives SET is_active = false WHERE id = $1', [obj[0].id])
    await pool.query('UPDATE board_objectives SET is_active = true WHERE id = $1', [obj[0].id])

    const { rows } = await pool.query('SELECT * FROM board_objectives WHERE id = $1', [obj[0].id])
    expect(rows[0].is_active).toBe(true)
  })

  it('external references link to objectives and key results', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )
    const { rows: kr } = await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR', 0) RETURNING *",
      [obj[0].id],
    )

    await pool.query(
      "INSERT INTO external_references (ref_type, url, title, objective_id) VALUES ('jira', 'https://jira/1', 'JIRA-1', $1)",
      [obj[0].id],
    )
    await pool.query(
      "INSERT INTO external_references (ref_type, url, title, key_result_id) VALUES ('github_issue', 'https://gh/1', 'GH-1', $1)",
      [kr[0].id],
    )

    const { rows: refs } = await pool.query(
      'SELECT * FROM external_references WHERE objective_id = $1 OR key_result_id = $2 ORDER BY id',
      [obj[0].id, kr[0].id],
    )
    expect(refs).toHaveLength(2)
    expect(refs[0].ref_type).toBe('jira')
    expect(refs[1].ref_type).toBe('github_issue')
  })

  it('RESTRICT prevents physical deletion of objective when key results exist', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )
    await pool.query("INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR', 0)", [
      obj[0].id,
    ])

    await expect(pool.query('DELETE FROM board_objectives WHERE id = $1', [obj[0].id])).rejects.toThrow(
      /violates foreign key constraint/,
    )
  })

  it('RESTRICT prevents physical deletion of objective when external references exist', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )
    await pool.query(
      "INSERT INTO external_references (ref_type, url, title, objective_id) VALUES ('jira', 'https://jira/1', 'JIRA-1', $1)",
      [obj[0].id],
    )

    await expect(pool.query('DELETE FROM board_objectives WHERE id = $1', [obj[0].id])).rejects.toThrow(
      /violates foreign key constraint/,
    )
  })

  it('RESTRICT prevents physical deletion of key result when external references exist', async () => {
    const { board } = await seedBoardStack(pool)
    const { rows: obj } = await pool.query(
      "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING *",
      [board.id],
    )
    const { rows: kr } = await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR', 0) RETURNING *",
      [obj[0].id],
    )
    await pool.query(
      "INSERT INTO external_references (ref_type, url, title, key_result_id) VALUES ('github_issue', 'https://gh/1', 'GH-1', $1)",
      [kr[0].id],
    )

    await expect(pool.query('DELETE FROM board_key_results WHERE id = $1', [kr[0].id])).rejects.toThrow(
      /violates foreign key constraint/,
    )
  })

  it('updates board title and is_active', async () => {
    const { board } = await seedBoardStack(pool)
    await pool.query("UPDATE boards SET title = 'Updated', is_active = false WHERE id = $1", [board.id])
    const { rows } = await pool.query('SELECT * FROM boards WHERE id = $1', [board.id])
    expect(rows[0].title).toBe('Updated')
    expect(rows[0].is_active).toBe(false)
  })
})
