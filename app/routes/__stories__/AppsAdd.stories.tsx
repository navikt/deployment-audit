import { PlusIcon } from '@navikt/aksel-icons'
import { Alert, BodyShort, Box, Button, Detail, Heading, HStack, Tag, TextField, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { Form } from 'react-router'
import { mockNaisApps } from './mock-data'

type NaisApp = {
  teamSlug: string
  appName: string
  environmentName: string
}

function AppsAddPage({
  allApps,
  monitoredKeys,
  error,
  searchQuery,
}: {
  allApps: NaisApp[]
  monitoredKeys: string[]
  error: string | null
  searchQuery: string
}) {
  const monitoredKeysSet = new Set(monitoredKeys)

  const filteredApps = allApps.filter((app) => {
    const query = searchQuery.toLowerCase()
    return app.teamSlug.toLowerCase().includes(query) || app.appName.toLowerCase().includes(query)
  })

  type AppInfo = { appName: string; environmentName: string }
  const appsByTeamAndEnv = filteredApps.reduce(
    (acc, app) => {
      const teamKey = app.teamSlug
      if (!acc[teamKey]) {
        acc[teamKey] = {}
      }
      if (!acc[teamKey][app.environmentName]) {
        acc[teamKey][app.environmentName] = []
      }
      acc[teamKey][app.environmentName].push({
        appName: app.appName,
        environmentName: app.environmentName,
      })
      return acc
    },
    {} as Record<string, Record<string, AppInfo[]>>,
  )

  const totalResults = filteredApps.length
  const totalTeams = Object.keys(appsByTeamAndEnv).length

  return (
    <VStack gap="space-32">
      <Heading size="large">Legg til applikasjon</Heading>

      {error && <Alert variant="error">{error}</Alert>}

      {!error && (
        <>
          <Box padding="space-20" borderRadius="8" background="sunken">
            <TextField
              label="Søk etter team eller applikasjon"
              description={searchQuery ? `Viser ${totalResults} treff fra ${totalTeams} team` : undefined}
              defaultValue={searchQuery}
              placeholder="F.eks. pensjon, pen, rocket..."
            />
          </Box>

          {searchQuery && (
            <VStack gap="space-24">
              {Object.entries(appsByTeamAndEnv)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([teamSlug, envs]) => (
                  <Box
                    key={teamSlug}
                    padding="space-20"
                    borderRadius="8"
                    background="raised"
                    borderColor="neutral-subtle"
                    borderWidth="1"
                  >
                    <VStack gap="space-16">
                      <Heading size="small">{teamSlug}</Heading>

                      {Object.entries(envs)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([envName, apps]) => (
                          <VStack key={envName} gap="space-8">
                            <Detail textColor="subtle">{envName}</Detail>
                            <VStack gap="space-4">
                              {apps
                                .sort((a, b) => a.appName.localeCompare(b.appName))
                                .map((app) => {
                                  const appKey = `${teamSlug}|${envName}|${app.appName}`
                                  const isMonitored = monitoredKeysSet.has(appKey)

                                  return (
                                    <HStack
                                      key={appKey}
                                      gap="space-8"
                                      align="center"
                                      justify="space-between"
                                      wrap
                                      style={isMonitored ? { opacity: 0.5 } : undefined}
                                    >
                                      <BodyShort weight="semibold">{app.appName}</BodyShort>
                                      {isMonitored ? (
                                        <Tag size="xsmall" variant="outline" data-color="success">
                                          Overvåkes
                                        </Tag>
                                      ) : (
                                        <Form method="post" style={{ display: 'inline' }}>
                                          <Button
                                            type="submit"
                                            size="xsmall"
                                            variant="secondary"
                                            icon={<PlusIcon aria-hidden />}
                                          >
                                            Legg til
                                          </Button>
                                        </Form>
                                      )}
                                    </HStack>
                                  )
                                })}
                            </VStack>
                          </VStack>
                        ))}
                    </VStack>
                  </Box>
                ))}
            </VStack>
          )}

          {!searchQuery && <Alert variant="info">Skriv inn et søkeord for å finne applikasjoner.</Alert>}
        </>
      )}
    </VStack>
  )
}

const meta: Meta<typeof AppsAddPage> = {
  title: 'Pages/AppsAdd',
  component: AppsAddPage,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '800px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof AppsAddPage>

export const Empty: Story = {
  name: 'Tomt søk',
  args: {
    allApps: mockNaisApps,
    monitoredKeys: [],
    error: null,
    searchQuery: '',
  },
}

export const WithResults: Story = {
  name: 'Med resultater',
  args: {
    allApps: mockNaisApps,
    monitoredKeys: ['pensjondeployer|prod-fss|pensjon-pen'],
    error: null,
    searchQuery: 'pensjon',
  },
}

export const ErrorState: Story = {
  name: 'Feil ved lasting',
  args: {
    allApps: [],
    monitoredKeys: [],
    error: 'Kunne ikke laste applikasjoner fra NAIS',
    searchQuery: '',
  },
}

export const AllMonitored: Story = {
  name: 'Alle overvåkes',
  args: {
    allApps: mockNaisApps,
    monitoredKeys: mockNaisApps.map((app) => `${app.teamSlug}|${app.environmentName}|${app.appName}`),
    error: null,
    searchQuery: 'pensjon',
  },
}
