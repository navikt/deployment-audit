import { BarChartIcon, ClockIcon, PlusIcon } from '@navikt/aksel-icons'
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
import { getAllActiveRepositories } from '~/db/application-repositories.server'
import { type Board, createBoard, getBoardsByDevTeam } from '~/db/boards.server'
import { type BoardObjectiveProgress, getBoardObjectiveProgress } from '~/db/dashboard-stats.server'
import { getDevTeamCoverageStats } from '~/db/deployment-goal-links.server'
import { getAppDeploymentStatsBatch } from '~/db/deployments.server'
import {
  getAvailableAppsForDevTeam,
  getDevTeamApplications,
  getDevTeamBySlug,
  setDevTeamApplications,
} from '~/db/dev-teams.server'
import {
  createMonitoredApplication,
  getAllAlertCounts,
  getAllMonitoredApplications,
} from '~/db/monitored-applications.server'
import { getSectionBySlug } from '~/db/sections.server'
import { type DevTeamMember, getDevTeamMembers } from '~/db/user-dev-team-preference.server'
import { requireUser } from '~/lib/auth.server'
import { type BoardPeriodType, formatBoardLabel, getPeriodsForYear } from '~/lib/board-periods'
import { groupAppCards } from '~/lib/group-app-cards'
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
  const [boards, members, directApps, allApps, alertCounts, activeRepos, availableApps, naisCatalog] =
    await Promise.all([
      getBoardsByDevTeam(devTeam.id),
      getDevTeamMembers(devTeam.id).catch(() => [] as DevTeamMember[]),
      getDevTeamApplications(devTeam.id),
      getAllMonitoredApplications(),
      getAllAlertCounts(),
      getAllActiveRepositories(),
      getAvailableAppsForDevTeam(devTeam.id),
      fetchAllTeamsAndApplications().catch((err) => {
        // Fall back to "no Nais data" so the team page still loads. The dialog
        // surfaces the empty state with an explanation.
        console.error('Kunne ikke hente Nais-katalog:', err)
        return [] as Array<{ teamSlug: string; appName: string; environmentName: string }>
      }),
    ])

  // Merge Nais catalog with monitored state for the add/link dialog.
  const allowedEnvs =
    process.env.ALLOWED_ENVIRONMENTS?.split(',')
      .map((e) => e.trim())
      .filter(Boolean) ?? []
  const linkableMap = new Map(availableApps.map((a) => [`${a.team_slug}|${a.environment_name}|${a.app_name}`, a]))
  const filteredCatalog =
    allowedEnvs.length > 0 ? naisCatalog.filter((a) => allowedEnvs.includes(a.environmentName)) : naisCatalog
  const naisApps: NaisAppRow[] = filteredCatalog
    .map((entry) => {
      const monitored = linkableMap.get(`${entry.teamSlug}|${entry.environmentName}|${entry.appName}`)
      return {
        team_slug: entry.teamSlug,
        environment_name: entry.environmentName,
        app_name: entry.appName,
        monitored_id: monitored?.id ?? null,
        is_linked: monitored?.is_linked ?? false,
      }
    })
    .sort(
      (a, b) =>
        a.team_slug.localeCompare(b.team_slug, 'nb') ||
        a.app_name.localeCompare(b.app_name, 'nb') ||
        a.environment_name.localeCompare(b.environment_name, 'nb'),
    )

  const activeBoard = boards.find((b) => b.is_active) ?? null
  const activeBoardProgress = activeBoard ? await getBoardObjectiveProgress(activeBoard.id) : []

  // Build app cards: direct links + nais team matches
  const directAppIds = new Set(directApps.map((a) => a.monitored_app_id))
  const naisTeamSlugs = devTeam.nais_team_slugs ?? []
  const teamApps = allApps.filter(
    (app) => app.is_active && (directAppIds.has(app.id) || naisTeamSlugs.includes(app.team_slug)),
  )

  // Filter stats to deploys made by team members (their GitHub usernames).
  const deployerUsernames = members.map((m) => m.github_username).filter((u): u is string => !!u)
  const hasMappedMembers = deployerUsernames.length > 0

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
  ).sort((a, b) => a.app_name.localeCompare(b.app_name, 'nb'))

  const section = await getSectionBySlug(params.sectionSlug)

  return {
    devTeam,
    boards,
    activeBoard,
    activeBoardProgress,
    members,
    appCards,
    naisApps,
    sectionSlug: params.sectionSlug,
    sectionName: section?.name ?? params.sectionSlug,
    teamCoverage,
    hasMappedMembers,
    unmappedMemberCount: members.length - deployerUsernames.length,
  }
}

