import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons'
import { Alert, BodyShort, Button, Heading, HStack, Table, Tag, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { Link } from 'react-router'

interface DevTeamMember {
  nav_ident: string
  github_username: string | null
  display_name: string | null
}

interface LinkedApp {
  monitored_app_id: number
  team_slug: string
  environment_name: string
  app_name: string
}

function DevTeamAdminPage({
  teamName,
  members,
  naisTeamSlugs,
  linkedApps,
}: {
  teamName: string
  members: DevTeamMember[]
  naisTeamSlugs: string[]
  linkedApps: LinkedApp[]
}) {
  return (
    <VStack gap="space-24">
      <div>
        <Heading level="1" size="large" spacing>
          Administrer {teamName}
        </Heading>
        <BodyShort textColor="subtle">Administrer medlemmer, applikasjoner og Nais-team.</BodyShort>
        <HStack gap="space-8" style={{ marginTop: 'var(--ax-space-8)' }}>
          <Button as={Link} to="#" variant="tertiary" size="small" icon={<ArrowLeftIcon aria-hidden />}>
            Tilbake til teamside
          </Button>
        </HStack>
      </div>

      {/* Team name */}
      <VStack gap="space-16">
        <Heading level="2" size="medium">
          Teamnavn
        </Heading>
        <HStack gap="space-12" align="center">
          <Tag variant="neutral">{teamName}</Tag>
          <Button variant="tertiary" size="small">
            Endre
          </Button>
        </HStack>
      </VStack>

      {/* Members */}
      <VStack gap="space-16">
        <HStack justify="space-between" align="center">
          <Heading level="2" size="medium">
            Medlemmer ({members.length})
          </Heading>
          <Button variant="tertiary" size="small" icon={<PlusIcon aria-hidden />}>
            Legg til medlem
          </Button>
        </HStack>

        {members.length > 0 ? (
          <Table size="small">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>NAV-ident</Table.HeaderCell>
                <Table.HeaderCell>Navn</Table.HeaderCell>
                <Table.HeaderCell>GitHub</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {members.map((member) => (
                <Table.Row key={member.nav_ident}>
                  <Table.DataCell>
                    <code>{member.nav_ident}</code>
                  </Table.DataCell>
                  <Table.DataCell>{member.display_name ?? '–'}</Table.DataCell>
                  <Table.DataCell>
                    {member.github_username ? (
                      <code>{member.github_username}</code>
                    ) : (
                      <BodyShort textColor="subtle">–</BodyShort>
                    )}
                  </Table.DataCell>
                  <Table.DataCell>
                    <Button variant="tertiary-neutral" size="xsmall" icon={<TrashIcon aria-hidden />}>
                      Fjern
                    </Button>
                  </Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Alert variant="info" size="small">
            Ingen medlemmer er lagt til ennå.
          </Alert>
        )}
      </VStack>

      {/* Nais teams */}
      <VStack gap="space-16">
        <HStack justify="space-between" align="center">
          <Heading level="2" size="medium">
            Nais-team ({naisTeamSlugs.length})
          </Heading>
          <Button variant="tertiary" size="small" icon={<PlusIcon aria-hidden />}>
            Legg til Nais-team
          </Button>
        </HStack>

        {naisTeamSlugs.length > 0 ? (
          <Table size="small">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Slug</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {naisTeamSlugs.map((slug) => (
                <Table.Row key={slug}>
                  <Table.DataCell>
                    <code>{slug}</code>
                  </Table.DataCell>
                  <Table.DataCell>
                    <Button variant="tertiary-neutral" size="xsmall" icon={<TrashIcon aria-hidden />}>
                      Fjern
                    </Button>
                  </Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Alert variant="info" size="small">
            Ingen Nais-team er koblet til ennå.
          </Alert>
        )}
      </VStack>

      {/* Applications */}
      <VStack gap="space-16">
        <HStack justify="space-between" align="center">
          <Heading level="2" size="medium">
            Applikasjoner ({linkedApps.length})
          </Heading>
          <Button variant="tertiary" size="small" icon={<PlusIcon aria-hidden />}>
            Rediger applikasjoner
          </Button>
        </HStack>

        {linkedApps.length > 0 ? (
          <Table size="small">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Applikasjon</Table.HeaderCell>
                <Table.HeaderCell>Miljø</Table.HeaderCell>
                <Table.HeaderCell>Nais-team</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {linkedApps.map((app) => (
                <Table.Row key={app.monitored_app_id}>
                  <Table.DataCell>
                    <code>{app.app_name}</code>
                  </Table.DataCell>
                  <Table.DataCell>{app.environment_name}</Table.DataCell>
                  <Table.DataCell>{app.team_slug}</Table.DataCell>
                  <Table.DataCell>
                    <Button variant="tertiary-neutral" size="xsmall" icon={<TrashIcon aria-hidden />}>
                      Fjern
                    </Button>
                  </Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Alert variant="info" size="small">
            Ingen applikasjoner er direkte lenket.
          </Alert>
        )}
      </VStack>
    </VStack>
  )
}

const mockMembers: DevTeamMember[] = [
  { nav_ident: 'A123456', github_username: 'dev-user-1', display_name: 'Utvikler Én' },
  { nav_ident: 'B654321', github_username: 'dev-user-2', display_name: 'Utvikler To' },
  { nav_ident: 'C111222', github_username: null, display_name: 'Utvikler Tre' },
]

const mockLinkedApps: LinkedApp[] = [
  { monitored_app_id: 1, team_slug: 'pensjondeployer', environment_name: 'prod-fss', app_name: 'pensjon-pen' },
  {
    monitored_app_id: 2,
    team_slug: 'pensjondeployer',
    environment_name: 'prod-gcp',
    app_name: 'pensjon-selvbetjening',
  },
]

const meta: Meta<typeof DevTeamAdminPage> = {
  title: 'Pages/DevTeamAdmin',
  component: DevTeamAdminPage,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '900px', padding: '2rem' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof DevTeamAdminPage>

export const Default: Story = {
  args: {
    teamName: 'Motta Pensjon',
    members: mockMembers,
    naisTeamSlugs: ['pensjondeployer', 'pensjonsamhandling'],
    linkedApps: mockLinkedApps,
  },
}

export const EmptyTeam: Story = {
  name: 'Tomt team',
  args: {
    teamName: 'Nytt Team',
    members: [],
    naisTeamSlugs: [],
    linkedApps: [],
  },
}
