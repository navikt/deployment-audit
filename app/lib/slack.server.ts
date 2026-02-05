/**
 * Slack Integration using Bolt.js with Socket Mode
 *
 * Provides functionality for:
 * - Sending deployment notifications to Slack channels
 * - Interactive buttons for approval/rejection
 * - Updating messages when deployment status changes
 *
 * Environment variables:
 * - SLACK_BOT_TOKEN: Bot User OAuth Token (xoxb-...)
 * - SLACK_APP_TOKEN: App-Level Token for Socket Mode (xapp-...)
 * - SLACK_CHANNEL_ID: Default channel for notifications
 */

import { App, type BlockAction, LogLevel } from '@slack/bolt'
import type { KnownBlock } from '@slack/types'

// Singleton Slack app instance
let slackApp: App | null = null
let isConnected = false

/**
 * Check if Slack integration is configured
 */
export function isSlackConfigured(): boolean {
  return !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN)
}

/**
 * Get or initialize the Slack app instance
 */
export function getSlackApp(): App | null {
  if (!isSlackConfigured()) {
    return null
  }

  if (!slackApp) {
    slackApp = new App({
      token: process.env.SLACK_BOT_TOKEN,
      appToken: process.env.SLACK_APP_TOKEN,
      socketMode: true,
      logLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
    })

    // Register action handlers
    registerActionHandlers(slackApp)
  }

  return slackApp
}

/**
 * Start the Slack Socket Mode connection
 * Should be called once at app startup
 */
export async function startSlackConnection(): Promise<void> {
  if (isConnected) return

  const app = getSlackApp()
  if (!app) {
    console.log('Slack not configured, skipping connection')
    return
  }

  try {
    await app.start()
    isConnected = true
    console.log('✅ Slack Socket Mode connection established')
  } catch (error) {
    console.error('❌ Failed to start Slack connection:', error)
  }
}

/**
 * Stop the Slack connection
 */
export async function stopSlackConnection(): Promise<void> {
  if (!isConnected || !slackApp) return

  try {
    await slackApp.stop()
    isConnected = false
    console.log('Slack connection stopped')
  } catch (error) {
    console.error('Failed to stop Slack connection:', error)
  }
}

// Types for deployment notification
export interface DeploymentNotification {
  deploymentId: number
  appName: string
  environmentName: string
  teamSlug: string
  commitSha: string
  commitMessage?: string
  deployerName: string
  deployerUsername: string
  prNumber?: number
  prUrl?: string
  status: 'unverified' | 'pending_approval' | 'approved' | 'rejected'
  detailsUrl: string
}

/**
 * Send a deployment notification to Slack
 * Returns the message timestamp (ts) for later updates
 */
export async function sendDeploymentNotification(
  notification: DeploymentNotification,
  channelId?: string,
): Promise<string | null> {
  const app = getSlackApp()
  if (!app) {
    console.log('Slack not configured, skipping notification')
    return null
  }

  const channel = channelId || process.env.SLACK_CHANNEL_ID
  if (!channel) {
    console.error('No Slack channel configured')
    return null
  }

  const blocks = buildDeploymentBlocks(notification)

  try {
    const result = await app.client.chat.postMessage({
      channel,
      blocks: blocks as KnownBlock[],
      text: `${getStatusEmoji(notification.status)} Deployment: ${notification.appName} (${notification.environmentName})`,
    })

    return result.ts || null
  } catch (error) {
    console.error('Failed to send Slack notification:', error)
    return null
  }
}

/**
 * Update an existing deployment notification
 */
export async function updateDeploymentNotification(
  messageTs: string,
  notification: DeploymentNotification,
  channelId?: string,
): Promise<boolean> {
  const app = getSlackApp()
  if (!app) return false

  const channel = channelId || process.env.SLACK_CHANNEL_ID
  if (!channel) return false

  const blocks = buildDeploymentBlocks(notification)

  try {
    await app.client.chat.update({
      channel,
      ts: messageTs,
      blocks: blocks as KnownBlock[],
      text: `${getStatusEmoji(notification.status)} Deployment: ${notification.appName} (${notification.environmentName})`,
    })
    return true
  } catch (error) {
    console.error('Failed to update Slack notification:', error)
    return false
  }
}

