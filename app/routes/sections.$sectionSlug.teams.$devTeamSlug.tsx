import { BarChartIcon, ClockIcon, CogIcon, PlusIcon } from '@navikt/aksel-icons'
import {
  Alert,
  BodyShort,
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  Detail,
  Heading,
  HGrid,
  HStack,
  Modal,
  Select,
  Tag,
  TextField,
  VStack,
} from '@navikt/ds-react'
import { useMemo, useRef, useState } from 'react'
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteLoaderData } from 'react-router'
import { ActionAlert } from '~/components/ActionAlert'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { getGroupNamesByIds } from '~/db/application-groups.server'
import { getAllActiveRepositories } from '~/db/application-repositories.server'
import { type Board, createBoard, getBoardsByDevTeam } from '~/db/boards.server'
import { pool } from '~/db/connection.server'
import { type BoardObjectiveProgress, getBoardObjectiveProgress } from '~/db/dashboard-stats.server'
import { getDevTeamCoverageStats } from '~/db/deployment-goal-links.server'
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
import { logger } from '~/lib/logger.server'
import { fetchAllTeamsAndApplications, getApplicationInfo } from '~/lib/nais.server'
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
  const [
    boards,
    members,
    directApps,
    groupAppIds,
    allApps,
    alertCounts,
    activeRepos,
    naisCatalogResult,
    deployerUsernames,
  ] = await Promise.all([
    getBoardsByDevTeam(devTeam.id),
    getDevTeamMembers(devTeam.id).catch(() => [] as DevTeamMember[]),
    getDevTeamApplications(devTeam.id),
    getGroupAppIdsForDevTeams([devTeam.id]),
    getAllMonitoredApplications(),
    getAllAlertCounts(),
    getAllActiveRepositories(),
    fetchAllTeamsAndApplications().then(
      (catalog) => ({ ok: true as const, catalog }),
      (err: unknown) => {
        // Page still loads if Nais is down — UI surfaces a dedicated error state.
        logger.error('Kunne ikke hente Nais-katalog:', err)
        return {
          ok: false as const,
          catalog: [] as Array<{ teamSlug: string; appName: string; environmentName: string }>,
        }
      },
    ),
    getMembersGithubUsernamesForDevTeams([devTeam.id]).catch(() => [] as string[]),
  ])
  const naisCatalog = naisCatalogResult.catalog
  const naisCatalogFailed = !naisCatalogResult.ok

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

  // Top-of-page coverage stats: last 90 days, filtered to team members' deploys.
  const coverageEnd = new Date()
  const coverageStart = new Date(coverageEnd.getTime() - 90 * 24 * 60 * 60 * 1000)

  const [statsByApp, teamCoverage] = await Promise.all([
    teamApps.length > 0
      ? getAppDeploymentStatsBatch(
          teamApps.map((a) => ({ id: a.id, audit_start_year: a.audit_start_year })),
          deployerUsernames,
        )
      : Promise.resolve(new Map()),
    getDevTeamCoverageStats(
      teamApps.map((a) => a.id),
      deployerUsernames,
      coverageStart,
      coverageEnd,
    ),
  ])

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

  // Build the "add apps" candidate list: every Nais app that is NOT already
  // linked to this dev team. We deliberately exclude already-linked apps to
  // make the dialog purely additive — unlink is a separate flow.
  const allowedEnvs = process.env.ALLOWED_ENVIRONMENTS?.split(',').map((e) => e.trim()) || []
  const linkedKeys = new Set(teamApps.map((a) => `${a.team_slug}|${a.environment_name}|${a.app_name}`))
  const monitoredByKey = new Map(
    allApps.filter((a) => a.is_active).map((a) => [`${a.team_slug}|${a.environment_name}|${a.app_name}`, a.id]),
  )
  const filteredCatalog =
    allowedEnvs.length > 0 ? naisCatalog.filter((a) => allowedEnvs.includes(a.environmentName)) : naisCatalog
  const addableApps: AddableApp[] = filteredCatalog
    .filter((entry) => !linkedKeys.has(`${entry.teamSlug}|${entry.environmentName}|${entry.appName}`))
    .map((entry) => ({
      team_slug: entry.teamSlug,
      environment_name: entry.environmentName,
      app_name: entry.appName,
      monitored_id: monitoredByKey.get(`${entry.teamSlug}|${entry.environmentName}|${entry.appName}`) ?? null,
    }))
    .sort(
      (a, b) =>
        a.team_slug.localeCompare(b.team_slug, 'nb') ||
        a.app_name.localeCompare(b.app_name, 'nb') ||
        a.environment_name.localeCompare(b.environment_name, 'nb'),
    )

  return {
    devTeam,
    boards,
    activeBoard,
    activeBoardProgress,
    members,
    appCards,
    addableApps,
    naisCatalogFailed,
    sectionSlug: params.sectionSlug,
    sectionName: section?.name ?? params.sectionSlug,
    teamCoverage,
    hasMappedMembers,
    unmappedMemberCount: members.filter((m) => !m.github_username).length,
  }
}

