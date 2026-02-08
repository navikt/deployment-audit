import { ExternalLinkIcon, PlusIcon } from '@navikt/aksel-icons'
import {
  Link as AkselLink,
  Alert,
  BodyShort,
  Box,
  Button,
  Detail,
  Heading,
  HGrid,
  HStack,
  VStack,
} from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { Link } from 'react-router'
import { mockDeployments, mockUserMapping } from './mock-data'

type UserMapping = {
  github_username: string
  display_name: string | null
  nav_email: string | null
  nav_ident: string | null
  slack_member_id: string | null
}

type Deployment = {
  id: number
  app_name: string
  environment_name: string
  team_slug: string
  created_at: string
}

function UserPage({
  username,
  mapping,
  deploymentCount,
  recentDeployments,
}: {
  username: string
  mapping: UserMapping | null
  deploymentCount: number
  recentDeployments: Deployment[]
}) {
  const formatDate = (date: string | Date) => {
    const d = new Date(date)
    return d.toLocaleDateString('nb-NO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <VStack gap="space-32">
      <div>
        <Heading size="large">{username}</Heading>
        {mapping?.display_name && <BodyShort textColor="subtle">{mapping.display_name}</BodyShort>}
      </div>

      <HGrid gap="space-16" columns={{ xs: 2, md: 4 }}>
        <Box padding="space-16" borderRadius="8" background="sunken">
          <VStack gap="space-4">
            <Detail textColor="subtle">Deployments</Detail>
            <Heading size="medium">{deploymentCount}</Heading>
          </VStack>
        </Box>

        <Box padding="space-16" borderRadius="8" background="sunken">
          <VStack gap="space-4">
            <Detail textColor="subtle">GitHub</Detail>
            <AkselLink href={`https://github.com/${username}`} target="_blank">
              {username} <ExternalLinkIcon aria-hidden />
            </AkselLink>
          </VStack>
        </Box>

        {mapping?.nav_ident && (
          <Box padding="space-16" borderRadius="8" background="sunken">
            <VStack gap="space-4">
              <Detail textColor="subtle">Teamkatalogen</Detail>
              <AkselLink href={`https://teamkatalog.nav.no/resource/${mapping.nav_ident}`} target="_blank">
                {mapping.nav_ident} <ExternalLinkIcon aria-hidden />
              </AkselLink>
            </VStack>
          </Box>
        )}

        {mapping?.slack_member_id && (
          <Box padding="space-16" borderRadius="8" background="sunken">
            <VStack gap="space-4">
              <Detail textColor="subtle">Slack</Detail>
              <AkselLink href={`https://nav-it.slack.com/team/${mapping.slack_member_id}`} target="_blank">
                Åpne i Slack <ExternalLinkIcon aria-hidden />
              </AkselLink>
            </VStack>
          </Box>
        )}
      </HGrid>

      {!mapping && (
        <Alert variant="warning">
          <HStack gap="space-16" align="center" justify="space-between" wrap>
            <BodyShort>Ingen brukermapping funnet for denne brukeren.</BodyShort>
            <Button variant="secondary" size="small" icon={<PlusIcon aria-hidden />}>
              Opprett mapping
            </Button>
          </HStack>
        </Alert>
      )}

      {mapping && (
        <Box padding="space-20" borderRadius="8" background="sunken">
          <VStack gap="space-12">
            <Heading size="small">Detaljer</Heading>
            <VStack gap="space-8">
              {mapping.nav_email && (
                <HStack gap="space-8">
                  <Detail textColor="subtle" style={{ minWidth: '80px' }}>
                    E-post:
                  </Detail>
                  <BodyShort>{mapping.nav_email}</BodyShort>
                </HStack>
              )}
              {mapping.nav_ident && (
                <HStack gap="space-8">
                  <Detail textColor="subtle" style={{ minWidth: '80px' }}>
                    Nav-ident:
                  </Detail>
                  <BodyShort>{mapping.nav_ident}</BodyShort>
                </HStack>
              )}
              {mapping.slack_member_id && (
                <HStack gap="space-8">
                  <Detail textColor="subtle" style={{ minWidth: '80px' }}>
                    Slack ID:
                  </Detail>
                  <BodyShort>{mapping.slack_member_id}</BodyShort>
                </HStack>
              )}
            </VStack>
          </VStack>
        </Box>
      )}

      <VStack gap="space-16">
        <Heading size="small">Siste deployments ({deploymentCount})</Heading>

        {recentDeployments.length === 0 ? (
          <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
            <BodyShort>Ingen deployments funnet for denne brukeren.</BodyShort>
          </Box>
        ) : (
          <div>
            {recentDeployments.map((deployment) => (
              <Box
                key={deployment.id}
                padding="space-16"
                background="raised"
                borderColor="neutral-subtle"
                borderWidth="1"
                style={{ marginBottom: '-1px' }}
              >
                <HStack gap="space-16" align="center" justify="space-between" wrap>
                  <HStack gap="space-12" align="center">
                    <BodyShort weight="semibold" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(deployment.created_at)}
                    </BodyShort>
                    <Link
                      to={`/team/${deployment.team_slug}/env/${deployment.environment_name}/app/${deployment.app_name}`}
                    >
                      <BodyShort>{deployment.app_name}</BodyShort>
                    </Link>
                  </HStack>
                  <Detail textColor="subtle">{deployment.environment_name}</Detail>
                </HStack>
              </Box>
            ))}
          </div>
        )}
      </VStack>
    </VStack>
  )
}

const meta: Meta<typeof UserPage> = {
  title: 'Pages/User',
  component: UserPage,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1000px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof UserPage>

export const Default: Story = {
  args: {
    username: 'john-doe',
    mapping: mockUserMapping,
    deploymentCount: 42,
    recentDeployments: mockDeployments,
  },
}

export const NoMapping: Story = {
  name: 'Uten mapping',
  args: {
    username: 'unknown-user',
    mapping: null,
    deploymentCount: 5,
    recentDeployments: mockDeployments.slice(0, 2),
  },
}

export const PartialMapping: Story = {
  name: 'Delvis mapping',
  args: {
    username: 'partial-user',
    mapping: {
      github_username: 'partial-user',
      display_name: 'Partial User',
      nav_email: null,
      nav_ident: 'A123456',
      slack_member_id: null,
    },
    deploymentCount: 10,
    recentDeployments: mockDeployments,
  },
}

export const NoDeployments: Story = {
  name: 'Ingen deployments',
  args: {
    username: 'new-user',
    mapping: mockUserMapping,
    deploymentCount: 0,
    recentDeployments: [],
  },
}
