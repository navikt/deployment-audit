import { Alert, BodyShort, Box, Button, Heading, HGrid, HStack, Select, Tag, VStack } from '@navikt/ds-react'
import { Form, Link, useRouteLoaderData } from 'react-router'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { getAllActiveRepositories } from '~/db/application-repositories.server'
import { type DevTeamSummaryStats, getDevTeamSummaryStats } from '~/db/dashboard-stats.server'
import { getDevTeamAppsWithIssues } from '~/db/deployments/home.server'
import { getDevTeamApplications, getDevTeamsBySection } from '~/db/dev-teams.server'
import { getUserDevTeam, setUserDevTeam } from '~/db/user-dev-team-preference.server'
import { getAppDeploymentStatsBatch } from '../db/deployments.server'
import { getAllAlertCounts, getAllMonitoredApplications } from '../db/monitored-applications.server'
import { ok } from '../lib/action-result'
import { getUserSections, requireUser } from '../lib/auth.server'
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

  if (intent === 'select-dev-team') {
    const devTeamId = Number(formData.get('devTeamId'))
    if (!devTeamId || Number.isNaN(devTeamId)) {
      return { error: 'Ugyldig team-valg' }
    }
    await setUserDevTeam(identity.navIdent, devTeamId)
    return ok('Team valgt')
  }

  return { error: 'Ukjent handling' }
}

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const identity = await requireUser(request)
    const sections = await getUserSections(identity.entraGroups)

    // Get user's selected dev team
    const selectedDevTeam = await getUserDevTeam(identity.navIdent)

    // Get available dev teams for the team selector
    const sectionIds = sections.map((s) => s.id)
    const devTeamsBySectionPromises = sectionIds.map((id) => getDevTeamsBySection(id))
    const devTeamsBySection = await Promise.all(devTeamsBySectionPromises)
    const availableDevTeams = devTeamsBySection.flat()

    // If no dev team selected, return just the selector data
    if (!selectedDevTeam) {
      return {
        selectedDevTeam: null,
        availableDevTeams,
        teamStats: null,
        issueApps: [] as AppCardData[],
        sectionNames: sections.map((s) => s.name),
      }
    }

    // Fetch dev team's direct app links
    const directApps = await getDevTeamApplications(selectedDevTeam.id)
    const directAppIds = directApps.length > 0 ? directApps.map((a) => a.monitored_app_id) : undefined

    // Fetch team stats and issue apps in parallel
    const [teamStats, issueApps, alertCounts, activeReposByApp] = await Promise.all([
      getDevTeamSummaryStats(selectedDevTeam.nais_team_slugs, directAppIds),
      getDevTeamAppsWithIssues(selectedDevTeam.nais_team_slugs, directAppIds),
      getAllAlertCounts(),
      getAllActiveRepositories(),
    ])

    // For issue apps, we need to fetch the monitored_app IDs to get stats
    const [allApps] = await Promise.all([getAllMonitoredApplications()])

    // Build AppCardData for issue apps
    const issueAppKeys = new Set(issueApps.map((a) => `${a.team_slug}/${a.environment_name}/${a.app_name}`))
    const matchingApps = allApps.filter((app) =>
      issueAppKeys.has(`${app.team_slug}/${app.environment_name}/${app.app_name}`),
    )

    const statsByApp =
      matchingApps.length > 0
        ? await getAppDeploymentStatsBatch(
            matchingApps.map((a) => ({ id: a.id, audit_start_year: a.audit_start_year })),
          )
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

    // Sort: most issues first
    issueAppCards.sort((a, b) => {
      const aIssues = a.stats.without_four_eyes + a.alertCount
      const bIssues = b.stats.without_four_eyes + b.alertCount
      return bIssues - aIssues
    })

    return {
      selectedDevTeam,
      availableDevTeams,
      teamStats,
      issueApps: issueAppCards,
      sectionNames: sections.map((s) => s.name),
    }
  } catch (_error) {
    return {
      selectedDevTeam: null,
      availableDevTeams: [],
      teamStats: null,
      issueApps: [] as AppCardData[],
      sectionNames: [],
    }
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
  const { selectedDevTeam, availableDevTeams, teamStats, issueApps, sectionNames } = loaderData
  const layoutData = useRouteLoaderData<typeof layoutLoader>('routes/layout')
  const isAdmin = layoutData?.user?.role === 'admin'

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

      {/* No dev team selected — show selector */}
      {!selectedDevTeam && (
        <VStack gap="space-16">
          <Alert variant="info">
            Velg ditt utviklingsteam for å se en personalisert oversikt over applikasjoner som trenger oppfølging.
          </Alert>

          {availableDevTeams.length > 0 ? (
            <Form method="post">
              <input type="hidden" name="intent" value="select-dev-team" />
              <HStack gap="space-16" align="end">
                <Select label="Velg utviklingsteam" name="devTeamId">
                  <option value="">— Velg team —</option>
                  {availableDevTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="medium">
                  Velg team
                </Button>
              </HStack>
            </Form>
          ) : (
            <Alert variant="warning">
              Ingen utviklingsteam er tilgjengelige for dine seksjoner ({sectionNames.join(', ') || 'ingen'}).
            </Alert>
          )}
        </VStack>
      )}

      {/* Dev team selected — show team overview */}
      {selectedDevTeam && teamStats && (
        <VStack gap="space-24">
          {/* Team header */}
          <HStack justify="space-between" align="center" wrap>
            <HStack gap="space-12" align="center">
              <Heading level="2" size="medium">
                {selectedDevTeam.name}
              </Heading>
              {selectedDevTeam.nais_team_slugs.length > 0 && (
                <HStack gap="space-4">
                  {selectedDevTeam.nais_team_slugs.map((slug) => (
                    <Tag key={slug} variant="neutral" size="xsmall">
                      {slug}
                    </Tag>
                  ))}
                </HStack>
              )}
            </HStack>
            <Form method="post">
              <input type="hidden" name="intent" value="select-dev-team" />
              <HStack gap="space-8" align="end">
                <Select label="Bytt team" name="devTeamId" size="small" hideLabel>
                  {availableDevTeams.map((team) => (
                    <option key={team.id} value={team.id} selected={team.id === selectedDevTeam.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="small" variant="tertiary">
                  Bytt
                </Button>
              </HStack>
            </Form>
          </HStack>

          {/* Team stats */}
          <TeamStatsCard stats={teamStats} />

          {/* Navigation links */}
          <HStack gap="space-16">
            {selectedDevTeam.nais_team_slugs.map((slug) => (
              <Button key={slug} as={Link} to={`/team/${slug}`} size="small" variant="secondary">
                Alle apper ({slug})
              </Button>
            ))}
            <Button as={Link} to={`/boards/${selectedDevTeam.slug}`} size="small" variant="secondary">
              Tavler
            </Button>
            <Button as={Link} to={`/boards/${selectedDevTeam.slug}/dashboard`} size="small" variant="secondary">
              Dashboard
            </Button>
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
