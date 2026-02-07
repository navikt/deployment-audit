import { Alert, Button, Heading, HStack, VStack } from '@navikt/ds-react'
import { Link, useRouteLoaderData } from 'react-router'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { getRepositoriesByAppId } from '~/db/application-repositories.server'
import { getAlertCountsByApp } from '../db/alerts.server'
import { getAppDeploymentStats } from '../db/deployments.server'
import { getAllMonitoredApplications } from '../db/monitored-applications.server'
import type { Route } from './+types/home'
import type { loader as layoutLoader } from './layout'

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Pensjon Deployment Audit' },
    { name: 'description', content: 'Audit Nais deployments for godkjenningsstatus' },
  ]
}

export async function loader(_args: Route.LoaderArgs) {
  try {
    const [apps, alertCountsByApp] = await Promise.all([getAllMonitoredApplications(), getAlertCountsByApp()])

    // Fetch active repository and deployment stats for each app
    const appsWithData = await Promise.all(
      apps.map(async (app) => {
        const repos = await getRepositoriesByAppId(app.id)
        const activeRepo = repos.find((r) => r.status === 'active')
        const appStats = await getAppDeploymentStats(app.id, undefined, undefined, app.audit_start_year)
        return {
          ...app,
          active_repo: activeRepo ? `${activeRepo.github_owner}/${activeRepo.github_repo_name}` : null,
          stats: appStats,
          alertCount: alertCountsByApp.get(app.id) || 0,
        }
      }),
    )

    return {
      apps: appsWithData,
    }
  } catch (_error) {
    return {
      apps: [],
    }
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { apps } = loaderData
  const layoutData = useRouteLoaderData<typeof layoutLoader>('routes/layout')
  const isAdmin = layoutData?.user?.role === 'admin'

  // Group apps by team
  const appsByTeam: Record<string, AppCardData[]> = {}
  for (const app of apps) {
    if (!appsByTeam[app.team_slug]) {
      appsByTeam[app.team_slug] = []
    }
    appsByTeam[app.team_slug].push(app)
  }

  return (
    <VStack gap="space-32">
      {/* Add app button - only for admins */}
      {isAdmin && (
        <HStack justify="end">
          <Button as={Link} to="/apps/add" size="small" variant="secondary">
            Legg til applikasjon
          </Button>
        </HStack>
      )}

      {/* Empty state */}
      {apps.length === 0 && <Alert variant="info">Ingen applikasjoner overvåkes ennå.</Alert>}

      {/* App list grouped by team */}
      {Object.entries(appsByTeam).map(([teamSlug, teamApps]) => (
        <VStack key={teamSlug} gap="space-16">
          <Link to={`/team/${teamSlug}`} style={{ textDecoration: 'none' }}>
            <Heading size="small">
              {teamSlug} ({teamApps.length})
            </Heading>
          </Link>

          <div>
            {teamApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        </VStack>
      ))}
    </VStack>
  )
}