type NaisAppRow = {
  team_slug: string
  environment_name: string
  app_name: string
  monitored_id: number | null
  is_linked: boolean
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
  if (intent === 'update_apps' && user.role !== 'admin') {
    const teamMembers = await getDevTeamMembers(devTeam.id)
    const isMember = teamMembers.some((m) => m.nav_ident.toUpperCase() === user.navIdent.toUpperCase())
    if (!isMember) {
      return { error: 'Du må være medlem av teamet for å endre applikasjoner.' }
    }
  }

  if (intent === 'update_apps') {
    /**
     * Each `app_ref` entry is either:
     *   - "id:<n>"             → existing monitored_application id, link as-is
     *   - "new:<team>|<env>|<app>"  → not yet monitored; create then link
     *
     * The new-entry path validates against Nais (defense-in-depth on top of
     * the UI-only filter) so we never insert a row that can't sync.
     */
    const refs = formData.getAll('app_ref').map(String)
    const existingIds: number[] = []
    const newIdentities: Array<{ team_slug: string; environment_name: string; app_name: string }> = []
    for (const ref of refs) {
      if (ref.startsWith('id:')) {
        const n = Number(ref.slice(3))
        if (Number.isInteger(n) && n > 0) existingIds.push(n)
      } else if (ref.startsWith('new:')) {
        const [team, env, app] = ref.slice(4).split('|')
        if (team && env && app) {
          newIdentities.push({ team_slug: team, environment_name: env, app_name: app })
        }
      }
    }

    try {
      const createdIds: number[] = []
      for (const id of newIdentities) {
        const found = await getApplicationInfo(id.team_slug, id.environment_name, id.app_name)
        if (!found) {
          return {
            error: `Fant ikke ${id.app_name} i Nais-team ${id.team_slug} (miljø ${id.environment_name}). Last siden på nytt og prøv igjen.`,
          }
        }
        const monitoredApp = await createMonitoredApplication({
          team_slug: id.team_slug,
          environment_name: id.environment_name,
          app_name: id.app_name,
        })
        createdIds.push(monitoredApp.id)
      }
      await setDevTeamApplications(devTeam.id, [...existingIds, ...createdIds], user.navIdent)
      const createdMsg =
        createdIds.length > 0
          ? ` (${createdIds.length} ny${createdIds.length === 1 ? '' : 'e'} app${createdIds.length === 1 ? '' : 'er'} lagt til overvåking)`
          : ''
      return { success: `Applikasjoner oppdatert${createdMsg}.` }
    } catch (error) {
      return { error: `Kunne ikke oppdatere applikasjoner: ${error}` }
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
    naisApps,
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
        <Heading level="1" size="large" spacing>
          {devTeam.name}
        </Heading>
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
        devTeamId={devTeam.id}
        naisApps={naisApps}
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
            <HStack gap="space-8">
              <Tag variant="success" size="xsmall">
                Aktiv
              </Tag>
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
  { devTeamId: number; naisApps: NaisAppRow[]; isSubmitting: boolean }
>(function AddAppsDialog({ devTeamId, naisApps, isSubmitting }, ref) {
  const [search, setSearch] = useState('')

  const searchLower = search.toLowerCase()
  const filteredApps = useMemo(
    () =>
      search
        ? naisApps.filter(
            (app) =>
              app.app_name.toLowerCase().includes(searchLower) ||
              app.team_slug.toLowerCase().includes(searchLower) ||
              app.environment_name.toLowerCase().includes(searchLower),
          )
        : naisApps,
    [naisApps, search, searchLower],
  )

  const appsByNaisTeam = useMemo(() => {
    const grouped = new Map<string, NaisAppRow[]>()
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
  // The action handler materializes new rows and then replaces the team's
  // links in one call, so this single submit covers both link and add+link.
  const refValue = (app: NaisAppRow) =>
    app.monitored_id !== null
      ? `id:${app.monitored_id}`
      : `new:${app.team_slug}|${app.environment_name}|${app.app_name}`

  return (
    <Modal ref={ref} header={{ heading: 'Legg til / koble applikasjoner' }} closeOnBackdropClick width="640px">
      <Modal.Body>
        <Form
          method="post"
          id="update-apps-form"
          onSubmit={() => {
            closeModal()
          }}
        >
          <input type="hidden" name="intent" value="update_apps" />
          <input type="hidden" name="id" value={devTeamId} />
          <VStack gap="space-12">
            <BodyShort size="small" textColor="subtle">
              Lista viser alle applikasjoner i Nais. Apper som allerede er overvåket har grå merkelapp; nye apper
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
                  {search ? 'Ingen applikasjoner matcher søket.' : 'Ingen applikasjoner funnet i Nais.'}
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
                          defaultChecked={app.is_linked}
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
                            {app.is_linked && (
                              <Tag size="xsmall" variant="neutral">
                                Allerede koblet
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
        <Button type="submit" form="update-apps-form" size="small" loading={isSubmitting}>
          Lagre
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
