import { Box, Heading, HStack, Tag, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { AppCard, type AppCardData } from '~/components/AppCard'
import { mockApps } from './mock-data'

function TeamEnvPage({ team, env, apps }: { team: string; env: string; apps: AppCardData[] }) {
  return (
    <Box paddingInline={{ xs: 'space-16', md: 'space-24' }} paddingBlock="space-24">
      <VStack gap="space-24">
        <VStack gap="space-8">
          <Heading level="1" size="xlarge">
            {team}
          </Heading>
          <HStack gap="space-8" align="center">
            <Tag variant="neutral" size="small">
              {env}
            </Tag>
            <Tag variant="neutral-moderate" size="xsmall">
              {apps.length} {apps.length === 1 ? 'app' : 'apper'}
            </Tag>
          </HStack>
        </VStack>

        <div>
          {apps.map((app) => (
            <AppCard key={app.id} app={app} showEnvironment={false} />
          ))}
        </div>
      </VStack>
    </Box>
  )
}

const meta: Meta<typeof TeamEnvPage> = {
  title: 'Pages/TeamEnv',
  component: TeamEnvPage,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1200px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof TeamEnvPage>

const prodFssApps = mockApps.filter((app) => app.team_slug === 'pensjondeployer' && app.environment_name === 'prod-fss')

export const Default: Story = {
  args: {
    team: 'pensjondeployer',
    env: 'prod-fss',
    apps: prodFssApps,
  },
}

export const SingleApp: Story = {
  name: 'Én app',
  args: {
    team: 'pensjondeployer',
    env: 'prod-gcp',
    apps: [mockApps[2]], // pensjon-opptjening
  },
}

export const ManyApps: Story = {
  name: 'Mange apper',
  args: {
    team: 'pensjondeployer',
    env: 'prod-fss',
    apps: [
      ...prodFssApps,
      { ...mockApps[0], id: 10, app_name: 'pensjon-api' },
      { ...mockApps[0], id: 11, app_name: 'pensjon-frontend' },
      { ...mockApps[0], id: 12, app_name: 'pensjon-batch' },
    ],
  },
}
