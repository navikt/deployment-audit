import { ChevronLeftIcon, ChevronRightIcon, LinkBrokenIcon, LinkIcon } from '@navikt/aksel-icons'
import { BodyShort, Box, Button, Detail, Hide, HStack, Select, Show, Tag, TextField, VStack } from '@navikt/ds-react'
import { Form, Link, redirect, useLoaderData, useSearchParams } from 'react-router'
import { MethodTag, StatusTag } from '~/components/deployment-tags'
import { ErrorReasonWithLink } from '~/components/ErrorReasonWithLink'
import { ExternalLink } from '~/components/ExternalLink'
import { UserName } from '~/components/UserName'
import { getGroupContext } from '~/db/application-groups.server'
import { pool } from '~/db/connection.server'
import { type DeploymentFilters, getDeploymentsPaginated } from '~/db/deployments.server'
import { getDevTeamsForApp, getDevTeamsForApps } from '~/db/dev-teams.server'
import { getMonitoredApplicationByIdentity } from '~/db/monitored-applications.server'
import { getMembersGithubUsernamesForDevTeams, getUserDevTeams } from '~/db/user-dev-team-preference.server'
import { getUserMappingByNavIdent, getUserMappings } from '~/db/user-mappings.server'
import { getUserIdentity } from '~/lib/auth.server'
import type { FourEyesStatus } from '~/lib/four-eyes-status'
import { requireTeamEnvAppParams } from '~/lib/route-params.server'
import { getDateRangeForPeriod, TIME_PERIOD_OPTIONS, type TimePeriod } from '~/lib/time-periods'
import { serializeUserMappings } from '~/lib/user-display'
import styles from '~/styles/common.module.css'
import type { Route } from './+types/$team.env.$env.app.$app.deployments'

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.app ? `Deployments - ${data.app.app_name}` : 'Deployments' }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { team, env, app: appName } = requireTeamEnvAppParams(params)

  const app = await getMonitoredApplicationByIdentity(team, env, appName)
  if (!app) {
    throw new Response('Application not found', { status: 404 })
  }

  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const status = url.searchParams.get('status') || undefined
  const method = url.searchParams.get('method') as 'pr' | 'direct_push' | 'legacy' | undefined
  const goal = url.searchParams.get('goal') as 'missing' | 'linked' | undefined
  const deployer = url.searchParams.get('deployer') || undefined
  const sha = url.searchParams.get('sha') || undefined
  const period = (url.searchParams.get('period') || 'last-week') as TimePeriod
  const showGroup = url.searchParams.get('group') === 'true'
  const teamFilter = url.searchParams.get('team') || ''

  const range = getDateRangeForPeriod(period)

  // Check if this app belongs to an application group
  const { group: appGroup, siblings: allSiblings } = await getGroupContext(app.id)
  const hasGroup = allSiblings.length > 0
  const siblings = showGroup ? allSiblings : []

  // Resolve current user (used for "Meg" deployer shortcut and "Mine team" filter)
  const currentUser = await getUserIdentity(request)

  // Dev teams owning this app (or group siblings) — used to populate the team-filter dropdown.
  // When viewing a group, check ownership across ALL sibling apps so a dev team
  // that only owns a secondary app in the group is still found.
  const owningDevTeams =
    showGroup && hasGroup
      ? await getDevTeamsForApps([
          { monitoredAppId: app.id, teamSlug: app.team_slug },
          ...allSiblings.map((s) => ({ monitoredAppId: s.id, teamSlug: s.team_slug })),
        ])
      : await getDevTeamsForApp(app.id, app.team_slug)

  // User's chosen dev teams — needed both to render the "Mine team" option
  // (only shown when the user has selected at least one team) and to resolve
  // it to a list of GitHub usernames when applied.
  let userDevTeams: Awaited<ReturnType<typeof getUserDevTeams>> = []
  if (currentUser?.navIdent) {
    try {
      userDevTeams = await getUserDevTeams(currentUser.navIdent)
    } catch {
      // user_dev_team_preference table may not exist yet
    }
  }

  // Resolve the team filter to a list of GitHub usernames.
  // - "" / "all"  → no filter (undefined)
  // - "mine"      → union of all members across the user's dev teams
  // - "<slug>"    → members of that single dev team (must own the app)
  //
  // We track *why* the resolved set is empty so the UI can give a useful
  // empty-state hint instead of generic "no deployments". `teamFilterEmpty`
  // is true only when the filter was applied but yields no candidate users.
  let deployerUsernamesFilter: string[] | undefined
  let teamFilterEmptyReason: 'no-user-teams' | 'no-team-members' | null = null
  // Wrap helper calls in try/catch so the page still works if the
  // user_dev_team_preference table hasn't been deployed yet (matches the
  // graceful degradation for getUserDevTeams above) — fall back to no filter.
  if (teamFilter === 'mine') {
    if (userDevTeams.length === 0) {
      deployerUsernamesFilter = []
      teamFilterEmptyReason = 'no-user-teams'
    } else {
      try {
        deployerUsernamesFilter = await getMembersGithubUsernamesForDevTeams(userDevTeams.map((t) => t.id))
        if (deployerUsernamesFilter.length === 0) teamFilterEmptyReason = 'no-team-members'
      } catch {
        deployerUsernamesFilter = undefined
      }
    }
  } else if (teamFilter) {
    const matched = owningDevTeams.find((t) => t.slug === teamFilter)
    if (matched) {
      try {
        deployerUsernamesFilter = await getMembersGithubUsernamesForDevTeams([matched.id])
        if (deployerUsernamesFilter.length === 0) teamFilterEmptyReason = 'no-team-members'
      } catch {
        deployerUsernamesFilter = undefined
      }
    }
    // If the slug doesn't match an owning team, silently ignore (treat as "Alle")
  }

  const isUnmappedFilter = deployer === '__unmapped__'

  const filters: DeploymentFilters = {
    ...(showGroup && hasGroup
      ? { monitored_app_ids: [app.id, ...siblings.map((s) => s.id)], per_app_audit_start_year: true }
      : { monitored_app_id: app.id, audit_start_year: app.audit_start_year }),
    page,
    per_page: 20,
    four_eyes_status: status,
    method: method && ['pr', 'direct_push', 'legacy'].includes(method) ? method : undefined,
    goal_filter: goal && ['missing', 'linked'].includes(goal) ? goal : undefined,
    deployer_username: isUnmappedFilter ? undefined : deployer,
    unmapped_deployers: isUnmappedFilter || undefined,
    deployer_usernames: deployerUsernamesFilter,
    commit_sha: sha,
    start_date: range?.startDate,
    end_date: range?.endDate,
  }

  const result = await getDeploymentsPaginated(filters)

  // Redirect to last valid page if requested page exceeds total pages
  if (page > result.total_pages && result.total_pages > 0) {
    url.searchParams.set('page', String(result.total_pages))
    throw redirect(url.pathname + url.search)
  }

  // ── Parallel: error reasons, all deployers, and current user GitHub mapping ──
  const errorDeploymentIds = result.deployments.filter((d) => d.four_eyes_status === 'error').map((d) => d.id)
  const appIds = showGroup && hasGroup ? [app.id, ...siblings.map((s) => s.id)] : [app.id]

  const [errorReasonsResult, allDeployersResult, currentUserMapping] = await Promise.all([
    errorDeploymentIds.length > 0
      ? pool.query(
          `SELECT DISTINCT ON (deployment_id) deployment_id, result
           FROM verification_runs
           WHERE deployment_id = ANY($1)
           ORDER BY deployment_id, run_at DESC`,
          [errorDeploymentIds],
        )
      : Promise.resolve({ rows: [] as any[] }),
    pool.query(
      `SELECT DISTINCT d.deployer_username
       FROM deployments d
       INNER JOIN monitored_applications ma ON d.monitored_app_id = ma.id
       WHERE d.monitored_app_id = ANY($1)
         AND d.deployer_username IS NOT NULL
         AND d.deployer_username != ''
         AND (ma.audit_start_year IS NULL OR d.created_at >= make_date(ma.audit_start_year, 1, 1))
       ORDER BY d.deployer_username`,
      [appIds],
    ),
    currentUser?.navIdent ? getUserMappingByNavIdent(currentUser.navIdent) : Promise.resolve(null),
  ])

  const errorReasons: Record<number, string> = Object.fromEntries(
    errorReasonsResult.rows
      .filter((row: any) => row.result?.approvalDetails?.reason)
      .map((row: any) => [row.deployment_id, row.result.approvalDetails.reason as string]),
  )

  const allDeployers = allDeployersResult.rows.map((r: any) => r.deployer_username as string)

  // Get display names for deployers (current page + all distinct deployers for filter)
  const deployerUsernames = [...new Set(result.deployments.map((d) => d.deployer_username).filter(Boolean))] as string[]
  const allUsernamesForMapping = [...new Set([...deployerUsernames, ...allDeployers])]
  const userMappings = await getUserMappings(allUsernamesForMapping)

  // Build deployer options with display names
  const deployerOptions = allDeployers.map((username) => {
    const mapping = userMappings.get(username)
    return { value: username, label: mapping?.display_name || username }
  })
  deployerOptions.sort((a, b) => a.label.localeCompare(b.label, 'no'))

  // Check if any deployer in the audit window lacks an active mapping
  const hasUnmappedDeployers = allDeployers.some((u) => {
    const m = userMappings.get(u)
    return !m || m.deleted_at !== null
  })

  // Find current user's GitHub username for "Meg" shortcut
  let currentUserGithub: string | null = null
  if (currentUserMapping?.github_username && allDeployers.includes(currentUserMapping.github_username)) {
    currentUserGithub = currentUserMapping.github_username
  }

  // Build dropdown options for the team filter. "Mine team" is only offered
  // when the user actually has dev-team preferences set.
  const teamOptions: { value: string; label: string }[] = []
  if (userDevTeams.length > 0) {
    teamOptions.push({ value: 'mine', label: 'Mine team' })
  }
  for (const t of owningDevTeams) {
    teamOptions.push({ value: t.slug, label: t.name })
  }

  return {
    app,
    userMappings: serializeUserMappings(userMappings),
    deployerOptions,
    currentUserGithub,
    hasGroup,
    showGroup: showGroup && hasGroup,
    appGroup,
    groupSiblings: allSiblings,
    errorReasons,
    teamOptions,
    teamFilterEmptyReason,
    hasUnmappedDeployers,
    ...result,
  }
}

