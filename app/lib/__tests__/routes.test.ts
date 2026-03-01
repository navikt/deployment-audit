import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import routes from '../../routes'

const appDir = resolve(__dirname, '../..')

function flattenRoutes(routeConfigs: typeof routes): { path: string | undefined; file: string }[] {
  const result: { path: string | undefined; file: string }[] = []
  for (const r of routeConfigs) {
    const entry = r as { path?: string; file?: string; children?: typeof routes }
    if (entry.file) {
      result.push({ path: entry.path, file: entry.file })
    }
    if (entry.children) {
      result.push(...flattenRoutes(entry.children))
    }
  }
  return result
}

const allRoutes = flattenRoutes(routes)

describe('Route configuration', () => {
  it('has routes defined', () => {
    expect(allRoutes.length).toBeGreaterThan(0)
  })

  describe('all route files exist on disk', () => {
    for (const r of allRoutes) {
      it(`${r.file}`, () => {
        const filePath = resolve(appDir, r.file)
        expect(existsSync(filePath)).toBe(true)
      })
    }
  })

  describe('all route files export a default or loader/action', () => {
    for (const r of allRoutes) {
      it(`${r.file} has exports`, async () => {
        const mod = await import(resolve(appDir, r.file))
        const hasDefault = 'default' in mod
        const hasLoader = 'loader' in mod
        const hasAction = 'action' in mod
        expect(hasDefault || hasLoader || hasAction).toBe(true)
      })
    }
  })

  describe('no duplicate URL paths', () => {
    const pathRoutes = allRoutes.filter((r) => r.path !== undefined)
    const paths = pathRoutes.map((r) => r.path)

    it('all paths are unique', () => {
      const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i)
      expect(duplicates).toEqual([])
    })
  })

  describe('route file organization', () => {
    it('API routes are in api/ directory', () => {
      const apiRoutes = allRoutes.filter((r) => r.path?.startsWith('api/'))
      for (const r of apiRoutes) {
        expect(r.file).toMatch(/^routes\/api\//)
      }
    })

    it('admin routes are in admin/ directory', () => {
      const adminRoutes = allRoutes.filter((r) => r.path?.startsWith('admin') && r.path !== undefined)
      for (const r of adminRoutes) {
        expect(r.file).toMatch(/^routes\/admin\//)
      }
    })

    it('team routes are in team/ directory', () => {
      const teamRoutes = allRoutes.filter((r) => r.path?.startsWith('team/'))
      for (const r of teamRoutes) {
        expect(r.file).toMatch(/^routes\/team\//)
      }
    })

    it('deployment routes are in deployments/ directory', () => {
      const depRoutes = allRoutes.filter((r) => r.path?.startsWith('deployments/') && !r.path?.startsWith('team/'))
      for (const r of depRoutes) {
        expect(r.file).toMatch(/^routes\/deployments\//)
      }
    })

    it('user routes are in users/ directory', () => {
      const userRoutes = allRoutes.filter((r) => r.path?.startsWith('users/'))
      for (const r of userRoutes) {
        expect(r.file).toMatch(/^routes\/users\//)
      }
    })
  })
})
