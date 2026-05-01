import { BarChartIcon, CogIcon } from '@navikt/aksel-icons'
import { Alert, BodyShort, Box, Button, Detail, Heading, HGrid, HStack, Tag, VStack } from '@navikt/ds-react'
import { Link, useLoaderData, useRouteLoaderData } from 'react-router'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { getGroupNamesByIds } from '~/db/application-groups.server'
import { getAllActiveRepositories } from '~/db/application-repositories.server'
import { type Board, getBoardsByDevTeam } from '~/db/boards.server'
import {
  type BoardObjectiveProgress,
  getBoardObjectiveProgress,
  getDevTeamStatsBatch,
} from '~/db/dashboard-stats.server'
import { getAppDeploymentStatsBatch } from '~/db/deployments.server'
import { getDevTeamApplications, getDevTeamBySlug, getGroupAppIdsForDevTeams } from '~/db/dev-teams.server'
import { getAllAlertCounts, getAllMonitoredApplications } from '~/db/monitored-applications.server'
import { getSectionBySlug } from '~/db/sections.server'
import {
  type DevTeamMember,
  getDevTeamMembers,
  getMembersGithubUsernamesForDevTeams,
} from '~/db/user-dev-team-preference.server'
import { requireUser } from '~/lib/auth.server'
import { groupAppCards } from '~/lib/group-app-cards'
import type { Route } from './+types/sections.$sectionSlug.teams.$devTeamSlug'
import type { loader as layoutLoader } from './layout'

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.devTeam?.name ?? 'Utviklingsteam'}` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request)
  const devTeam = await getDevTeamBySlug(params.devTeamSlug)
  if (!devTeam) {
    throw new Response('Utviklingsteam ikke funnet', { status: 404 })
  }
  const [boards, members, directApps, groupAppIds, allApps, alertCounts, activeRepos, deployerUsernames] =
    await Promise.all([
      getBoardsByDevTeam(devTeam.id),
      getDevTeamMembers(devTeam.id).catch(() => [] as DevTeamMember[]),
      getDevTeamApplications(devTeam.id),
      getGroupAppIdsForDevTeams([devTeam.id]),
      getAllMonitoredApplications(),
      getAllAlertCounts(),
      getAllActiveRepositories(),
      getMembersGithubUsernamesForDevTeams([devTeam.id]).catch(() => [] as string[]),
    ])

  const activeBoard = boards.find((b) => b.is_active) ?? null
  const activeBoardProgress = activeBoard ? await getBoardObjectiveProgress(activeBoard.id, deployerUsernames) : []

  // Build app cards: direct links + group-owned apps + nais team matches
  const directAppIds = new Set([...directApps.map((a) => a.monitored_app_id), ...groupAppIds])
  const naisTeamSlugs = devTeam.nais_team_slugs ?? []
  const teamApps = allApps.filter(
    (app) => app.is_active && (directAppIds.has(app.id) || naisTeamSlugs.includes(app.team_slug)),
  )

  // Filter stats to deploys made by team members (their GitHub usernames).
  // deployerUsernames is fetched in Promise.all above via getMembersGithubUsernamesForDevTeams
  // (handles soft-deletes, consistent with the deployment list page's team filter).
  // hasMappedMembers and unmappedMemberCount are derived from the members list
  // (not from deployerUsernames which is deduplicated and may not reflect 1:1 mapping).
  const hasMappedMembers = members.some((m) => Boolean(m.github_username))

  // Top-of-page coverage stats: YTD, filtered to team members' deploys.
  const ytdStart = new Date(new Date().getFullYear(), 0, 1)

  const [statsByApp, teamStatsMap] = await Promise.all([
    teamApps.length > 0
      ? getAppDeploymentStatsBatch(
          teamApps.map((a) => ({ id: a.id, audit_start_year: a.audit_start_year })),
          deployerUsernames,
        )
      : Promise.resolve(new Map()),
    getDevTeamStatsBatch([devTeam.id], ytdStart),
  ])

  const teamStats = teamStatsMap.get(devTeam.id)
  const teamCoverage = {
    total: teamStats?.total_deployments ?? 0,
    with_four_eyes: teamStats?.with_four_eyes ?? 0,
    four_eyes_percentage: teamStats ? Math.round(teamStats.four_eyes_coverage * 100) : 0,
    with_origin: teamStats?.linked_to_goal ?? 0,
    origin_percentage: teamStats ? Math.round(teamStats.goal_coverage * 100) : 0,
  }

  // Resolve group names for grouped app cards
  const teamGroupIds = [
    ...new Set(teamApps.map((a) => a.application_group_id).filter((id): id is number => id != null)),
  ]
  const groupNames = await getGroupNamesByIds(teamGroupIds)

  const appCards: AppCardData[] = groupAppCards(
    teamApps.map((app) => ({
      ...app,
      active_repo: activeRepos.get(app.id) || null,
      stats: statsByApp.get(app.id) || {
        total: 0,
        with_four_eyes: 0,
        without_four_eyes: 0,
        pending_verification: 0,
        missing_goal_links: 0,
        last_deployment: null,
        last_deployment_id: null,
        four_eyes_percentage: 0,
      },
      alertCount: alertCounts.get(app.id) || 0,
    })),
    groupNames,
  ).sort((a, b) => (a.groupName ?? a.app_name).localeCompare(b.groupName ?? b.app_name, 'nb'))

  const section = await getSectionBySlug(params.sectionSlug)

  return {
    devTeam,
    activeBoard,
    activeBoardProgress,
    members,
    appCards,
    sectionSlug: params.sectionSlug,
    sectionName: section?.name ?? params.sectionSlug,
    teamCoverage,
    hasMappedMembers,
    unmappedMemberCount: members.filter((m) => !m.github_username).length,
  }
}

export default function DevTeamPage() {
  const {
    devTeam,
    activeBoard,
    activeBoardProgress,
    members,
    appCards,
    sectionSlug,
    teamCoverage,
    hasMappedMembers,
    unmappedMemberCount,
  } = useLoaderData<typeof loader>()
  const layoutData = useRouteLoaderData<typeof layoutLoader>('routes/layout')
  const isAdmin = layoutData?.user?.role === 'admin'
  const teamBasePath = `/sections/${sectionSlug}/teams/${devTeam.slug}`

  return (
    <VStack gap="space-24">
      <div>
        <HStack align="center" justify="space-between">
          <Heading level="1" size="large">
            {devTeam.name}
          </Heading>
          {isAdmin && (
            <Button
              as={Link}
              to={`${teamBasePath}/admin`}
              variant="tertiary"
              size="small"
              icon={<CogIcon aria-hidden />}
            >
              Administrer
            </Button>
          )}
        </HStack>
        <BodyShort textColor="subtle">Teamside med mål- og commitmentstavler.</BodyShort>
      </div>

      {/* Team-member-based coverage summary */}
      <TeamCoverageCards
        coverage={teamCoverage}
        hasMappedMembers={hasMappedMembers}
        unmappedMemberCount={unmappedMemberCount}
        totalMembers={members.length}
      />

      {/* Active board */}
      {activeBoard ? (
        <ActiveBoardSection board={activeBoard} progress={activeBoardProgress} teamBasePath={teamBasePath} />
      ) : (
        <Alert variant="info">Ingen aktiv tavle. Opprett en ny tavle via Administrer-knappen.</Alert>
      )}

      {/* Members */}
      {members.length > 0 && (
        <VStack gap="space-8">
          <Heading level="2" size="small">
            Medlemmer ({members.length})
          </Heading>
          <HStack gap="space-8" wrap>
            {members.map((member) => (
              <Tag key={member.nav_ident} variant="neutral" size="small">
                {member.github_username ? (
                  <Link to={`/users/${member.github_username}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {member.display_name || member.nav_ident}
                  </Link>
                ) : (
                  member.display_name || member.nav_ident
                )}
              </Tag>
            ))}
          </HStack>
        </VStack>
      )}

      {/* Applications */}
      <VStack gap="space-8">
        <Heading level="2" size="small">
          Applikasjoner ({appCards.length})
        </Heading>
        <Detail textColor="subtle">Statistikk er filtrert til deploys utført av team-medlemmer.</Detail>
        {appCards.length > 0 ? (
          <VStack gap="space-4">
            {appCards.map((app) => (
              <AppCard key={app.id} app={app} appendSearchParams={`team=${encodeURIComponent(devTeam.slug)}`} />
            ))}
          </VStack>
        ) : (
          <BodyShort textColor="subtle">Ingen applikasjoner er lagt til ennå.</BodyShort>
        )}
      </VStack>
    </VStack>
  )
}

