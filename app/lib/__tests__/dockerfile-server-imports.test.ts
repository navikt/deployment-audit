import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Dockerfile compiles a fixed set of root TypeScript files (server.ts and
 * any helpers it imports) with `tsc` and copies the resulting `.js` artifacts
 * into the runtime image. Files that aren't in that list never get a `.js`
 * sibling, and the production server crashes at startup with
 * `ERR_MODULE_NOT_FOUND` when it tries to import them.
 *
 * This test parses the Dockerfile to discover which files are compiled+copied,
 * then walks the relative-import graph from `server.ts` to assert every
 * transitively-imported source file is part of that set. It catches regressions
 * like importing a new helper into `server.ts` without updating the Dockerfile.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

function readDockerfile(): string {
  return readFileSync(path.join(REPO_ROOT, 'Dockerfile'), 'utf-8')
}

/** Parse the `RUN pnpm exec tsc <files...>` lines and collect every TS file passed to tsc. */
function getCompiledTsFiles(dockerfile: string): Set<string> {
  const compiled = new Set<string>()
  const tscRunLines = dockerfile.match(/RUN pnpm exec tsc[^\n]*/g) ?? []
  for (const line of tscRunLines) {
    // Split off "RUN pnpm exec tsc" and any trailing flags; collect tokens that look like .ts paths.
    const tokens = line.split(/\s+/)
    for (const token of tokens) {
      if (token.endsWith('.ts')) {
        compiled.add(path.normalize(token))
      }
    }
  }
  return compiled
}

/** Parse `COPY --from=builder /app/<src> <dst>` lines and collect every source path copied. */
function getCopiedPaths(dockerfile: string): string[] {
  const copied: string[] = []
  const copyLines = dockerfile.match(/COPY --from=builder \/app\/[^\s]+/g) ?? []
  for (const line of copyLines) {
    const m = line.match(/COPY --from=builder \/app\/(\S+)/)
    if (m) copied.push(path.normalize(m[1]))
  }
  return copied
}

/**
 * Extract relative `import ... from './...'` and `from '../...'` specifiers.
 * Only relative imports matter — bare specifiers come from node_modules.
 */
function extractRelativeImports(source: string): string[] {
  const out: string[] = []
  const re = /^\s*import\s+[^'"\n]+from\s+['"](\.[^'"\n]+)['"]/gm
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(source)) !== null) {
    out.push(m[1])
  }
  return out
}

/** Resolve a `./foo.js` import (NodeNext style) back to the `.ts` source on disk, relative to repo root. */
function resolveImportToTsFile(fromFile: string, importSpec: string): string | null {
  const fromDir = path.dirname(path.join(REPO_ROOT, fromFile))
  const resolvedJs = path.resolve(fromDir, importSpec)
  // Try .ts, .tsx, /index.ts
  for (const ext of ['.ts', '.tsx']) {
    const tsCandidate = resolvedJs.replace(/\.js$/, ext)
    if (existsSync(tsCandidate)) {
      return path.relative(REPO_ROOT, tsCandidate)
    }
  }
  const indexCandidate = path.join(resolvedJs.replace(/\.js$/, ''), 'index.ts')
  if (existsSync(indexCandidate)) {
    return path.relative(REPO_ROOT, indexCandidate)
  }
  return null
}

/** Walk the relative-import graph starting from the given entry files. */
function collectRelativeImportClosure(entries: string[]): Set<string> {
  const visited = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.shift()
    if (!file || visited.has(file)) continue
    visited.add(file)
    const fullPath = path.join(REPO_ROOT, file)
    if (!existsSync(fullPath)) continue
    const source = readFileSync(fullPath, 'utf-8')
    for (const spec of extractRelativeImports(source)) {
      const resolved = resolveImportToTsFile(file, spec)
      if (resolved && !visited.has(resolved)) queue.push(resolved)
    }
  }
  return visited
}

describe('Dockerfile server import graph', () => {
  it('compiles every TS file that server.ts imports (transitively, via relative paths)', () => {
    const dockerfile = readDockerfile()
    const compiled = getCompiledTsFiles(dockerfile)
    const copied = getCopiedPaths(dockerfile)

    // Sanity check: server.ts is compiled.
    expect(compiled.has('server.ts')).toBe(true)

    const closure = collectRelativeImportClosure(['server.ts'])

    const missing: string[] = []
    for (const file of closure) {
      if (compiled.has(file)) continue
      // Files under app/ that the build pipeline copies wholesale (e.g. app/db/migrations) are fine.
      const isInsideCopiedDir = copied.some((c) => file === c || file.startsWith(`${c}${path.sep}`))
      if (isInsideCopiedDir) continue
      missing.push(file)
    }

    expect(
      missing,
      `Server imports the following TS files but the Dockerfile neither compiles them with tsc nor copies them into the runtime image. They will fail at runtime with ERR_MODULE_NOT_FOUND:\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('copies every compiled .js artifact into the runtime image', () => {
    const dockerfile = readDockerfile()
    const compiled = getCompiledTsFiles(dockerfile)
    const copied = new Set(getCopiedPaths(dockerfile))

    const missing: string[] = []
    for (const tsFile of compiled) {
      const jsFile = tsFile.replace(/\.ts$/, '.js')
      // Either the .js file itself is COPY'd, or it lives under a directory that's COPY'd.
      const isCopied = copied.has(jsFile) || [...copied].some((c) => jsFile.startsWith(`${c}${path.sep}`))
      if (!isCopied) missing.push(jsFile)
    }

    expect(missing, `Compiled but not copied into runtime image:\n${missing.join('\n')}`).toEqual([])
  })
})
