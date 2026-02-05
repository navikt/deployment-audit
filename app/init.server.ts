/**
 * Server-side initialization module
 * This is imported from root.tsx and runs once when the server starts
 */

import { isSlackConfigured, startSlackConnection } from './lib/slack.server'
import { startPeriodicSync } from './lib/sync.server'

let initialized = false

export function initializeServer(): void {
  if (initialized) return
  initialized = true

  // Only start periodic sync in production or when explicitly enabled
  const enablePeriodicSync = process.env.ENABLE_PERIODIC_SYNC === 'true' || process.env.NODE_ENV === 'production'

  if (enablePeriodicSync) {
    console.log('🚀 Initializing server-side services...')
    startPeriodicSync()
  } else {
    console.log('⏸️ Periodic sync disabled (set ENABLE_PERIODIC_SYNC=true to enable)')
  }

  // Start Slack connection if configured
  if (isSlackConfigured()) {
    console.log('🔌 Starting Slack Socket Mode connection...')
    startSlackConnection().catch((err) => {
      console.error('Failed to start Slack connection:', err)
    })
  } else {
    console.log('💬 Slack not configured (set SLACK_BOT_TOKEN and SLACK_APP_TOKEN to enable)')
  }
}
