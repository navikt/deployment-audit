/**
 * Express authentication middleware.
 *
 * Validates JWT tokens on all incoming requests except health-check probes
 * and M2M routes (which carry their own authentication).
 *
 * - Health checks (/api/isalive, /api/isready): pass through (Kubernetes probes)
 * - M2M routes (/api/v1/*): pass through (validated by route handler via introspection)
 * - Browser requests without valid token: redirect to Wonderwall login proxy
 * - API requests without valid token: 401 Unauthorized
 * - Development without NAIS cluster: pass through (uses dev identity fallback)
 */

import type { NextFunction, Request, Response } from 'express'
import * as jose from 'jose'

const PUBLIC_PATHS = ['/api/isalive', '/api/isready']
const SELF_AUTHENTICATED_PREFIXES = ['/api/v1/']

let jwksCache: jose.JWTVerifyGetKey | null = null
let jwksCacheCreatedAt = 0
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000

async function getJwks(jwksUri: string): Promise<jose.JWTVerifyGetKey> {
  const now = Date.now()
  if (jwksCache && now - jwksCacheCreatedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache
  }
  jwksCache = jose.createRemoteJWKSet(new URL(jwksUri))
  jwksCacheCreatedAt = now
  return jwksCache
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null
  const match = header.match(/^bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

function isBrowserRequest(req: Request): boolean {
  const accept = req.headers.accept ?? ''
  return accept.includes('text/html')
}

function denyAccess(req: Request, res: Response): void {
  if (isBrowserRequest(req)) {
    const redirectTarget = encodeURIComponent(req.originalUrl)
    res.redirect(302, `/oauth2/login?redirect=${redirectTarget}`)
    return
  }
  res.status(401).json({ error: 'Unauthorized' })
}

export function createAuthMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (PUBLIC_PATHS.includes(req.path)) {
      next()
      return
    }

    if (SELF_AUTHENTICATED_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      next()
      return
    }

    // In local development without NAIS cluster, skip auth
    if (process.env.NODE_ENV === 'development' && !process.env.NAIS_CLUSTER_NAME) {
      next()
      return
    }

    const jwksUri = process.env.AZURE_OPENID_CONFIG_JWKS_URI
    const issuer = process.env.AZURE_OPENID_CONFIG_ISSUER
    const audience = process.env.AZURE_APP_CLIENT_ID

    if (!jwksUri || !issuer || !audience) {
      denyAccess(req, res)
      return
    }

    const token = extractBearerToken(req.headers.authorization)
    if (!token) {
      denyAccess(req, res)
      return
    }

    try {
      const jwks = await getJwks(jwksUri)
      const { payload } = await jose.jwtVerify(token, jwks, { issuer, audience })

      // Reject machine-to-machine tokens on non-M2M routes (defense-in-depth).
      // App tokens from client_credentials flow have idtyp="app".
      // M2M routes (/api/v1/*) are already skipped above and handle their own auth.
      if (payload.idtyp === 'app') {
        denyAccess(req, res)
        return
      }

      next()
    } catch {
      denyAccess(req, res)
    }
  }
}

/** Clear JWKS cache — exposed for testing */
export function _clearJwksCache(): void {
  jwksCache = null
  jwksCacheCreatedAt = 0
}

export { PUBLIC_PATHS, SELF_AUTHENTICATED_PREFIXES }
