/**
 * Graceful shutdown handler
 *
 * Registers SIGTERM/SIGINT handlers that cancel running sync jobs
 * owned by this pod before the process exits.
 */

import { cancelRunningJobsForPod } from '~/db/sync-jobs.server'
import { logger } from '~/lib/logger.server'

const POD_ID = process.env.HOSTNAME || `local-${process.pid}`

let shutdownInProgress = false

async function handleShutdown(signal: string): Promise<void> {
  if (shutdownInProgress) return
  shutdownInProgress = true

  logger.info(`🛑 ${signal} mottatt — starter graceful shutdown for pod ${POD_ID}`)

  try {
    const cancelledCount = await cancelRunningJobsForPod(POD_ID)
    if (cancelledCount > 0) {
      logger.info(`🧹 Kansellerte ${cancelledCount} kjørende jobb(er) for pod ${POD_ID}`)
    } else {
      logger.info(`✅ Ingen kjørende jobber å rydde opp for pod ${POD_ID}`)
    }
  } catch (err) {
    logger.error('❌ Feil under shutdown-cleanup:', err)
  }
}

export function registerShutdownHandlers(): void {
  process.on('SIGTERM', () => handleShutdown('SIGTERM'))
  process.on('SIGINT', () => handleShutdown('SIGINT'))
  logger.info(`🔌 Shutdown-handler registrert for pod ${POD_ID}`)
}
