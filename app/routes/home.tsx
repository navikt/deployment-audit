import { Alert, Button, Heading, HStack, VStack } from '@navikt/ds-react'
import { Link, useRouteLoaderData } from 'react-router'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { getAllActiveRepositories } from '~/db/application-repositories.server'
import { getAppDeploymentStatsBatch } from '../db/deployments.server'
import { getAllAlertCounts, getAllMonitoredApplications } from '../db/monitored-applications.server'
import type { Route } from './+types/home'
import type { loader as layoutLoader } from './layout'

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Deployment Audit' },
    { name: 'description', content: 'Audit Nais deployments for godkjenningsstatus' },
  ]
}

export async function loader(_args: Route.LoaderArgs) {
  try {
    // Fetch all data in parallel (3 queries instead of 2N+1)
    const [apps, alertCounts, activeReposByApp] = await Promise.all([
      getAllMonitoredApplications(),
      getAllAlertCounts(),
      getAllActiveRepositories(),
    ])

    if (apps.length === 0) {
      return { apps: [] }
    }

    // Get stats (depends on apps data for audit_start_year)
    const statsByApp = await getAppDeploymentStatsBatch(
      apps.map((a) => ({ id: a.id, audit_start_year: a.audit_start_year })),
    )

    // Combine data
    const appsWithData = apps.map((app) => ({
      ...app,
      active_repo: activeReposByApp.get(app.id) || null,
      stats: statsByApp.get(app.id) || {
        total: 0,
        with_four_eyes: 0,
        without_four_eyes: 0,
        pending_verification: 0,
        last_deployment: null,
        last_deployment_id: null,
        four_eyes_percentage: 0,
      },
      alertCount: alertCounts.get(app.id) || 0,
    }))

    return { apps: appsWithData }
  } catch (_error) {
    return { apps: [] }
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
            <Heading level="2" size="small">
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
