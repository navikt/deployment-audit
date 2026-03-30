import {
  Alert,
  BodyShort,
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  Heading,
  HGrid,
  HStack,
  Tag,
  VStack,
} from '@navikt/ds-react'
import { Form, Link, useRouteLoaderData } from 'react-router'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { getAllActiveRepositories } from '~/db/application-repositories.server'
import { type DevTeamSummaryStats, getDevTeamSummaryStats } from '~/db/dashboard-stats.server'
import { getDevTeamAppsWithIssues } from '~/db/deployments/home.server'
import { getAllDevTeams, getDevTeamApplications } from '~/db/dev-teams.server'
import { addUserDevTeam, getUserDevTeams, removeUserDevTeam } from '~/db/user-dev-team-preference.server'
import { getAppDeploymentStatsBatch } from '../db/deployments.server'
import { getAllAlertCounts, getAllMonitoredApplications } from '../db/monitored-applications.server'
import { ok } from '../lib/action-result'
import { requireUser } from '../lib/auth.server'
import type { Route } from './+types/home'
import type { loader as layoutLoader } from './layout'

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Deployment Audit' },
    { name: 'description', content: 'Audit Nais deployments for godkjenningsstatus' },
  ]
}

export async function action({ request }: Route.ActionArgs) {
  const identity = await requireUser(request)
  const formData = await request.formData()
  const intent = formData.get('intent')

  if (intent === 'add-dev-team') {
    const devTeamId = Number(formData.get('devTeamId'))
    if (!devTeamId || Number.isNaN(devTeamId)) {
      return { error: 'Ugyldig team-valg' }
    }
    try {
      await addUserDevTeam(identity.navIdent, devTeamId)
    } catch {
      return { error: 'Kunne ikke legge til team. Migrering av database kan mangle.' }
    }
    return ok('Team lagt til')
  }

  if (intent === 'remove-dev-team') {
    const devTeamId = Number(formData.get('devTeamId'))
    if (!devTeamId || Number.isNaN(devTeamId)) {
      return { error: 'Ugyldig team-valg' }
    }
    try {
      await removeUserDevTeam(identity.navIdent, devTeamId)
    } catch {
      return { error: 'Kunne ikke fjerne team.' }
    }
    return ok('Team fjernet')
  }

  return { error: 'Ukjent handling' }
}

