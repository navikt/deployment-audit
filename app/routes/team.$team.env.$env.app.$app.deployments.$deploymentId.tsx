// This route provides app-scoped deployment view with proper breadcrumbs
// Re-exports the deployment detail page with additional app context

import { getMonitoredApplicationByIdentity } from '~/db/monitored-applications.server'
import type { Route } from './+types/team.$team.env.$env.app.$app.deployments.$deploymentId'

import { default as DeploymentDetail, action as deploymentAction, loader as deploymentLoader } from './deployments.$id'

export async function loader({ params, request }: Route.LoaderArgs) {
  const { team, env, app: appName, deploymentId } = params
  if (!team || !env || !appName || !deploymentId) {
    throw new Response('Missing route parameters', { status: 400 })
  }

  const app = await getMonitoredApplicationByIdentity(team, env, appName)
  if (!app) {
    throw new Response('Application not found', { status: 404 })
  }

  // Call the original deployment loader
  const result = await deploymentLoader({
    params: { id: deploymentId },
    request,
  } as Parameters<typeof deploymentLoader>[0])

  // If it's a redirect response, return it as-is
  if (result instanceof Response) {
    return result
  }

  // Add app context for breadcrumbs
  return {
    ...result,
    app,
    appContext: true,
  }
}

// Wrap the action to pass deploymentId as id
export async function action({ params, request }: Route.ActionArgs) {
  return deploymentAction({
    params: { id: params.deploymentId },
    request,
  } as Parameters<typeof deploymentAction>[0])
}

export default DeploymentDetail
