// Legacy route - redirects to new semantic URL structure
import type { LoaderFunctionArgs } from 'react-router'
import { getMonitoredApplicationById } from '~/db/monitored-applications.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = parseInt(params.id || '', 10)
  if (Number.isNaN(id)) {
    throw new Response('Invalid app ID', { status: 400 })
  }

  const app = await getMonitoredApplicationById(id)
  if (!app) {
    throw new Response('Application not found', { status: 404 })
  }

  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()
  const newUrl = `/team/${app.team_slug}/env/${app.environment_name}/app/${app.app_name}/deployments${searchParams ? `?${searchParams}` : ''}`

  return Response.redirect(new URL(newUrl, url.origin), 302)
}

export default function DeploymentsRedirect() {
  return null
}
