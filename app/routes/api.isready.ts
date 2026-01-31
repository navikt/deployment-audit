import { query } from '~/db/connection.server'

export async function loader() {
  try {
    // Check database connectivity
    await query('SELECT 1')
    return new Response('OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (error) {
    console.error('Readiness check failed:', error)
    return new Response('Database connection failed', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
