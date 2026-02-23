import { ArrowsCirclepathIcon, ChatIcon, CheckmarkCircleIcon, FileTextIcon, PersonGroupIcon } from '@navikt/aksel-icons'
import { BodyShort, Box, Heading, HGrid, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { Link } from 'react-router'

function AdminPage({ pendingCount }: { pendingCount: number }) {
  return (
    <VStack gap="space-24">
      <div>
        <Heading level="1" size="large" spacing>
          Administrasjon
        </Heading>
        <BodyShort textColor="subtle">Administrer brukere, synkronisering og systeminnstillinger.</BodyShort>
      </div>

      <HGrid gap="space-16" columns={{ xs: 1, md: 2, lg: 3 }}>
        <Link to="/deployments/verify" style={{ textDecoration: 'none' }}>
          <Box
            padding="space-24"
            borderRadius="8"
            background="raised"
            borderColor={pendingCount > 0 ? 'warning-subtle' : 'neutral-subtle'}
            borderWidth="1"
            data-color={pendingCount > 0 ? 'warning' : undefined}
            className="admin-card"
          >
            <VStack gap="space-12">
              <CheckmarkCircleIcon fontSize="2rem" aria-hidden />
              <div>
                <Heading level="2" size="small" spacing>
                  GitHub-verifisering
                </Heading>
                <BodyShort textColor="subtle">
                  {pendingCount > 0
                    ? `${pendingCount} deployments venter på verifisering.`
                    : 'Verifiser deployments mot GitHub.'}
                </BodyShort>
              </div>
            </VStack>
          </Box>
        </Link>

        <Link to="/admin/audit-reports" style={{ textDecoration: 'none' }}>
          <Box
            padding="space-24"
            borderRadius="8"
            background="raised"
            borderColor="neutral-subtle"
            borderWidth="1"
            className="admin-card"
          >
            <VStack gap="space-12">
              <FileTextIcon fontSize="2rem" aria-hidden />
              <div>
                <Heading level="2" size="small" spacing>
                  Leveranserapport
                </Heading>
                <BodyShort textColor="subtle">
                  Generer leveranserapport for revisjon som dokumenterer four-eyes-prinsippet.
                </BodyShort>
              </div>
            </VStack>
          </Box>
        </Link>

        <Link to="/admin/users" style={{ textDecoration: 'none' }}>
          <Box
            padding="space-24"
            borderRadius="8"
            background="raised"
            borderColor="neutral-subtle"
            borderWidth="1"
            className="admin-card"
          >
            <VStack gap="space-12">
              <PersonGroupIcon fontSize="2rem" aria-hidden />
              <div>
                <Heading level="2" size="small" spacing>
                  Brukermappinger
                </Heading>
                <BodyShort textColor="subtle">
                  Koble GitHub-brukernavn til NAV-identiteter for bedre sporbarhet.
                </BodyShort>
              </div>
            </VStack>
          </Box>
        </Link>

        <Link to="/admin/sync-jobs" style={{ textDecoration: 'none' }}>
          <Box
            padding="space-24"
            borderRadius="8"
            background="raised"
            borderColor="neutral-subtle"
            borderWidth="1"
            className="admin-card"
          >
            <VStack gap="space-12">
              <ArrowsCirclepathIcon fontSize="2rem" aria-hidden />
              <div>
                <Heading level="2" size="small" spacing>
                  Sync Jobs
                </Heading>
                <BodyShort textColor="subtle">
                  Overvåk synkroniseringsjobber og distribuert låsing mellom podder.
                </BodyShort>
              </div>
            </VStack>
          </Box>
        </Link>

        <Link to="/admin/slack" style={{ textDecoration: 'none' }}>
          <Box
            padding="space-24"
            borderRadius="8"
            background="raised"
            borderColor="neutral-subtle"
            borderWidth="1"
            className="admin-card"
          >
            <VStack gap="space-12">
              <ChatIcon fontSize="2rem" aria-hidden />
              <div>
                <Heading level="2" size="small" spacing>
                  Slack-integrasjon
                </Heading>
                <BodyShort textColor="subtle">Konfigurer Slack-varsler og test integrasjonen.</BodyShort>
              </div>
            </VStack>
          </Box>
        </Link>
      </HGrid>
    </VStack>
  )
}

const meta: Meta<typeof AdminPage> = {
  title: 'Pages/Admin',
  component: AdminPage,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1200px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof AdminPage>

export const Default: Story = {
  args: {
    pendingCount: 0,
  },
}

export const WithPendingVerifications: Story = {
  name: 'Med ventende verifiseringer',
  args: {
    pendingCount: 5,
  },
}
