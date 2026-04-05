import { describe, expect, it } from 'vitest'
import { mergeWithCurrentDeploy, type NearbyDeploy } from '../nearby-deploys'

describe('mergeWithCurrentDeploy', () => {
  const currentDeploy: NearbyDeploy = {
    id: 10449,
    commit_sha: 'ec3489c',
    created_at: '2026-02-19T07:52:00.000Z',
    four_eyes_status: 'error',
    deployer_username: 'gardsabo',
  }

  it('inserts current deploy in correct chronological position', () => {
    const nearby: NearbyDeploy[] = [
      {
        id: 10448,
        commit_sha: '2271762',
        created_at: '2026-02-19T07:38:32.000Z',
        four_eyes_status: 'approved',
        deployer_username: 'ingleivj',
      },
      {
        id: 10450,
        commit_sha: 'ab169e8',
        created_at: '2026-02-19T07:46:34.000Z',
        four_eyes_status: 'approved',
        deployer_username: 'gardsabo',
      },
      {
        id: 10451,
        commit_sha: '5a6ae0f',
        created_at: '2026-02-19T08:05:15.000Z',
        four_eyes_status: 'approved',
        deployer_username: 'kmork',
      },
    ]

    const result = mergeWithCurrentDeploy(nearby, currentDeploy)

    expect(result).toHaveLength(4)
    expect(result.map((r) => r.id)).toEqual([10448, 10450, 10449, 10451])
    expect(result[2].isCurrent).toBe(true)
  })

  it('marks only the current deploy with isCurrent=true', () => {
    const nearby: NearbyDeploy[] = [
      {
        id: 10448,
        commit_sha: '2271762',
        created_at: '2026-02-19T07:38:32.000Z',
        four_eyes_status: 'approved',
        deployer_username: 'ingleivj',
      },
    ]

    const result = mergeWithCurrentDeploy(nearby, currentDeploy)

    const currentEntries = result.filter((r) => r.isCurrent)
    const otherEntries = result.filter((r) => !r.isCurrent)
    expect(currentEntries).toHaveLength(1)
    expect(currentEntries[0].id).toBe(10449)
    expect(otherEntries).toHaveLength(1)
    expect(otherEntries[0].isCurrent).toBe(false)
  })

  it('handles current deploy being the earliest', () => {
    const early: NearbyDeploy = { ...currentDeploy, created_at: '2026-02-19T07:00:00.000Z' }
    const nearby: NearbyDeploy[] = [
      {
        id: 10450,
        commit_sha: 'ab169e8',
        created_at: '2026-02-19T07:46:34.000Z',
        four_eyes_status: 'approved',
        deployer_username: 'gardsabo',
      },
    ]

    const result = mergeWithCurrentDeploy(nearby, early)

    expect(result[0].id).toBe(10449)
    expect(result[0].isCurrent).toBe(true)
  })

  it('handles current deploy being the latest', () => {
    const late: NearbyDeploy = { ...currentDeploy, created_at: '2026-02-19T09:30:00.000Z' }
    const nearby: NearbyDeploy[] = [
      {
        id: 10450,
        commit_sha: 'ab169e8',
        created_at: '2026-02-19T07:46:34.000Z',
        four_eyes_status: 'approved',
        deployer_username: 'gardsabo',
      },
    ]

    const result = mergeWithCurrentDeploy(nearby, late)

    expect(result[1].id).toBe(10449)
    expect(result[1].isCurrent).toBe(true)
  })

  it('works with empty nearby list', () => {
    const result = mergeWithCurrentDeploy([], currentDeploy)

    expect(result).toHaveLength(1)
    expect(result[0].isCurrent).toBe(true)
    expect(result[0].id).toBe(10449)
  })

  it('does not mutate input arrays', () => {
    const nearby: NearbyDeploy[] = [
      {
        id: 10448,
        commit_sha: '2271762',
        created_at: '2026-02-19T07:38:32.000Z',
        four_eyes_status: 'approved',
        deployer_username: 'ingleivj',
      },
    ]
    const originalLength = nearby.length

    mergeWithCurrentDeploy(nearby, currentDeploy)

    expect(nearby).toHaveLength(originalLength)
    expect('isCurrent' in nearby[0]).toBe(false)
  })
})