export async function loader({ request }: Route.LoaderArgs) {
  const identity = await requireUser(request)
  const availableDevTeams = await getAllDevTeams()

  // getUserDevTeams may fail if migration hasn't run yet
  let selectedDevTeams: Awaited<ReturnType<typeof getUserDevTeams>> = []
  try {
    selectedDevTeams = await getUserDevTeams(identity.navIdent)
  } catch {
    // user_dev_team_preference table may not exist yet
  }

  // If no dev teams selected, return just the selector data
  if (selectedDevTeams.length === 0) {
    return {
      selectedDevTeams: [],
      availableDevTeams,
      teamStats: null,
      issueApps: [] as AppCardData[],
    }
  }

  // Combine nais_team_slugs and direct app IDs from all selected teams
  const allNaisTeamSlugs = [...new Set(selectedDevTeams.flatMap((t) => t.nais_team_slugs))]
  const directAppsResults = await Promise.all(selectedDevTeams.map((t) => getDevTeamApplications(t.id)))
  const allDirectAppIds = [...new Set(directAppsResults.flat().map((a) => a.monitored_app_id))]
  const directAppIds = allDirectAppIds.length > 0 ? allDirectAppIds : undefined

  // Fetch combined stats and issue apps in parallel
  const [teamStats, issueApps, alertCounts, activeReposByApp] = await Promise.all([
    getDevTeamSummaryStats(allNaisTeamSlugs, directAppIds),
    getDevTeamAppsWithIssues(allNaisTeamSlugs, directAppIds),
    getAllAlertCounts(),
    getAllActiveRepositories(),
  ])

  const allApps = await getAllMonitoredApplications()

  // Build AppCardData for issue apps
  const issueAppKeys = new Set(issueApps.map((a) => `${a.team_slug}/${a.environment_name}/${a.app_name}`))
  const matchingApps = allApps.filter((app) =>
    issueAppKeys.has(`${app.team_slug}/${app.environment_name}/${app.app_name}`),
  )

  const statsByApp =
    matchingApps.length > 0
      ? await getAppDeploymentStatsBatch(matchingApps.map((a) => ({ id: a.id, audit_start_year: a.audit_start_year })))
      : new Map()

  const issueAppCards: AppCardData[] = matchingApps.map((app) => ({
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

  issueAppCards.sort((a, b) => {
    const aIssues = a.stats.without_four_eyes + a.alertCount
    const bIssues = b.stats.without_four_eyes + b.alertCount
    return bIssues - aIssues
  })

  return {
    selectedDevTeams,
    availableDevTeams,
    teamStats,
    issueApps: issueAppCards,
  }
}

function TeamStatsCard({ stats }: { stats: DevTeamSummaryStats }) {
  const coverageVariant =
    stats.four_eyes_percentage >= 95 ? 'success' : stats.four_eyes_percentage >= 80 ? 'warning' : 'danger'

  return (
    <HGrid gap="space-16" columns={{ xs: 2, md: 4 }}>
      <Box padding="space-16" background="raised" borderRadius="4">
        <VStack gap="space-4">
          <BodyShort size="small" textColor="subtle">
            Fireøyne-dekning
          </BodyShort>
          <HStack align="center" gap="space-8">
            <Heading size="large">{stats.four_eyes_percentage}%</Heading>
            <Tag data-color={coverageVariant} variant="moderate" size="xsmall">
              {coverageVariant === 'success' ? 'OK' : coverageVariant === 'warning' ? 'Bør forbedres' : 'Kritisk'}
            </Tag>
          </HStack>
        </VStack>
      </Box>

      <Box padding="space-16" background="raised" borderRadius="4">
        <VStack gap="space-4">
          <BodyShort size="small" textColor="subtle">
            Totalt deployments
          </BodyShort>
          <Heading size="large">{stats.total_deployments}</Heading>
        </VStack>
      </Box>

      <Box padding="space-16" background="raised" borderRadius="4">
        <VStack gap="space-4">
          <BodyShort size="small" textColor="subtle">
            Apper
          </BodyShort>
          <Heading size="large">{stats.total_apps}</Heading>
        </VStack>
      </Box>

      <Box padding="space-16" background="raised" borderRadius="4">
        <VStack gap="space-4">
          <BodyShort size="small" textColor="subtle">
            Apper med problemer
          </BodyShort>
          <HStack align="center" gap="space-8">
            <Heading size="large">{stats.apps_with_issues}</Heading>
            {stats.apps_with_issues > 0 && (
              <Tag data-color="danger" variant="moderate" size="xsmall">
                Krever oppfølging
              </Tag>
            )}
          </HStack>
        </VStack>
      </Box>
    </HGrid>
  )
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { selectedDevTeams, availableDevTeams, teamStats, issueApps } = loaderData
  const layoutData = useRouteLoaderData<typeof layoutLoader>('routes/layout')
  const isAdmin = layoutData?.user?.role === 'admin'
  const selectedIds = new Set(selectedDevTeams.map((t) => t.id))

  return (
    <VStack gap="space-32">
      {/* Admin add-app button */}
      {isAdmin && (
        <HStack justify="end">
          <Button as={Link} to="/apps/add" size="small" variant="secondary">
            Legg til applikasjon
          </Button>
        </HStack>
      )}

      {/* Team selector — always visible */}
      {availableDevTeams.length > 0 ? (
        <Box background="raised" padding="space-16" borderRadius="4">
          <VStack gap="space-12">
            <Heading level="2" size="small">
              Mine utviklingsteam
            </Heading>
            <CheckboxGroup legend="Velg team du tilhører" hideLegend>
              <HStack gap="space-16" wrap>
                {availableDevTeams.map((team) => (
                  <Form method="post" key={team.id}>
                    <input
                      type="hidden"
                      name="intent"
                      value={selectedIds.has(team.id) ? 'remove-dev-team' : 'add-dev-team'}
                    />
                    <input type="hidden" name="devTeamId" value={team.id} />
                    <Checkbox
                      value={String(team.id)}
                      checked={selectedIds.has(team.id)}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}
                    >
                      {team.name}
                    </Checkbox>
                  </Form>
                ))}
              </HStack>
            </CheckboxGroup>
          </VStack>
        </Box>
      ) : (
        <Alert variant="warning">Ingen utviklingsteam er tilgjengelige.</Alert>
      )}

      {/* No teams selected — prompt */}
      {selectedDevTeams.length === 0 && availableDevTeams.length > 0 && (
        <Alert variant="info">Velg ett eller flere utviklingsteam over for å se en personalisert oversikt.</Alert>
      )}

      {/* Teams selected — show combined overview */}
      {selectedDevTeams.length > 0 && teamStats && (
        <VStack gap="space-24">
          {/* Team names */}
          <HStack gap="space-8" align="center" wrap>
            {selectedDevTeams.map((team) => (
              <Tag key={team.id} variant="moderate" size="small">
                {team.name}
              </Tag>
            ))}
          </HStack>

          {/* Combined stats */}
          <TeamStatsCard stats={teamStats} />

          {/* Navigation links per team */}
          <HStack gap="space-8" wrap>
            {selectedDevTeams.map((team) => (
              <HStack key={team.id} gap="space-8">
                {team.nais_team_slugs.map((slug) => (
                  <Button key={slug} as={Link} to={`/team/${slug}`} size="small" variant="secondary">
                    Alle apper ({slug})
                  </Button>
                ))}
                <Button as={Link} to={`/boards/${team.slug}`} size="small" variant="secondary">
                  {team.name} — Tavler
                </Button>
              </HStack>
            ))}
          </HStack>

          {/* Issue apps */}
          {issueApps.length > 0 ? (
            <VStack gap="space-16">
              <Heading level="3" size="small">
                Apper som trenger oppfølging ({issueApps.length})
              </Heading>
              <div>
                {issueApps.map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            </VStack>
          ) : (
            <Alert variant="success">Alle apper er i orden — ingen krever oppfølging.</Alert>
          )}
        </VStack>
      )}
    </VStack>
  )
}
