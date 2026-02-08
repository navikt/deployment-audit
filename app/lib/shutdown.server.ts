/**
 * Graceful shutdown handler
 *
 * Registers SIGTERM/SIGINT handlers that cancel running sync jobs
 * owned by this pod before the process exits.
 */

import { cancelRunningJobsForPod } from '~/db/sync-jobs.server'

const POD_ID = process.env.HOSTNAME || `local-${process.pid}`

let shutdownInProgress = false

async function handleShutdown(signal: string): Promise<void> {
  if (shutdownInProgress) return
  shutdownInProgress = true

  console.log(`🛑 ${signal} mottatt — starter graceful shutdown for pod ${POD_ID}`)

  try {
    const cancelledCount = await cancelRunningJobsForPod(POD_ID)
    if (cancelledCount > 0) {
      console.log(`🧹 Kansellerte ${cancelledCount} kjørende jobb(er) for pod ${POD_ID}`)
    } else {
      console.log(`✅ Ingen kjørende jobber å rydde opp for pod ${POD_ID}`)
    }
  } catch (err) {
    console.error('❌ Feil under shutdown-cleanup:', err)
  }
}

export function registerShutdownHandlers(): void {
  process.on('SIGTERM', () => handleShutdown('SIGTERM'))
  process.on('SIGINT', () => handleShutdown('SIGINT'))
  console.log(`🔌 Shutdown-handler registrert for pod ${POD_ID}`)
}
