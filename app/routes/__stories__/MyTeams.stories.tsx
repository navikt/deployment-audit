import { BarChartIcon, CheckmarkCircleIcon, ExclamationmarkTriangleIcon, LinkIcon } from '@navikt/aksel-icons'
import { Alert, BodyShort, Box, Button, Detail, Heading, HGrid, HStack, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { type BoardSummary, BoardSummaryCard } from '~/components/BoardSummaryCard'

interface DevTeamInfo {
  id: number
  name: string
  slug: string
  section_slug: string
  nais_team_slugs: string[]
}

interface DevTeamSummaryStats {
  total_apps: number
  total_deployments: number
  with_four_eyes: number
  without_four_eyes: number
  pending_verification: number
  linked_to_goal: number
  four_eyes_coverage: number
  goal_coverage: number
  four_eyes_percentage: number
  goal_percentage: number
  apps_with_issues: number
}

interface MyTeamsPageProps {
  selectedDevTeams: DevTeamInfo[]
  teamStats: DevTeamSummaryStats | null
  issueApps: AppCardData[]
  boardSummaries: BoardSummary[]
  profileId?: string
}

function SummaryCard({
  title,
  value,
  icon,
  variant = 'neutral',
}: {
  title: string
  value: string | number
  icon: ReactNode
  variant?: 'success' | 'warning' | 'error' | 'neutral'
}) {
  const bgMap = {
    success: 'success-soft' as const,
    warning: 'warning-soft' as const,
    error: 'danger-soft' as const,
    neutral: 'neutral-soft' as const,
  }

  return (
    <Box padding="space-20" borderRadius="8" background={bgMap[variant]}>
      <VStack gap="space-4">
        <HStack gap="space-8" align="center">
          {icon}
          <Detail textColor="subtle">{title}</Detail>
        </HStack>
        <Heading size="large" level="3">
          {value}
        </Heading>
      </VStack>
    </Box>
  )
}

function formatCoverage(ratio: number): string {
  const pct = Math.round(ratio * 100)
  if (ratio > 0 && pct === 0) return '<1%'
  if (ratio < 1 && pct === 100) return '99%'
  return `${pct}%`
}

function getHealthVariant(ratio: number): 'success' | 'warning' | 'error' | 'neutral' {
  if (ratio >= 1) return 'success'
  if (ratio >= 0.9) return 'warning'
  if (ratio > 0) return 'error'
  return 'neutral'
}

function getHealthLabel(fourEyes: number, goalCoverage: number): string {
  const min = Math.min(fourEyes, goalCoverage)
  if (min >= 1) return 'God'
  if (min >= 0.9) return 'Akseptabel'
  if (min > 0) return 'Trenger oppfølging'
  return 'Ingen data'
}

function getHealthIcon(fourEyes: number, goalCoverage: number): ReactNode {
  const min = Math.min(fourEyes, goalCoverage)
  if (min >= 0.9) return <CheckmarkCircleIcon aria-hidden />
  return <ExclamationmarkTriangleIcon aria-hidden />
}

/**
 * Presentational copy of the `/my-teams` page used for Storybook. Mirrors the
 * JSX in `app/routes/my-teams.tsx` but without the `loader`/`useLoaderData`
 * coupling so stories can drive it with mock data directly.
 */
function MyTeamsPage({ selectedDevTeams, teamStats, issueApps, boardSummaries, profileId }: MyTeamsPageProps) {
  return (
    <VStack gap="space-32">
      <div>
        <Heading level="1" size="xlarge" spacing>
          Mine team
        </Heading>
        <BodyShort textColor="subtle">Helsetilstand for dine utviklingsteam</BodyShort>
      </div>

      {selectedDevTeams.length === 0 && (
        <Alert variant="info">
          <VStack gap="space-8">
            <BodyShort>
              Du har ikke valgt noen utviklingsteam ennå. Gå til profilen din for å velge hvilke team du tilhører.
            </BodyShort>
            {profileId && (
              <div>
                <Button as={Link} to={`/users/${profileId}`} size="small" variant="secondary">
                  Min profil
                </Button>
              </div>
            )}
          </VStack>
        </Alert>
      )}

      {selectedDevTeams.length > 0 && teamStats && (
        <VStack gap="space-24">
          <HGrid gap="space-16" columns={{ xs: 1, sm: 2, lg: 4 }}>
            <SummaryCard
              title="Deployments i år"
              value={teamStats.total_deployments}
              icon={<BarChartIcon aria-hidden />}
            />
            <SummaryCard
              title="4-øyne dekning"
              value={formatCoverage(teamStats.four_eyes_coverage)}
              icon={<CheckmarkCircleIcon aria-hidden />}
              variant={getHealthVariant(teamStats.four_eyes_coverage)}
            />
            <SummaryCard
              title="Endringsopphav"
              value={formatCoverage(teamStats.goal_coverage)}
              icon={<LinkIcon aria-hidden />}
              variant={getHealthVariant(teamStats.goal_coverage)}
            />
            <SummaryCard
              title="Samlet helsetilstand"
              value={getHealthLabel(teamStats.four_eyes_coverage, teamStats.goal_coverage)}
              icon={getHealthIcon(teamStats.four_eyes_coverage, teamStats.goal_coverage)}
              variant={getHealthVariant(Math.min(teamStats.four_eyes_coverage, teamStats.goal_coverage))}
            />
          </HGrid>

          <HStack gap="space-8" wrap>
            <Button as={Link} to="/my-apps" size="small" variant="primary">
              Alle mine applikasjoner
            </Button>
            {selectedDevTeams.map((team) => (
              <Button
                key={team.id}
                as={Link}
                to={`/sections/${team.section_slug}/teams/${team.slug}`}
                size="small"
                variant="secondary"
              >
                {team.name}
              </Button>
            ))}
          </HStack>

          {boardSummaries.length > 0 && (
            <VStack gap="space-16">
              <Heading level="3" size="small">
                Aktive måltavler
              </Heading>
              <HGrid gap="space-16" columns={{ xs: 1, md: boardSummaries.length === 1 ? 1 : 2 }}>
                {boardSummaries.map((board) => (
                  <BoardSummaryCard key={board.boardId} board={board} />
                ))}
              </HGrid>
            </VStack>
          )}

          {issueApps.length > 0 ? (
            <VStack gap="space-16">
              <Heading level="3" size="small">
                Applikasjoner som trenger oppfølging ({issueApps.length})
              </Heading>
              <div>
                {issueApps.map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            </VStack>
          ) : (
            <Alert variant="success">Alle applikasjoner er i orden — ingen krever oppfølging.</Alert>
          )}
        </VStack>
      )}
    </VStack>
  )
}

const mockTeams: DevTeamInfo[] = [
  {
    id: 1,
    name: 'Skjermbildemodernisering',
    slug: 'skjermbildemodernisering',
    section_slug: 'pensjon',
    nais_team_slugs: ['pensjon-skjerm'],
  },
  {
    id: 2,
    name: 'Starte pensjon',
    slug: 'starte-pensjon',
    section_slug: 'pensjon',
    nais_team_slugs: ['pensjon-start'],
  },
]

const mockBoards: BoardSummary[] = [
  {
    boardId: 1,
    periodLabel: 'T1 2026',
    teamName: 'Skjermbildemodernisering',
    teamSlug: 'skjermbildemodernisering',
    sectionSlug: 'pensjon',
    objectives: [
      {
        objective_id: 1,
        objective_title: 'Forbedre brukeropplevelse i saksbehandlerverktøy',
        total_linked_deployments: 12,
      },
      { objective_id: 2, objective_title: 'Modernisere komponentbibliotek', total_linked_deployments: 7 },
    ],
  },
  {
    boardId: 2,
    periodLabel: 'T1 2026',
    teamName: 'Starte pensjon',
    teamSlug: 'starte-pensjon',
    sectionSlug: 'pensjon',
    objectives: [
      { objective_id: 10, objective_title: 'Lansere ny pensjonskalkulator', total_linked_deployments: 5 },
      { objective_id: 11, objective_title: 'Forenkle søknadsflyt', total_linked_deployments: 0 },
    ],
  },
]

const mockTeamStatsHealthy: DevTeamSummaryStats = {
  total_apps: 8,
  total_deployments: 142,
  with_four_eyes: 142,
  without_four_eyes: 0,
  pending_verification: 0,
  linked_to_goal: 138,
  four_eyes_coverage: 1,
  goal_coverage: 0.97,
  four_eyes_percentage: 100,
  goal_percentage: 97,
  apps_with_issues: 0,
}

const mockTeamStatsLowCoverage: DevTeamSummaryStats = {
  total_apps: 8,
  total_deployments: 142,
  with_four_eyes: 110,
  without_four_eyes: 32,
  pending_verification: 0,
  linked_to_goal: 65,
  four_eyes_coverage: 0.77,
  goal_coverage: 0.46,
  four_eyes_percentage: 77,
  goal_percentage: 46,
  apps_with_issues: 3,
}

const mockIssueApps: AppCardData[] = [
  {
    id: 100,
    team_slug: 'pensjon-skjerm',
    environment_name: 'prod-gcp',
    app_name: 'pensjon-skjermbilde',
    active_repo: 'navikt/pensjon-skjermbilde',
    stats: { total: 23, without_four_eyes: 4, pending_verification: 1 },
    alertCount: 2,
  },
  {
    id: 101,
    team_slug: 'pensjon-start',
    environment_name: 'prod-gcp',
    app_name: 'pensjon-soknad',
    active_repo: 'navikt/pensjon-soknad',
    stats: { total: 12, without_four_eyes: 2, pending_verification: 0 },
    alertCount: 0,
  },
]

const meta: Meta<typeof MyTeamsPage> = {
  title: 'Pages/MyTeams',
  component: MyTeamsPage,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof MyTeamsPage>

export const MedTavler: Story = {
  name: 'Med aktive måltavler',
  args: {
    selectedDevTeams: mockTeams,
    teamStats: mockTeamStatsHealthy,
    issueApps: [],
    boardSummaries: mockBoards,
  },
}

export const MedTavlerOgIssues: Story = {
  name: 'Med tavler og applikasjoner som trenger oppfølging',
  args: {
    selectedDevTeams: mockTeams,
    teamStats: mockTeamStatsLowCoverage,
    issueApps: mockIssueApps,
    boardSummaries: mockBoards,
  },
}

export const EnTavle: Story = {
  name: 'Kun én tavle (full bredde)',
  args: {
    selectedDevTeams: [mockTeams[0]],
    teamStats: mockTeamStatsHealthy,
    issueApps: [],
    boardSummaries: [mockBoards[0]],
  },
}

export const UtenTavler: Story = {
  name: 'Uten aktive måltavler',
  args: {
    selectedDevTeams: mockTeams,
    teamStats: mockTeamStatsHealthy,
    issueApps: [],
    boardSummaries: [],
  },
}

export const IngenTeamValgt: Story = {
  name: 'Ingen team valgt (tomstate)',
  args: {
    selectedDevTeams: [],
    teamStats: null,
    issueApps: [],
    boardSummaries: [],
    profileId: 'ola.nordmann',
  },
}