type AddableApp = {
  team_slug: string
  environment_name: string
  app_name: string
  monitored_id: number | null
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request)
  const devTeam = await getDevTeamBySlug(params.devTeamSlug)
  if (!devTeam) {
    throw new Response('Utviklingsteam ikke funnet', { status: 404 })
  }

  const formData = await request.formData()
  const intent = formData.get('intent') as string

  // App management requires admin or team membership
  if (intent === 'add_apps' && user.role !== 'admin') {
    const teamMembers = await getDevTeamMembers(devTeam.id)
    const isMember = teamMembers.some((m) => m.nav_ident.toUpperCase() === user.navIdent.toUpperCase())
    if (!isMember) {
      return { error: 'Du må være medlem av teamet for å endre applikasjoner.' }
    }
  }

  if (intent === 'add_apps') {
    /**
     * Pure add-only flow. Each `app_ref` entry is either:
     *   - "id:<n>"             → existing monitored_application id, link as-is
     *   - "new:<team>|<env>|<app>"  → not yet monitored; create then link
     *
     * Existing links on the team are NEVER touched — unlinking is a separate
     * flow.
     *
     * Atomicity strategy:
     *   1. Dedupe inputs.
     *   2. Validate ALL new entries against Nais BEFORE any DB write, so a
     *      validation failure cannot leave partial state.
     *   3. Apply the create+link operations in a single DB transaction; any
     *      DB failure rolls back the whole batch.
     */
    const refs = [...new Set(formData.getAll('app_ref').map(String))]
    const existingIds = new Set<number>()
    const newKeys = new Map<string, { team_slug: string; environment_name: string; app_name: string }>()
    for (const ref of refs) {
      if (ref.startsWith('id:')) {
        const n = Number(ref.slice(3))
        if (Number.isInteger(n) && n > 0) existingIds.add(n)
      } else if (ref.startsWith('new:')) {
        const [team, env, app] = ref.slice(4).split('|')
        if (team && env && app) {
          newKeys.set(`${team}|${env}|${app}`, { team_slug: team, environment_name: env, app_name: app })
        }
      }
    }
    const newIdentities = [...newKeys.values()]

    if (existingIds.size === 0 && newIdentities.length === 0) {
      return { error: 'Velg minst én applikasjon å legge til.' }
    }

    // Pre-validate every new entry against Nais. We do this OUTSIDE the
    // transaction because Nais calls are slow and we want to fail fast
    // before opening a write transaction.
    for (const id of newIdentities) {
      const found = await getApplicationInfo(id.team_slug, id.environment_name, id.app_name)
      if (!found) {
        return {
          error: `Fant ikke ${id.app_name} i Nais-team ${id.team_slug} (miljø ${id.environment_name}). Last siden på nytt og prøv igjen.`,
        }
      }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const createdIds: number[] = []
      for (const id of newIdentities) {
        const result = await client.query<{ id: number }>(
          `INSERT INTO monitored_applications (team_slug, environment_name, app_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (team_slug, environment_name, app_name)
           DO UPDATE SET is_active = true, updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [id.team_slug, id.environment_name, id.app_name],
        )
        createdIds.push(result.rows[0].id)
      }
      for (const monitoredAppId of [...existingIds, ...createdIds]) {
        await client.query(
          `INSERT INTO dev_team_applications (dev_team_id, monitored_app_id)
           VALUES ($1, $2)
           ON CONFLICT (dev_team_id, monitored_app_id)
           DO UPDATE SET deleted_at = NULL, deleted_by = NULL
           WHERE dev_team_applications.deleted_at IS NOT NULL`,
          [devTeam.id, monitoredAppId],
        )
      }
      await client.query('COMMIT')
      const total = existingIds.size + createdIds.length
      const createdMsg =
        createdIds.length > 0
          ? ` (${createdIds.length} ny${createdIds.length === 1 ? '' : 'e'} app${createdIds.length === 1 ? '' : 'er'} lagt til overvåking)`
          : ''
      return { success: `La til ${total} applikasjon${total === 1 ? '' : 'er'}${createdMsg}.` }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      logger.error('add_apps tx failed:', error)
      return { error: `Kunne ikke legge til applikasjoner: ${error}` }
    } finally {
      client.release()
    }
  }

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
    addableApps,
    naisCatalogFailed,
    sectionSlug,
    teamCoverage,
    hasMappedMembers,
    unmappedMemberCount,
  } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const layoutData = useRouteLoaderData<typeof layoutLoader>('routes/layout')
  const isAdmin = layoutData?.user?.role === 'admin'
  const isMember = members.some((m) => m.nav_ident.toUpperCase() === layoutData?.user?.navIdent?.toUpperCase())
  const canEditApps = isAdmin || isMember
  const [showCreate, setShowCreate] = useState(false)
  const teamBasePath = `/sections/${sectionSlug}/teams/${devTeam.slug}`
  const inactiveBoards = boards.filter((b) => !b.is_active)
  const addAppsRef = useRef<HTMLDialogElement>(null)

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
        <HStack justify="space-between" align="center">
          <Heading level="2" size="small">
            Applikasjoner ({appCards.length})
          </Heading>
          {canEditApps && (
            <Button
              size="small"
              variant="tertiary"
              icon={<PlusIcon aria-hidden />}
              onClick={() => addAppsRef.current?.showModal()}
            >
              Legg til applikasjon
            </Button>
          )}
        </HStack>
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

      {/* Add apps dialog */}
      <AddAppsDialog
        ref={addAppsRef}
        addableApps={addableApps}
        naisCatalogFailed={naisCatalogFailed}
        isSubmitting={navigation.state === 'submitting'}
      />
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
        <CoverageCard label="Deploys siste 90 dager" value={coverage.total.toString()} />
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
      <Detail textColor="subtle">Basert på deploys utført av team-medlemmer (siste 90 dager).</Detail>
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

import { forwardRef } from 'react'

const AddAppsDialog = forwardRef<
  HTMLDialogElement,
  { addableApps: AddableApp[]; naisCatalogFailed: boolean; isSubmitting: boolean }
>(function AddAppsDialog({ addableApps, naisCatalogFailed, isSubmitting }, ref) {
  const [search, setSearch] = useState('')

  const searchLower = search.toLowerCase()
  const filteredApps = useMemo(
    () =>
      search
        ? addableApps.filter(
            (app) =>
              app.app_name.toLowerCase().includes(searchLower) ||
              app.team_slug.toLowerCase().includes(searchLower) ||
              app.environment_name.toLowerCase().includes(searchLower),
          )
        : addableApps,
    [addableApps, search, searchLower],
  )

  const appsByNaisTeam = useMemo(() => {
    const grouped = new Map<string, AddableApp[]>()
    for (const app of filteredApps) {
      const group = grouped.get(app.team_slug) ?? []
      group.push(app)
      grouped.set(app.team_slug, group)
    }
    return grouped
  }, [filteredApps])

  const closeModal = () => {
    if (typeof ref === 'object' && ref?.current) ref.current.close()
  }

  // Encode each row as either id:<n> (already monitored) or new:<t>|<e>|<a>.
  // Already-linked apps are excluded server-side, so the dialog only ever
  // submits ADDITIONS — existing links are never touched.
  const refValue = (app: AddableApp) =>
    app.monitored_id !== null
      ? `id:${app.monitored_id}`
      : `new:${app.team_slug}|${app.environment_name}|${app.app_name}`

  return (
    <Modal ref={ref} header={{ heading: 'Legg til applikasjoner' }} closeOnBackdropClick width="640px">
      <Modal.Body>
        <Form
          method="post"
          id="add-apps-form"
          onSubmit={() => {
            closeModal()
          }}
        >
          <input type="hidden" name="intent" value="add_apps" />
          <VStack gap="space-12">
            {naisCatalogFailed && (
              <Alert variant="error" size="small">
                Kunne ikke hente Nais-katalogen akkurat nå. Last siden på nytt om litt for å se tilgjengelige
                applikasjoner.
              </Alert>
            )}
            <BodyShort size="small" textColor="subtle">
              Lista viser Nais-applikasjoner som ikke allerede er koblet til teamet. Apper merket «Ny i overvåking»
              opprettes automatisk når du krysser dem av og lagrer.
            </BodyShort>
            <TextField
              label="Søk etter applikasjon"
              hideLabel
              placeholder="Søk etter applikasjon, team eller miljø..."
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            <Box style={{ maxHeight: '400px', overflowY: 'auto' }} paddingInline="space-4" paddingBlock="space-4">
              {filteredApps.length === 0 ? (
                <BodyShort size="small" textColor="subtle">
                  {search
                    ? 'Ingen applikasjoner matcher søket.'
                    : naisCatalogFailed
                      ? 'Ingen applikasjoner å vise — Nais-katalogen er utilgjengelig.'
                      : addableApps.length === 0
                        ? 'Alle Nais-applikasjoner er allerede koblet til teamet.'
                        : 'Ingen applikasjoner funnet i Nais.'}
                </BodyShort>
              ) : (
                <VStack gap="space-16">
                  {[...appsByNaisTeam.entries()].map(([naisTeam, apps]) => (
                    <CheckboxGroup key={naisTeam} legend={naisTeam} size="small">
                      {apps.map((app) => (
                        <Checkbox
                          key={`${app.team_slug}|${app.environment_name}|${app.app_name}`}
                          name="app_ref"
                          value={refValue(app)}
                        >
                          <HStack gap="space-8" align="center" wrap>
                            <span>{app.app_name}</span>
                            <BodyShort as="span" size="small" textColor="subtle">
                              ({app.environment_name})
                            </BodyShort>
                            {app.monitored_id === null && (
                              <Tag size="xsmall" variant="info">
                                Ny i overvåking
                              </Tag>
                            )}
                          </HStack>
                        </Checkbox>
                      ))}
                    </CheckboxGroup>
                  ))}
                </VStack>
              )}
            </Box>
          </VStack>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button type="submit" form="add-apps-form" size="small" loading={isSubmitting}>
          Legg til valgte
        </Button>
        <Button variant="tertiary" size="small" type="button" onClick={closeModal}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
})

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
