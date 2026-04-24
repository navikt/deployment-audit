import crypto from 'node:crypto'
import type express from 'express'
import helmet from 'helmet'

declare module 'express-serve-static-core' {
  interface Locals {
    cspNonce?: string
  }
}

/**
 * Generate a fresh base64 nonce for each request.
 * 128 bits of entropy is the OWASP CSP nonce recommendation.
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64')
}

/**
 * Security headers middleware built on `helmet`, with a per-request CSP nonce.
 *
 * CSP is configured for an Aksel + React Router 7 SSR app:
 * - `script-src 'self' 'nonce-…'` — React Router 7 emits inline scripts for hydration
 *   context and the route module manifest. They MUST carry the nonce or the app will
 *   render a static shell and fail to hydrate. The nonce is generated per request and
 *   propagated to the React tree via `loadContext.cspNonce`.
 * - `style-src 'self' 'unsafe-inline'` — Aksel components and React's SSR style hoisting
 *   emit inline `<style>` tags. Using nonces here is possible but currently impractical
 *   because Aksel does not yet accept a nonce prop.
 * - `img-src 'self' data: https://avatars.githubusercontent.com` — GitHub avatars are
 *   rendered inline; `data:` covers Aksel's inline SVGs and theme cookies.
 * - `font-src 'self' data: https://cdn.nav.no` — Aksel's `@navikt/ds-css` loads Source
 *   Sans 3 from `https://cdn.nav.no/aksel/fonts/...`.
 * - `connect-src 'self'` — only the app itself; widen if we ever add direct
 *   browser→external API calls.
 * - `frame-ancestors 'none'` — clickjacking protection (equivalent to X-Frame-Options DENY).
 *
 * HSTS is only meaningful over HTTPS. Production traffic terminates TLS at the Nais
 * gateway, so we enable a 1-year max-age + includeSubDomains there. Dev gets HSTS
 * disabled so curl/localhost don't get sticky upgrades.
 */
export function createSecurityHeadersMiddleware(opts: { isProd: boolean }): express.RequestHandler {
  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as express.Response).locals.cspNonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:', 'https://cdn.nav.no'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: opts.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: opts.isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: false } : false,
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
  })

  return function securityHeaders(req, res, next) {
    res.locals.cspNonce = generateNonce()
    helmetMiddleware(req, res, next)
  }
}
