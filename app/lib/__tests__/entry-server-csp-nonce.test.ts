import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * React DOM's `renderToPipeableStream` emits its own inline `<script>` tags as
 * part of streaming SSR — most notably the Suspense boundary runtime
 * (`$RC=...`) that resolves boundaries on the client. Those scripts are NOT
 * the ones rendered by React Router's `<Scripts>` component, so passing
 * `nonce` only to `<ServerRouter>` is not enough.
 *
 * If `renderToPipeableStream` isn't given a `nonce` option, the React-emitted
 * inline scripts ship without a `nonce` attribute and a strict CSP
 * (`script-src 'self' 'nonce-…'`) blocks them in the browser:
 *
 *   Refused to execute a script because its hash, its nonce, or 'unsafe-inline'
 *   does not appear in the script-src directive of the Content Security Policy.
 *
 * This test pins the requirement that the same `loadContext.cspNonce` is
 * forwarded to the React DOM renderer, and would have caught the regression.
 */
describe('entry.server.tsx CSP nonce wiring', () => {
  const entryServerPath = path.resolve(__dirname, '../../entry.server.tsx')
  const source = readFileSync(entryServerPath, 'utf-8')

  it('passes loadContext.cspNonce to renderToPipeableStream so React-emitted inline scripts get a nonce', () => {
    expect(/renderToPipeableStream/.test(source), 'renderToPipeableStream call not found in entry.server.tsx').toBe(
      true,
    )

    // The options object passed to renderToPipeableStream must contain
    // `nonce: loadContext.cspNonce`. We assert the literal pairing exists in
    // the file rather than parsing the call arguments — JSX + multiple nested
    // function bodies make balanced-paren matching with regex unreliable.
    expect(
      /\bnonce\s*:\s*loadContext\.cspNonce\b/.test(source),
      'renderToPipeableStream options must include `nonce: loadContext.cspNonce` so React DOM stamps its streaming inline scripts with the CSP nonce. Without it, browsers will block the Suspense boundary runtime.',
    ).toBe(true)
  })

  it('still passes nonce to <ServerRouter> for React Router-emitted scripts', () => {
    expect(
      /<ServerRouter[\s\S]*nonce=\{loadContext\.cspNonce\}/.test(source),
      '<ServerRouter nonce={loadContext.cspNonce} /> is required so React Router’s own inline scripts (context + manifest) carry the nonce.',
    ).toBe(true)
  })
})
