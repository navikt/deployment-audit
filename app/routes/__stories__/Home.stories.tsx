import { Alert, BodyShort, Box, Button, Heading, HGrid, HStack, Select, Tag, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { Link } from 'react-router'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { mockApps } from './mock-data'

interface DevTeamSummaryStats {
  total_apps: number
  total_deployments: number
  with_four_eyes: number
  without_four_eyes: number
  pending_verification: number
  four_eyes_percentage: number
  apps_with_issues: number
}

interface DevTeamInfo {
  id: number
  name: string
  slug: string
  nais_team_slugs: string[]
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

function HomePage({
  selectedDevTeam = null,
  availableDevTeams = [],
  teamStats = null,
  issueApps = [],
  isAdmin = false,
}: {
  selectedDevTeam?: DevTeamInfo | null
  availableDevTeams?: DevTeamInfo[]
  teamStats?: DevTeamSummaryStats | null
  issueApps?: AppCardData[]
  isAdmin?: boolean
}) {
  return (
    <VStack gap="space-32">
      {isAdmin && (
        <HStack justify="end">
          <Button as={Link} to="/apps/add" size="small" variant="secondary">
            Legg til applikasjon
          </Button>
        </HStack>
      )}

      {!selectedDevTeam && (
        <VStack gap="space-16">
          <Alert variant="info">
            Velg ditt utviklingsteam for å se en personalisert oversikt over applikasjoner som trenger oppfølging.
          </Alert>
          {availableDevTeams.length > 0 && (
            <HStack gap="space-16" align="end">
              <Select label="Velg utviklingsteam" name="devTeamId">
                <option value="">— Velg team —</option>
                {availableDevTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
              <Button size="medium">Velg team</Button>
            </HStack>
          )}
        </VStack>
      )}

      {selectedDevTeam && teamStats && (
        <VStack gap="space-24">
          <HStack justify="space-between" align="center" wrap>
            <HStack gap="space-12" align="center">
              <Heading level="2" size="medium">
                {selectedDevTeam.name}
              </Heading>
              {selectedDevTeam.nais_team_slugs.map((slug) => (
                <Tag key={slug} variant="neutral" size="xsmall">
                  {slug}
                </Tag>
              ))}
            </HStack>
          </HStack>

          <TeamStatsCard stats={teamStats} />

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

const mockDevTeam: DevTeamInfo = {
  id: 1,
  name: 'Motta pensjon',
  slug: 'motta-pensjon',
  nais_team_slugs: ['pensjondeployer', 'pensjonsamhandling'],
}

const mockAvailableTeams: DevTeamInfo[] = [
  mockDevTeam,
  { id: 2, name: 'Beregne pensjon', slug: 'beregne-pensjon', nais_team_slugs: ['pensjonberegning'] },
  { id: 3, name: 'Utbetale pensjon', slug: 'utbetale-pensjon', nais_team_slugs: ['pensjonutbetaling'] },
]

const mockTeamStats: DevTeamSummaryStats = {
  total_apps: 5,
  total_deployments: 42,
  with_four_eyes: 38,
  without_four_eyes: 2,
  pending_verification: 2,
  four_eyes_percentage: 90,
  apps_with_issues: 2,
}

const mockIssueApps = mockApps.filter((app) => app.stats.without_four_eyes > 0 || app.stats.pending_verification > 0)

const meta: Meta<typeof HomePage> = {
  title: 'Pages/Home',
  component: HomePage,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1200px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof HomePage>

export const WithTeamSelected: Story = {
  name: 'Med valgt team',
  args: {
    selectedDevTeam: mockDevTeam,
    availableDevTeams: mockAvailableTeams,
    teamStats: mockTeamStats,
    issueApps: mockIssueApps,
  },
}

export const NoTeamSelected: Story = {
  name: 'Ingen team valgt',
  args: {
    selectedDevTeam: null,
    availableDevTeams: mockAvailableTeams,
    teamStats: null,
    issueApps: [],
  },
}

export const AllAppsOk: Story = {
  name: 'Alle apper i orden',
  args: {
    selectedDevTeam: mockDevTeam,
    availableDevTeams: mockAvailableTeams,
    teamStats: { ...mockTeamStats, apps_with_issues: 0, without_four_eyes: 0 },
    issueApps: [],
  },
}

export const HighCoverage: Story = {
  name: 'Høy dekning (95%+)',
  args: {
    selectedDevTeam: mockDevTeam,
    availableDevTeams: mockAvailableTeams,
    teamStats: { ...mockTeamStats, four_eyes_percentage: 98, apps_with_issues: 0 },
    issueApps: [],
  },
}

export const LowCoverage: Story = {
  name: 'Lav dekning (<80%)',
  args: {
    selectedDevTeam: mockDevTeam,
    availableDevTeams: mockAvailableTeams,
    teamStats: { ...mockTeamStats, four_eyes_percentage: 65, apps_with_issues: 3 },
    issueApps: mockApps.slice(0, 3),
  },
}

export const AdminView: Story = {
  name: 'Som admin',
  args: {
    selectedDevTeam: mockDevTeam,
    availableDevTeams: mockAvailableTeams,
    teamStats: mockTeamStats,
    issueApps: mockIssueApps,
    isAdmin: true,
  },
}