function TeamCoverageCards({
  coverage,
  hasMappedMembers,
  unmappedMemberCount,
  totalMembers,
}: {
  coverage: {
    total: number
    with_four_eyes: number
    four_eyes_percentage: number
    with_origin: number
    origin_percentage: number
  }
  hasMappedMembers: boolean
  unmappedMemberCount: number
  totalMembers: number
}) {
  if (totalMembers === 0) {
    return (
      <Alert variant="info">
        Ingen medlemmer er registrert for dette teamet enda. Statistikk på team-medlemmenes deploys vises når medlemmer
        er lagt til.
      </Alert>
    )
  }

  if (!hasMappedMembers) {
    return (
      <Alert variant="warning">
        Ingen av de {totalMembers} medlemmene har et GitHub-brukernavn registrert. Statistikk vises når brukerkoblinger
        er på plass.
      </Alert>
    )
  }

  return (
    <VStack gap="space-8">
      {unmappedMemberCount > 0 && (
        <Alert variant="warning" size="small">
          {unmappedMemberCount} av {totalMembers} medlemmer mangler GitHub-brukernavn — statistikken kan være
          ufullstendig.
        </Alert>
      )}
      <HGrid gap="space-12" columns={{ xs: 1, sm: 3 }}>
        <CoverageCard label="Deployments i år" value={coverage.total.toString()} />
        <CoverageCard
          label="4-øyne-dekning"
          value={`${coverage.four_eyes_percentage}%`}
          sub={`${coverage.with_four_eyes} av ${coverage.total}`}
        />
        <CoverageCard
          label="Endringsopphav"
          value={`${coverage.origin_percentage}%`}
          sub={`${coverage.with_origin} av ${coverage.total}`}
        />
      </HGrid>
      <Detail textColor="subtle">Basert på deploys utført av team-medlemmer (år til dato).</Detail>
    </VStack>
  )
}

function CoverageCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box padding="space-16" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
      <VStack gap="space-4">
        <Detail textColor="subtle">{label}</Detail>
        <Heading level="3" size="medium">
          {value}
        </Heading>
        {sub && <Detail textColor="subtle">{sub}</Detail>}
      </VStack>
    </Box>
  )
}

function ActiveBoardSection({
  board,
  progress,
  teamBasePath,
}: {
  board: Board
  progress: BoardObjectiveProgress[]
  teamBasePath: string
}) {
  return (
    <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
      <VStack gap="space-16">
        <HStack justify="space-between" align="center" wrap>
          <VStack gap="space-4">
            <Heading level="2" size="medium">
              <Link to={`${teamBasePath}/${board.id}`}>{board.period_label}</Link>
            </Heading>
            <HStack gap="space-8" align="center">
              <Tag variant="success" size="xsmall">
                Aktiv
              </Tag>
              <Detail textColor="subtle">
                {new Date(board.period_start).toLocaleDateString('nb-NO', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {' – '}
                {new Date(board.period_end).toLocaleDateString('nb-NO', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Detail>
            </HStack>
          </VStack>
          <Button
            as={Link}
            to={`${teamBasePath}/dashboard?periodType=${board.period_type}&period=${encodeURIComponent(board.period_label)}`}
            variant="tertiary"
            size="small"
            icon={<BarChartIcon aria-hidden />}
          >
            Dashboard
          </Button>
        </HStack>

        {progress.length > 0 ? (
          <VStack gap="space-8">
            {progress.map((obj) => (
              <Box key={obj.objective_id} padding="space-12" borderRadius="4" background="neutral-soft">
                <VStack gap="space-4">
                  <HStack justify="space-between" align="center">
                    <BodyShort weight="semibold" size="small">
                      {obj.objective_title}
                    </BodyShort>
                    <Tag variant="neutral" size="xsmall">
                      {obj.total_linked_deployments} deployments
                    </Tag>
                  </HStack>
                  {obj.key_results.length > 0 && (
                    <HStack gap="space-8" wrap>
                      {obj.key_results.map((kr) => (
                        <Detail key={kr.id} textColor="subtle">
                          {kr.title}: {kr.linked_deployments}
                        </Detail>
                      ))}
                    </HStack>
                  )}
                </VStack>
              </Box>
            ))}
          </VStack>
        ) : (
          <BodyShort size="small" textColor="subtle">
            Ingen mål er opprettet for denne tavlen ennå.
          </BodyShort>
        )}
      </VStack>
    </Box>
  )
}
