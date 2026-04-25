/**
 * Integration tests: hierarchy-building queries for boards.
 *
 * Verifies that getBoardsWithGoalsForDevTeam, getBoardWithObjectives, and
 * getBoardObjectiveProgress return correct results after the N+1 → O(1)
 * query refactor.
 */

import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { addExternalReference, getBoardsWithGoalsForDevTeam, getBoardWithObjectives } from '../../boards.server'
import { getBoardObjectiveProgress } from '../../dashboard-stats.server'
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

async function seedFullHierarchy(pool: Pool) {
  const sectionId = await seedSection(pool, 'sec', 'Section')
  const devTeamId = await seedDevTeam(pool, 'team', 'Team', sectionId)
  const {
    rows: [board],
  } = await pool.query(
    `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
     VALUES ($1, 'Board', 'tertiary', '2026-01-01', '2026-04-30', 'T1 2026') RETURNING *`,
    [devTeamId],
  )
  const {
    rows: [obj1],
  } = await pool.query(
    "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj 1', 0) RETURNING *",
    [board.id],
  )
  const {
    rows: [obj2],
  } = await pool.query(
    "INSERT INTO board_objectives (board_id, title, sort_order) VALUES ($1, 'Obj 2', 1) RETURNING *",
    [board.id],
  )
  const {
    rows: [kr1],
  } = await pool.query(
    "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR 1.1', 0) RETURNING *",
    [obj1.id],
  )
  const {
    rows: [kr2],
  } = await pool.query(
    "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR 1.2', 1) RETURNING *",
    [obj1.id],
  )
  const {
    rows: [kr3],
  } = await pool.query(
    "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR 2.1', 0) RETURNING *",
    [obj2.id],
  )
  return { sectionId, devTeamId, board, obj1, obj2, kr1, kr2, kr3 }
}

describe('getBoardsWithGoalsForDevTeam', () => {
  it('returns boards with nested objectives and key results', async () => {
    const { devTeamId, board, obj1, obj2, kr1, kr2, kr3 } = await seedFullHierarchy(pool)

    const result = await getBoardsWithGoalsForDevTeam(devTeamId)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(board.id)
    expect(result[0].period_label).toBe('T1 2026')

    const objectives = result[0].objectives
    expect(objectives).toHaveLength(2)
    expect(objectives[0].id).toBe(obj1.id)
    expect(objectives[0].title).toBe('Obj 1')
    expect(objectives[0].key_results.map((k) => k.id)).toEqual([kr1.id, kr2.id])
    expect(objectives[1].id).toBe(obj2.id)
    expect(objectives[1].key_results.map((k) => k.id)).toEqual([kr3.id])
  })

  it('filters out inactive objectives and key results', async () => {
    const { devTeamId, obj1, kr1 } = await seedFullHierarchy(pool)
    await pool.query('UPDATE board_objectives SET is_active = false WHERE id = $1', [obj1.id])
    await pool.query('UPDATE board_key_results SET is_active = false WHERE id = $1', [kr1.id])

    const result = await getBoardsWithGoalsForDevTeam(devTeamId)
    const objectives = result[0].objectives
    expect(objectives.find((o) => o.id === obj1.id)).toBeUndefined()
    const obj2 = objectives[0]
    expect(obj2.key_results.find((k) => k.id === kr1.id)).toBeUndefined()
  })

  it('returns empty array when no boards exist for the team', async () => {
    const sectionId = await seedSection(pool, 'empty', 'Empty')
    const devTeamId = await seedDevTeam(pool, 'empty-team', 'Empty Team', sectionId)
    const result = await getBoardsWithGoalsForDevTeam(devTeamId)
    expect(result).toHaveLength(0)
  })

  it('filters by asOfDate', async () => {
    const { devTeamId } = await seedFullHierarchy(pool)
    // Board period is 2026-01-01 to 2026-04-30
    expect(await getBoardsWithGoalsForDevTeam(devTeamId, '2026-02-15')).toHaveLength(1)
    expect(await getBoardsWithGoalsForDevTeam(devTeamId, '2025-12-31')).toHaveLength(0)
    expect(await getBoardsWithGoalsForDevTeam(devTeamId, '2026-05-01')).toHaveLength(0)
  })

  it('handles multiple boards for the same team', async () => {
    const sectionId = await seedSection(pool, 'sec2', 'Sec 2')
    const devTeamId = await seedDevTeam(pool, 'team2', 'Team 2', sectionId)
    await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, 'Board A', 'tertiary', '2026-01-01', '2026-04-30', 'T1 2026'),
              ($1, 'Board B', 'tertiary', '2025-09-01', '2025-12-31', 'T3 2025')`,
      [devTeamId],
    )
    const result = await getBoardsWithGoalsForDevTeam(devTeamId)
    expect(result).toHaveLength(2)
    // Sorted by period_start DESC
    expect(result[0].period_label).toBe('T1 2026')
    expect(result[1].period_label).toBe('T3 2025')
  })
})

describe('getBoardWithObjectives', () => {
  it('returns full hierarchy with objectives, key results, and external references', async () => {
    const { board, obj1, obj2, kr1, kr2 } = await seedFullHierarchy(pool)

    const objRef = await addExternalReference({
      ref_type: 'jira',
      url: 'https://jira/1',
      title: 'JIRA-1',
      objective_id: obj1.id,
    })
    const krRef = await addExternalReference({
      ref_type: 'github_issue',
      url: 'https://gh/1',
      title: 'GH-1',
      key_result_id: kr1.id,
    })

    const result = await getBoardWithObjectives(board.id)
    if (!result) throw new Error('expected board')

    expect(result.id).toBe(board.id)
    expect(result.objectives).toHaveLength(2)

    const firstObj = result.objectives.find((o) => o.id === obj1.id)
    if (!firstObj) throw new Error('firstObj not found')
    expect(firstObj.external_references).toHaveLength(1)
    expect(firstObj.external_references[0].id).toBe(objRef.id)
    expect(firstObj.key_results.map((k) => k.id)).toEqual([kr1.id, kr2.id])
    expect(firstObj.key_results[0].external_references).toHaveLength(1)
    expect(firstObj.key_results[0].external_references[0].id).toBe(krRef.id)
    expect(firstObj.key_results[1].external_references).toHaveLength(0)

    const secondObj = result.objectives.find((o) => o.id === obj2.id)
    if (!secondObj) throw new Error('secondObj not found')
    expect(secondObj.external_references).toHaveLength(0)
  })

  it('returns null for unknown board id', async () => {
    expect(await getBoardWithObjectives(999_999)).toBeNull()
  })

  it('returns board with empty objectives when board has none', async () => {
    const sectionId = await seedSection(pool, 'sec-empty', 'Empty Sec')
    const devTeamId = await seedDevTeam(pool, 'empty-t', 'Empty T', sectionId)
    const {
      rows: [board],
    } = await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, 'Empty', 'tertiary', '2026-01-01', '2026-04-30', 'T1') RETURNING *`,
      [devTeamId],
    )
    const result = await getBoardWithObjectives(board.id)
    expect(result).not.toBeNull()
    expect(result?.objectives).toHaveLength(0)
  })

  it('includes inactive objectives (no filter on is_active)', async () => {
    const { board, obj1 } = await seedFullHierarchy(pool)
    await pool.query('UPDATE board_objectives SET is_active = false WHERE id = $1', [obj1.id])
    const result = await getBoardWithObjectives(board.id)
    expect(result?.objectives).toHaveLength(2)
  })

  it('excludes soft-deleted external references', async () => {
    const { board, obj1, kr1 } = await seedFullHierarchy(pool)
    const ref = await addExternalReference({ ref_type: 'jira', url: 'https://jira/1', key_result_id: kr1.id })
    await pool.query('UPDATE external_references SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2', [
      'test',
      ref.id,
    ])

    const result = await getBoardWithObjectives(board.id)
    const obj = result?.objectives.find((o) => o.id === obj1.id)
    if (!obj) throw new Error('objective not found')
    expect(obj.key_results[0].external_references).toHaveLength(0)
  })
})

