// This route provides app-scoped deployment view with proper breadcrumbs
// Re-exports the deployment detail page with additional app context

import { getMonitoredApplicationById } from '~/db/monitored-applications.server'
import type { Route } from './+types/apps.$id.deployments.$deploymentId'

export { action } from './deployments.$id'

import { default as DeploymentDetail, loader as deploymentLoader } from './deployments.$id'

export async function loader({ params, request }: Route.LoaderArgs) {
  const appId = parseInt(params.id, 10)
  if (Number.isNaN(appId)) {
    throw new Response('Invalid app ID', { status: 400 })
  }

  const app = await getMonitoredApplicationById(appId)
  if (!app) {
    throw new Response('Application not found', { status: 404 })
  }

  // Call the original deployment loader
  const deploymentData = await deploymentLoader({
    params: { id: params.deploymentId },
    request,
  } as Parameters<typeof deploymentLoader>[0])

  // Add app context for breadcrumbs
  return {
    ...deploymentData,
    app,
    appContext: true,
  }
}

export default DeploymentDetail
