import { Alert, Button, Heading, HStack, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { Link } from 'react-router'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { mockApps } from './mock-data'

// Simplified Home component for Storybook (without loader dependencies)
function HomePage({ apps, isAdmin = false }: { apps: AppCardData[]; isAdmin?: boolean }) {
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
      {isAdmin && (
        <HStack justify="end">
          <Button as={Link} to="/apps/add" size="small" variant="secondary">
            Legg til applikasjon
          </Button>
        </HStack>
      )}

      {apps.length === 0 && <Alert variant="info">Ingen applikasjoner overvåkes ennå.</Alert>}

      {Object.entries(appsByTeam).map(([teamSlug, teamApps]) => (
        <VStack key={teamSlug} gap="space-16">
          <Link to={`/team/${teamSlug}`} style={{ textDecoration: 'none' }}>
            <Heading size="small">
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

export const Default: Story = {
  args: {
    apps: mockApps,
    isAdmin: false,
  },
}

export const AdminView: Story = {
  name: 'Som admin',
  args: {
    apps: mockApps,
    isAdmin: true,
  },
}

export const Empty: Story = {
  name: 'Tom liste',
  args: {
    apps: [],
    isAdmin: false,
  },
}

export const SingleTeam: Story = {
  name: 'Ett team',
  args: {
    apps: mockApps.filter((app) => app.team_slug === 'pensjondeployer'),
    isAdmin: false,
  },
}

export const WithAlerts: Story = {
  name: 'Med varsler',
  args: {
    apps: mockApps.map((app) => ({
      ...app,
      alertCount: Math.floor(Math.random() * 3),
    })),
    isAdmin: true,
  },
}
