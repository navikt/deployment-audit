import { BarChartIcon, ClockIcon, CogIcon, PlusIcon } from '@navikt/aksel-icons'
import { Alert, BodyShort, Box, Button, Detail, Heading, HGrid, HStack, Select, Tag, VStack } from '@navikt/ds-react'
import { useState } from 'react'
import { Form, Link, useActionData, useLoaderData, useRouteLoaderData } from 'react-router'
import { ActionAlert } from '~/components/ActionAlert'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { getGroupNamesByIds } from '~/db/application-groups.server'
import { getAllActiveRepositories } from '~/db/application-repositories.server'
import { type Board, createBoard, getBoardsByDevTeam } from '~/db/boards.server'
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
import { type BoardPeriodType, formatBoardLabel, getPeriodsForYear } from '~/lib/board-periods'
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
  const activeBoardProgress = activeBoard ? await getBoardObjectiveProgress(activeBoard.id) : []

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
    boards,
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

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request)
  const devTeam = await getDevTeamBySlug(params.devTeamSlug)
  if (!devTeam) {
    throw new Response('Utviklingsteam ikke funnet', { status: 404 })
  }

  const formData = await request.formData()
  const intent = formData.get('intent') as string

  if (intent === 'create') {
    const periodType = formData.get('period_type') as BoardPeriodType
    const periodLabel = formData.get('period_label') as string
    const periodStart = formData.get('period_start') as string
    const periodEnd = formData.get('period_end') as string

    if (!periodType || !periodStart || !periodEnd || !periodLabel) {
      return { error: 'Alle felt er påkrevd.' }
    }

    try {
      await createBoard({
        dev_team_id: devTeam.id,
        title: formatBoardLabel({ teamName: devTeam.name, periodLabel }),
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        period_label: periodLabel,
        created_by: user.navIdent,
      })
      return { success: true }
    } catch (error) {
      return { error: `Kunne ikke opprette tavle: ${error}` }
    }
  }

  return { error: 'Ukjent handling.' }
}

export default function DevTeamPage() {
  const {
    devTeam,
    boards,
    activeBoard,
    activeBoardProgress,
    members,
    appCards,
    sectionSlug,
    teamCoverage,
    hasMappedMembers,
    unmappedMemberCount,
  } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const layoutData = useRouteLoaderData<typeof layoutLoader>('routes/layout')
  const isAdmin = layoutData?.user?.role === 'admin'
  const [showCreate, setShowCreate] = useState(false)
  const teamBasePath = `/sections/${sectionSlug}/teams/${devTeam.slug}`
  const inactiveBoards = boards.filter((b) => !b.is_active)

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
        <ActiveBoardSection
          board={activeBoard}
          progress={activeBoardProgress}
          teamBasePath={teamBasePath}
          teamName={devTeam.name}
        />
      ) : (
        <Alert variant="info">Ingen aktiv tavle. Opprett en ny tavle for å komme i gang.</Alert>
      )}

      {/* Board actions */}
      {!showCreate ? (
        <HStack gap="space-8">
          <Button variant="secondary" size="small" icon={<PlusIcon aria-hidden />} onClick={() => setShowCreate(true)}>
            Ny tavle
          </Button>
          <Button
            as={Link}
            to={`${teamBasePath}/dashboard`}
            variant="tertiary"
            size="small"
            icon={<BarChartIcon aria-hidden />}
          >
            Dashboard
          </Button>
          {inactiveBoards.length > 0 && (
            <Button
              as={Link}
              to={`${teamBasePath}/boards`}
              variant="tertiary"
              size="small"
              icon={<ClockIcon aria-hidden />}
            >
              Tidligere tavler ({inactiveBoards.length})
            </Button>
          )}
        </HStack>
      ) : (
        <CreateBoardForm onCancel={() => setShowCreate(false)} />
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
        <ActionAlert data={actionData} />
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
  teamName,
}: {
  board: Board
  progress: BoardObjectiveProgress[]
  teamBasePath: string
  teamName: string
}) {
  return (
    <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
      <VStack gap="space-16">
        <HStack justify="space-between" align="center" wrap>
          <VStack gap="space-4">
            <Heading level="2" size="medium">
              <Link to={`${teamBasePath}/${board.id}`}>
                {formatBoardLabel({ teamName, periodLabel: board.period_label })}
              </Link>
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
          <Button as={Link} to={`${teamBasePath}/${board.id}`} variant="tertiary" size="small">
            Åpne tavle
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

function CreateBoardForm({ onCancel }: { onCancel: () => void }) {
  const [periodType, setPeriodType] = useState<BoardPeriodType>('tertiary')
  const year = new Date().getFullYear()
  const periods = getPeriodsForYear(periodType, year)

  const [selectedPeriod, setSelectedPeriod] = useState(periods[0])

  return (
    <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
      <Form method="post" onSubmit={onCancel}>
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="period_start" value={selectedPeriod?.start ?? ''} />
        <input type="hidden" name="period_end" value={selectedPeriod?.end ?? ''} />
        <input type="hidden" name="period_label" value={selectedPeriod?.label ?? ''} />
        <VStack gap="space-16">
          <Heading level="2" size="small">
            Opprett ny tavle
          </Heading>
          <HStack gap="space-16" wrap>
            <Select
              label="Periodetype"
              name="period_type"
              size="small"
              value={periodType}
              onChange={(e) => {
                const type = e.target.value as BoardPeriodType
                setPeriodType(type)
                const newPeriods = getPeriodsForYear(type, year)
                setSelectedPeriod(newPeriods[0])
              }}
            >
              <option value="tertiary">Tertial</option>
              <option value="quarterly">Kvartal</option>
            </Select>
            <Select
              label="Periode"
              size="small"
              value={selectedPeriod?.label ?? ''}
              onChange={(e) => {
                const p = periods.find((p) => p.label === e.target.value)
                if (p) setSelectedPeriod(p)
              }}
            >
              {periods.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </Select>
          </HStack>
          <HStack gap="space-8">
            <Button type="submit" size="small">
              Opprett
            </Button>
            <Button variant="tertiary" size="small" onClick={onCancel}>
              Avbryt
            </Button>
          </HStack>
        </VStack>
      </Form>
    </Box>
  )
}
