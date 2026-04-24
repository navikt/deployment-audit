import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Server / client import boundary guard.
 *
 * `.server.ts` files contain server-only code (DB access, secrets, Node-only
 * APIs like `node:async_hooks`, `pg`, `@slack/bolt`). When such code is pulled
 * into the client bundle (Storybook, browser bundle), the build either fails
 * (e.g. `AsyncLocalStorage is not exported by __vite-browser-external`) or —
 * worse — leaks server-only deps to the browser.
 *
 * This test starts from all client-bundled entry points (stories, components,
 * hooks, fixtures) and follows every non-type import transitively. It fails if
 * any path reaches a `.server.ts` file — including indirect paths via barrels
 * such as `~/lib/slack` re-exporting `client.server.ts`.
 */

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..')
const appDir = join(repoRoot, 'app')

interface ImportLine {
  line: number
  isTypeOnly: boolean
  source: string
}

const importCache = new Map<string, ImportLine[]>()

function parseImports(filePath: string): ImportLine[] {
  const cached = importCache.get(filePath)
  if (cached) return cached
  const result = parseImportsFromText(readFileSync(filePath, 'utf-8'))
  importCache.set(filePath, result)
  return result
}

function parseImportsFromText(text: string): ImportLine[] {
  const lines = text.split('\n')
  const out: ImportLine[] = []
  let buffer = ''
  let bufStart = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isStartOfStatement = /^\s*(?:import|export)\b/.test(line)
    if (!buffer && !isStartOfStatement) continue
    // If a new import/export starts while a previous buffer is still open
    // (e.g. a bare `export type { X }` with no `from`), discard the stale
    // buffer so we don't pollute the next statement's classification.
    if (buffer && isStartOfStatement) {
      buffer = ''
      bufStart = i
    }
    if (!buffer) bufStart = i
    buffer += `${line}\n`
    if (/from\s*['"][^'"]+['"]/.test(buffer) || /^\s*import\s*['"][^'"]+['"]/.test(buffer)) {
      const fromMatch = buffer.match(/from\s*['"]([^'"]+)['"]/)
      const sideMatch = !fromMatch ? buffer.match(/^\s*import\s*['"]([^'"]+)['"]/) : null
      const source = fromMatch?.[1] ?? sideMatch?.[1] ?? null
      if (source) {
        // Type-only forms: `import type ...`, `export type ...`,
        // and inline `import { type X, type Y } from ...` where ALL specifiers are type-only.
        const isFullTypeOnly = /^\s*(?:import|export)\s+type\b/.test(buffer)
        const inlineSpecifierBlock = buffer.match(/\{([^}]*)\}/)?.[1] ?? ''
        const specifiers = inlineSpecifierBlock
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const allInlineType = specifiers.length > 0 && specifiers.every((s) => /^type\s+/.test(s))
        out.push({ line: bufStart + 1, isTypeOnly: isFullTypeOnly || allInlineType, source })
      }
      buffer = ''
    }
  }
  return out
}

const exts = ['.ts', '.tsx', '.js', '.jsx']

function resolveImport(source: string, fromFile: string): string | null {
  // External module — skip.
  if (!source.startsWith('.') && !source.startsWith('~')) return null
  // CSS / asset — skip.
  if (/\.(css|svg|png|jpg|jpeg|gif|webp|json)(\?.*)?$/.test(source)) return null

  const base = source.startsWith('~/') ? join(appDir, source.slice(2)) : resolve(dirname(fromFile), source)

  // Try direct file with extensions.
  for (const ext of exts) {
    if (existsSync(base + ext)) return base + ext
  }
  // Try as directory with index file.
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of exts) {
      const idx = join(base, `index${ext}`)
      if (existsSync(idx)) return idx
    }
  }
  // Direct file with extension already in source.
  if (existsSync(base) && statSync(base).isFile()) return base
  return null
}

const SERVER_RE = /\.server\.[jt]sx?$/