describe('getBoardObjectiveProgress', () => {
  it('returns objectives with key result link counts and totals', async () => {
    const sectionId = await seedSection(pool, 'prog-sec', 'Prog Sec')
    const devTeamId = await seedDevTeam(pool, 'prog-team', 'Prog Team', sectionId)
    const {
      rows: [board],
    } = await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, 'Board', 'tertiary', '2026-01-01', '2026-04-30', 'T1') RETURNING *`,
      [devTeamId],
    )
    const {
      rows: [obj],
    } = await pool.query("INSERT INTO board_objectives (board_id, title) VALUES ($1, 'Obj') RETURNING *", [board.id])
    const {
      rows: [kr1],
    } = await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR 1', 0) RETURNING *",
      [obj.id],
    )
    const {
      rows: [kr2],
    } = await pool.query(
      "INSERT INTO board_key_results (objective_id, title, sort_order) VALUES ($1, 'KR 2', 1) RETURNING *",
      [obj.id],
    )

    const appId = await seedApp(pool, { teamSlug: 'prog-team', appName: 'app', environment: 'prod' })
    const dep1 = await seedDeployment(pool, { monitoredAppId: appId, teamSlug: 'prog-team', environment: 'prod' })
    const dep2 = await seedDeployment(pool, { monitoredAppId: appId, teamSlug: 'prog-team', environment: 'prod' })

    // dep1 → kr1, dep2 → kr2
    await pool.query(
      `INSERT INTO deployment_goal_links (deployment_id, key_result_id, link_method)
       VALUES ($1, $2, 'manual'), ($3, $4, 'manual')`,
      [dep1, kr1.id, dep2, kr2.id],
    )

    const result = await getBoardObjectiveProgress(board.id)
    expect(result).toHaveLength(1)
    const progress = result[0]
    expect(progress.objective_id).toBe(obj.id)
    expect(progress.objective_title).toBe('Obj')
    expect(progress.key_results).toHaveLength(2)
    expect(progress.key_results[0].id).toBe(kr1.id)
    expect(progress.key_results[0].linked_deployments).toBe(1)
    expect(progress.key_results[1].id).toBe(kr2.id)
    expect(progress.key_results[1].linked_deployments).toBe(1)
    expect(progress.total_linked_deployments).toBe(2)
  })

  it('counts objective-level links separately from key result links', async () => {
    const sectionId = await seedSection(pool, 'obj-link-sec', 'Sec')
    const devTeamId = await seedDevTeam(pool, 'obj-link-team', 'Team', sectionId)
    const {
      rows: [board],
    } = await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, 'Board', 'tertiary', '2026-01-01', '2026-04-30', 'T1') RETURNING *`,
      [devTeamId],
    )
    const {
      rows: [obj],
    } = await pool.query("INSERT INTO board_objectives (board_id, title) VALUES ($1, 'Obj') RETURNING *", [board.id])
    const {
      rows: [kr],
    } = await pool.query("INSERT INTO board_key_results (objective_id, title) VALUES ($1, 'KR') RETURNING *", [obj.id])

    const appId = await seedApp(pool, { teamSlug: 'obj-link-team', appName: 'app', environment: 'prod' })
    const dep1 = await seedDeployment(pool, { monitoredAppId: appId, teamSlug: 'obj-link-team', environment: 'prod' })
    const dep2 = await seedDeployment(pool, { monitoredAppId: appId, teamSlug: 'obj-link-team', environment: 'prod' })

    // dep1 linked at objective level, dep2 linked at KR level
    await pool.query(
      `INSERT INTO deployment_goal_links (deployment_id, objective_id, link_method) VALUES ($1, $2, 'manual')`,
      [dep1, obj.id],
    )
    await pool.query(
      `INSERT INTO deployment_goal_links (deployment_id, key_result_id, link_method) VALUES ($1, $2, 'manual')`,
      [dep2, kr.id],
    )

    const result = await getBoardObjectiveProgress(board.id)
    expect(result[0].key_results[0].linked_deployments).toBe(1)
    expect(result[0].total_linked_deployments).toBe(2)
  })

  it('returns empty array for board with no objectives', async () => {
    const sectionId = await seedSection(pool, 'no-obj-sec', 'Sec')
    const devTeamId = await seedDevTeam(pool, 'no-obj-team', 'Team', sectionId)
    const {
      rows: [board],
    } = await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, 'Board', 'tertiary', '2026-01-01', '2026-04-30', 'T1') RETURNING *`,
      [devTeamId],
    )
    expect(await getBoardObjectiveProgress(board.id)).toHaveLength(0)
  })

  it('excludes inactive objectives and key results', async () => {
    const { board, obj1, obj2, kr1 } = await seedFullHierarchy(pool)
    await pool.query('UPDATE board_objectives SET is_active = false WHERE id = $1', [obj1.id])
    await pool.query('UPDATE board_key_results SET is_active = false WHERE id = $1', [kr1.id])

    const result = await getBoardObjectiveProgress(board.id)
    expect(result.find((o) => o.objective_id === obj1.id)).toBeUndefined()
    const prog2 = result.find((o) => o.objective_id === obj2.id)
    if (!prog2) throw new Error('obj2 progress not found')
    expect(prog2.key_results.find((k) => k.id === kr1.id)).toBeUndefined()
  })

  it('deduplicates deployment counts when same deployment linked multiple times', async () => {
    const sectionId = await seedSection(pool, 'dedup-sec', 'Sec')
    const devTeamId = await seedDevTeam(pool, 'dedup-team', 'Team', sectionId)
    const {
      rows: [board],
    } = await pool.query(
      `INSERT INTO boards (dev_team_id, title, period_type, period_start, period_end, period_label)
       VALUES ($1, 'Board', 'tertiary', '2026-01-01', '2026-04-30', 'T1') RETURNING *`,
      [devTeamId],
    )
    const {
      rows: [obj],
    } = await pool.query("INSERT INTO board_objectives (board_id, title) VALUES ($1, 'Obj') RETURNING *", [board.id])
    const {
      rows: [kr],
    } = await pool.query("INSERT INTO board_key_results (objective_id, title) VALUES ($1, 'KR') RETURNING *", [obj.id])

    const appId = await seedApp(pool, { teamSlug: 'dedup-team', appName: 'app', environment: 'prod' })
    const dep = await seedDeployment(pool, { monitoredAppId: appId, teamSlug: 'dedup-team', environment: 'prod' })

    // Same deployment linked to same KR (shouldn't normally happen, but DISTINCT should handle it)
    await pool.query(
      `INSERT INTO deployment_goal_links (deployment_id, key_result_id, link_method) VALUES ($1, $2, 'manual')`,
      [dep, kr.id],
    )

    const result = await getBoardObjectiveProgress(board.id)
    expect(result[0].key_results[0].linked_deployments).toBe(1)
    expect(result[0].total_linked_deployments).toBe(1)
  })
})
