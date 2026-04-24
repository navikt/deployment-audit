import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createSecurityHeadersMiddleware } from '../security-headers'

function makeApp(opts: { isProd: boolean }) {
  const app = express()
  app.use(createSecurityHeadersMiddleware(opts))
  app.get('/', (_req, res) => {
    // Echo the per-request CSP nonce so tests can compare it with the CSP header.
    res.status(200).json({ cspNonce: res.locals.cspNonce })
  })
  return app
}

function getDirective(csp: string, name: string): string {
  return csp.split(';').find((d) => d.trim().startsWith(`${name} `)) ?? ''
}

describe('createSecurityHeadersMiddleware', () => {
  it('sets all baseline headers in production', async () => {
    const res = await request(makeApp({ isProd: true })).get('/')
    expect(res.status).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/)
    expect(res.headers['strict-transport-security']).toMatch(/includeSubDomains/)
    expect(res.headers['content-security-policy']).toBeDefined()
  })

  it('omits HSTS in development', async () => {
    const res = await request(makeApp({ isProd: false })).get('/')
    expect(res.status).toBe(200)
    expect(res.headers['strict-transport-security']).toBeUndefined()
  })

  it('CSP includes the directives the app requires', async () => {
    const res = await request(makeApp({ isProd: true })).get('/')
    const csp = res.headers['content-security-policy'] as string
    expect(csp).toBeDefined()

    expect(getDirective(csp, 'default-src')).toMatch(/'self'/)
    expect(getDirective(csp, 'script-src')).toMatch(/'self'/)
    expect(getDirective(csp, 'style-src')).toMatch(/'self'.*'unsafe-inline'/)
    expect(getDirective(csp, 'img-src')).toMatch(/'self'.*data:.*https:\/\/avatars\.githubusercontent\.com/)
    expect(getDirective(csp, 'font-src')).toMatch(/'self'.*data:.*https:\/\/cdn\.nav\.no/)
    expect(getDirective(csp, 'connect-src')).toMatch(/'self'/)
    expect(getDirective(csp, 'frame-ancestors')).toMatch(/'none'/)
    expect(getDirective(csp, 'base-uri')).toMatch(/'self'/)
    expect(getDirective(csp, 'form-action')).toMatch(/'self'/)
    expect(getDirective(csp, 'object-src')).toMatch(/'none'/)
  })

  it('CSP forbids inline and eval scripts (no unsafe-inline / unsafe-eval in script-src)', async () => {
    const res = await request(makeApp({ isProd: true })).get('/')
    const csp = res.headers['content-security-policy'] as string
    const scriptSrc = getDirective(csp, 'script-src')
    expect(scriptSrc).not.toMatch(/'unsafe-inline'/)
    expect(scriptSrc).not.toMatch(/'unsafe-eval'/)
  })

  it('CSP includes upgrade-insecure-requests in prod, omits in dev', async () => {
    const prod = await request(makeApp({ isProd: true })).get('/')
    expect(prod.headers['content-security-policy']).toMatch(/upgrade-insecure-requests/)

    const dev = await request(makeApp({ isProd: false })).get('/')
    expect(dev.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/)
  })

  it('does not leak X-Powered-By header', async () => {
    const res = await request(makeApp({ isProd: true })).get('/')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('generates a fresh CSP nonce per request and reflects it in the script-src directive', async () => {
    const app = makeApp({ isProd: true })

    const r1 = await request(app).get('/')
    const r2 = await request(app).get('/')

    const nonce1 = (r1.body as { cspNonce: string }).cspNonce
    const nonce2 = (r2.body as { cspNonce: string }).cspNonce

    expect(nonce1).toBeTruthy()
    expect(nonce2).toBeTruthy()
    expect(nonce1).not.toBe(nonce2)

    const scriptSrc1 = getDirective(r1.headers['content-security-policy'] as string, 'script-src')
    const scriptSrc2 = getDirective(r2.headers['content-security-policy'] as string, 'script-src')
    expect(scriptSrc1).toContain(`'nonce-${nonce1}'`)
    expect(scriptSrc2).toContain(`'nonce-${nonce2}'`)
    expect(scriptSrc1).not.toContain(`'nonce-${nonce2}'`)
  })

  it('CSP nonce has at least 128 bits of entropy (base64-encoded)', async () => {
    const res = await request(makeApp({ isProd: true })).get('/')
    const nonce = (res.body as { cspNonce: string }).cspNonce
    // 16 bytes → base64 length 24 (with padding); we accept anything >= 22
    expect(nonce.length).toBeGreaterThanOrEqual(22)
    // Must be base64-y so it's safe to embed as `'nonce-…'` in the CSP header
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })
})