interface PathStep {
  file: string
  via: string
}

function findServerLeak(entry: string, visited = new Set<string>(), trail: PathStep[] = []): PathStep[] | null {
  if (visited.has(entry)) return null
  visited.add(entry)
  if (SERVER_RE.test(entry)) return trail
  let imports: ImportLine[]
  try {
    imports = parseImports(entry)
  } catch {
    return null
  }
  for (const imp of imports) {
    if (imp.isTypeOnly) continue
    const resolved = resolveImport(imp.source, entry)
    if (!resolved) continue
    const nextTrail = [...trail, { file: resolved, via: `${relative(repoRoot, entry)}:${imp.line}` }]
    if (SERVER_RE.test(resolved)) return nextTrail
    const found = findServerLeak(resolved, visited, nextTrail)
    if (found) return found
  }
  return null
}

function walkClientEntries(dir: string, out: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      // Skip generated typegen output and node_modules just in case.
      if (e.name === 'node_modules' || e.name.startsWith('+types')) continue
      walkClientEntries(full, out)
      continue
    }
    if (!e.isFile()) continue
    if (!/\.(ts|tsx)$/.test(e.name)) continue
    const rel = relative(appDir, full).replaceAll('\\', '/')
    const isClientBundled =
      rel.startsWith('components/') ||
      rel.startsWith('hooks/') ||
      rel.includes('/__stories__/') ||
      rel.includes('/__fixtures__/')
    if (isClientBundled) out.push(full)
  }
  return out
}

describe('server-import boundary', () => {
  describe('parser regression cases', () => {
    it('treats `import type { X } from` as type-only', () => {
      const out = parseImportsFromText(`import type { X } from './a'\n`)
      expect(out).toEqual([{ line: 1, isTypeOnly: true, source: './a' }])
    })

    it('treats inline-all-type specifiers as type-only', () => {
      const out = parseImportsFromText(`import { type A, type B } from './a'\n`)
      expect(out[0]?.isTypeOnly).toBe(true)
    })

    it('treats mixed inline specifiers as non-type-only', () => {
      const out = parseImportsFromText(`import { type A, b } from './a'\n`)
      expect(out[0]?.isTypeOnly).toBe(false)
    })

    it('does not let a bare `export type { X }` (no `from`) pollute the next import', () => {
      // Regression: the parser used to start a buffer on `export type` and
      // never reset it because there was no `from`. The next import would be
      // appended to the buffer and misclassified as type-only.
      const text = `export type { Local }\nimport { leaked } from './server-stuff'\n`
      const out = parseImportsFromText(text)
      const leaked = out.find((i) => i.source === './server-stuff')
      expect(leaked, 'value import after a bare `export type` block must still be visible').toBeDefined()
      expect(leaked?.isTypeOnly).toBe(false)
    })

    it('handles multi-line import statements', () => {
      const text = `import {\n  a,\n  b,\n} from './x'\n`
      const out = parseImportsFromText(text)
      expect(out).toEqual([{ line: 1, isTypeOnly: false, source: './x' }])
    })
  })

  it('client-bundled files do not transitively import any `.server` module', () => {
    const entries = walkClientEntries(appDir)
    expect(entries.length, 'expected to discover at least some client-bundled entry files').toBeGreaterThan(0)

    const offenders: string[] = []
    for (const entry of entries) {
      // Each entry gets its own visited set so we can find the shortest leak path per entry.
      const leak = findServerLeak(entry)
      if (leak) {
        const trail = leak.map((s) => `  ${s.via}`).join('\n')
        offenders.push(
          `${relative(repoRoot, entry)} reaches ${relative(repoRoot, leak[leak.length - 1].file)}:\n${trail}`,
        )
      }
    }
    expect(
      offenders,
      `Client-bundled files must not reach server-only modules (directly or via barrel re-exports):\n\n${offenders.join('\n\n')}`,
    ).toEqual([])
  })
})