/**
 * Get emoji for deployment status
 */
function getStatusEmoji(status: DeploymentNotification['status']): string {
  switch (status) {
    case 'unverified':
      return '⚠️'
    case 'pending_approval':
      return '⏳'
    case 'approved':
      return '✅'
    case 'rejected':
      return '❌'
    default:
      return '📦'
  }
}

/**
 * Get status text
 */
function getStatusText(status: DeploymentNotification['status']): string {
  switch (status) {
    case 'unverified':
      return 'Uverifisert'
    case 'pending_approval':
      return 'Venter på godkjenning'
    case 'approved':
      return 'Godkjent'
    case 'rejected':
      return 'Avvist'
    default:
      return 'Ukjent'
  }
}

/**
 * Build Slack Block Kit blocks for deployment notification
 */
function buildDeploymentBlocks(notification: DeploymentNotification): KnownBlock[] {
  const shortSha = notification.commitSha.substring(0, 7)
  const statusEmoji = getStatusEmoji(notification.status)
  const statusText = getStatusText(notification.status)

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${statusEmoji} Deployment krever oppmerksomhet`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*App:*\n${notification.appName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Miljø:*\n${notification.environmentName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Commit:*\n\`${shortSha}\``,
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${statusText}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Deployer:*\n${notification.deployerName}`,
        },
        {
          type: 'mrkdwn',
          text: notification.prNumber ? `*PR:*\n<${notification.prUrl}|#${notification.prNumber}>` : '*PR:*\nIngen',
        },
      ],
    },
  ]

  // Add commit message if available
  if (notification.commitMessage) {
    const truncatedMessage =
      notification.commitMessage.length > 100
        ? `${notification.commitMessage.substring(0, 100)}...`
        : notification.commitMessage
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Melding:*\n${truncatedMessage}`,
      },
    })
  }

  // Add action buttons based on status
  if (notification.status === 'unverified' || notification.status === 'pending_approval') {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Godkjenn',
            emoji: true,
          },
          style: 'primary',
          action_id: 'approve_deployment',
          value: JSON.stringify({
            deploymentId: notification.deploymentId,
            appName: notification.appName,
          }),
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔍 Se detaljer',
            emoji: true,
          },
          action_id: 'view_details',
          url: notification.detailsUrl,
        },
      ],
    })
  } else {
    // Just show details button for approved/rejected
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔍 Se detaljer',
            emoji: true,
          },
          action_id: 'view_details',
          url: notification.detailsUrl,
        },
      ],
    })
  }

  // Add context with timestamp
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Team: ${notification.teamSlug} | ID: ${notification.deploymentId}`,
      },
    ],
  })

  return blocks
}

/**
 * Register action handlers for interactive components
 */
function registerActionHandlers(app: App): void {
  // Handle approve button click
  app.action<BlockAction>('approve_deployment', async ({ ack, body, client, action }) => {
    await ack()

    try {
      // Parse the action value
      const buttonAction = action as { value: string }
      const value = JSON.parse(buttonAction.value)
      const { deploymentId, appName } = value

      // Get user info
      const userId = body.user.id
      const userName = body.user.id

      console.log(`Slack: User ${userName} (${userId}) approved deployment ${deploymentId}`)

      // TODO: Call the actual approval logic
      // For now, just update the message to show it was approved
      if (body.channel?.id && body.message?.ts) {
        await client.chat.update({
          channel: body.channel.id,
          ts: body.message.ts,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *Deployment godkjent*\n\nApp: ${appName}\nGodkjent av: <@${userId}>`,
              },
            },
          ],
          text: `Deployment ${deploymentId} godkjent av ${userName}`,
        })
      }
    } catch (error) {
      console.error('Error handling approve action:', error)
    }
  })

  // View details is a link button, no handler needed
  app.action('view_details', async ({ ack }) => {
    await ack()
    // Link buttons don't need additional handling
  })
}