export default function AppDeployments() {
  const {
    app,
    deployments,
    total,
    page,
    total_pages,
    userMappings,
    deployerOptions,
    currentUserGithub,
    hasGroup,
    showGroup,
    appGroup,
    groupSiblings,
    errorReasons,
    teamOptions,
    teamFilterEmptyReason,
    hasUnmappedDeployers,
  } = useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()

  const currentStatus = searchParams.get('status') || ''
  const currentMethod = searchParams.get('method') || ''
  const currentGoal = searchParams.get('goal') || ''
  const currentDeployer = searchParams.get('deployer') || ''
  const currentSha = searchParams.get('sha') || ''
  const currentPeriod = searchParams.get('period') || 'last-week'
  const currentTeam = searchParams.get('team') || ''

  const updateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    newParams.set('page', '1') // Reset to page 1 when filtering
    setSearchParams(newParams)
  }

  const goToPage = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', String(newPage))
    setSearchParams(newParams)
  }

  return (
    <VStack gap="space-32">
      {/* Group info banner */}
      {appGroup && !showGroup && (
        <Box padding="space-16" borderRadius="8" background="neutral-soft">
          <HStack gap="space-8" align="center" justify="space-between" wrap>
            <BodyShort size="small">
              Denne appen er del av gruppen <strong>{appGroup.name}</strong>
              {groupSiblings.length > 0 && (
                <>
                  {' — '}
                  {groupSiblings.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ', '}
                      <Link to={`/team/${s.team_slug}/env/${s.environment_name}/app/${s.app_name}/deployments`}>
                        {s.app_name} ({s.environment_name})
                      </Link>
                    </span>
                  ))}
                </>
              )}
            </BodyShort>
            {hasGroup && (
              <Button variant="tertiary" size="xsmall" onClick={() => updateFilter('group', 'true')}>
                Vis alle miljøer
              </Button>
            )}
          </HStack>
        </Box>
      )}
      <Box padding="space-20" borderRadius="8" background="sunken">
        <Form method="get">
          <VStack gap="space-16">
            <HStack gap="space-16" wrap>
              <Select
                label="Tidsperiode"
                size="small"
                value={currentPeriod}
                onChange={(e) => updateFilter('period', e.target.value)}
              >
                {TIME_PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>

              <Select
                label="Status"
                size="small"
                value={currentStatus}
                onChange={(e) => updateFilter('status', e.target.value)}
              >
                <option value="">Alle</option>
                <option value="approved">Godkjent</option>
                <option value="manually_approved">Manuelt godkjent</option>
                <option value="not_approved">Ikke godkjent</option>
                <option value="pending">Venter</option>
                <option value="legacy">Legacy</option>
                <option value="legacy_pending">Legacy (venter)</option>
                <option value="baseline">Baseline</option>
                <option value="pending_baseline">Baseline (venter)</option>
                <option value="error">Feil</option>
                <option value="unknown">Ukjent</option>
              </Select>

              <Select
                label="Metode"
                size="small"
                value={currentMethod}
                onChange={(e) => updateFilter('method', e.target.value)}
              >
                <option value="">Alle</option>
                <option value="pr">Pull Request</option>
                <option value="direct_push">Direct Push</option>
                <option value="legacy">Legacy</option>
              </Select>

              <Select
                label="Endringsopphav"
                size="small"
                value={currentGoal}
                onChange={(e) => updateFilter('goal', e.target.value)}
              >
                <option value="">Alle</option>
                <option value="missing">Mangler</option>
                <option value="linked">Koblet</option>
              </Select>

              <Select
                label="Deployer"
                size="small"
                value={currentDeployer}
                onChange={(e) => updateFilter('deployer', e.target.value)}
              >
                <option value="">Alle</option>
                {currentUserGithub && <option value={currentUserGithub}>Meg</option>}
                {(hasUnmappedDeployers || currentDeployer === '__unmapped__') && (
                  <option value="__unmapped__">Manglende mapping</option>
                )}
                {deployerOptions
                  .filter((opt) => opt.value !== currentUserGithub)
                  .map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
              </Select>

              {teamOptions.length > 0 && (
                <Select
                  label="Team"
                  size="small"
                  value={currentTeam}
                  onChange={(e) => updateFilter('team', e.target.value)}
                >
                  <option value="">Alle</option>
                  {teamOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              )}

              <TextField
                label="Commit SHA"
                size="small"
                value={currentSha}
                onChange={(e) => updateFilter('sha', e.target.value)}
                placeholder="Søk..."
              />
            </HStack>
          </VStack>
        </Form>
      </Box>

      <HStack justify="space-between" align="center" wrap>
        <BodyShort textColor="subtle">
          {total} deployment{total !== 1 ? 's' : ''} funnet
          {showGroup && ' (alle miljøer)'}
        </BodyShort>
        {hasGroup && (
          <Button
            variant={showGroup ? 'secondary' : 'tertiary'}
            size="small"
            onClick={() => updateFilter('group', showGroup ? '' : 'true')}
          >
            {showGroup ? 'Vis kun dette miljøet' : 'Vis alle miljøer'}
          </Button>
        )}
      </HStack>

      {/* Deployments list */}
      <div>
        {deployments.length === 0 ? (
          <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
            <BodyShort>
              {teamFilterEmptyReason === 'no-user-teams'
                ? 'Du har ikke valgt noen utviklingsteam under dine preferanser, så «Mine team» gir ingen treff.'
                : teamFilterEmptyReason === 'no-team-members'
                  ? 'Det valgte teamet har ingen medlemmer med GitHub-brukernavn registrert, så filteret gir ingen treff.'
                  : 'Ingen deployments funnet med valgte filtre.'}
            </BodyShort>
          </Box>
        ) : (
          deployments.map((deployment) => (
            <Box key={deployment.id} padding="space-20" background="raised" className={styles.stackedListItem}>
              <VStack gap="space-12">
                {/* First row: Time, Title (on desktop), Tags (right-aligned) */}
                <HStack gap="space-8" align="center" justify="space-between">
                  <HStack gap="space-8" align="center" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <BodyShort weight="semibold" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(deployment.created_at).toLocaleString('no-NO', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </BodyShort>
                    {showGroup && deployment.environment_name !== app.environment_name && (
                      <Tag variant="neutral" size="xsmall">
                        {deployment.environment_name}
                      </Tag>
                    )}
                    {/* Title on desktop - inline with time */}
                    <Show above="md">
                      {deployment.title && (
                        <BodyShort className={styles.truncateText} style={{ flex: 1, minWidth: 0 }}>
                          {deployment.title}
                        </BodyShort>
                      )}
                    </Show>
                  </HStack>
                  <HStack gap="space-8" style={{ flexShrink: 0 }}>
                    <MethodTag
                      github_pr_number={deployment.github_pr_number}
                      four_eyes_status={deployment.four_eyes_status as FourEyesStatus}
                    />
                    <StatusTag four_eyes_status={deployment.four_eyes_status as FourEyesStatus} />
                    {deployment.has_goal_link ? (
                      <Tag variant="info" size="xsmall" icon={<LinkIcon aria-hidden />}>
                        Koblet
                      </Tag>
                    ) : (
                      <Tag variant="neutral" size="xsmall" icon={<LinkBrokenIcon aria-hidden />}>
                        Mangler
                      </Tag>
                    )}
                  </HStack>
                </HStack>

                {/* Title on mobile - separate line */}
                <Hide above="md">
                  {deployment.title && <BodyShort className={styles.truncateText}>{deployment.title}</BodyShort>}
                </Hide>

                {/* Second row: Details and View button */}
                <HStack gap="space-16" align="center" justify="space-between" wrap>
                  <HStack gap="space-16" wrap>
                    <Detail textColor="subtle">
                      <UserName username={deployment.deployer_username} userMappings={userMappings} />
                    </Detail>
                    <Detail textColor="subtle">
                      {deployment.commit_sha ? (
                        <ExternalLink
                          href={`https://github.com/${deployment.detected_github_owner}/${deployment.detected_github_repo_name}/commit/${deployment.commit_sha}`}
                          style={{ fontFamily: 'monospace' }}
                        >
                          {deployment.commit_sha.substring(0, 7)}
                        </ExternalLink>
                      ) : (
                        '(ukjent)'
                      )}
                    </Detail>
                    {deployment.github_pr_number && (
                      <Detail textColor="subtle">
                        {deployment.github_pr_url ? (
                          <ExternalLink href={deployment.github_pr_url}>#{deployment.github_pr_number}</ExternalLink>
                        ) : (
                          <>#{deployment.github_pr_number}</>
                        )}
                      </Detail>
                    )}
                  </HStack>
                  <Button
                    as={Link}
                    to={`/team/${deployment.team_slug}/env/${deployment.environment_name}/app/${deployment.app_name}/deployments/${deployment.id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
                    variant="tertiary"
                    size="small"
                  >
                    Vis
                  </Button>
                </HStack>

                {/* Error reason for deployments with error status */}
                {errorReasons[deployment.id] && (
                  <ErrorReasonWithLink
                    errorReason={errorReasons[deployment.id]}
                    githubOwner={deployment.detected_github_owner}
                    githubRepoName={deployment.detected_github_repo_name}
                  />
                )}
              </VStack>
            </Box>
          ))
        )}
      </div>

      {/* Pagination */}
      {total_pages > 1 && (
        <HStack gap="space-16" justify="center" align="center">
          <Button
            variant="tertiary"
            size="small"
            icon={<ChevronLeftIcon aria-hidden />}
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            Forrige
          </Button>
          <BodyShort>
            Side {page} av {total_pages}
          </BodyShort>
          <Button
            variant="tertiary"
            size="small"
            icon={<ChevronRightIcon aria-hidden />}
            iconPosition="right"
            disabled={page >= total_pages}
            onClick={() => goToPage(page + 1)}
          >
            Neste
          </Button>
        </HStack>
      )}
    </VStack>
  )
}
