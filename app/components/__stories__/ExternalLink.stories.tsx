import { BodyShort, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { ExternalLink } from '../ExternalLink'

const meta: Meta<typeof ExternalLink> = {
  title: 'Components/ExternalLink',
  component: ExternalLink,
}

export default meta

type Story = StoryObj<typeof ExternalLink>

export const Default: Story = {
  args: {
    href: 'https://github.com/navikt/deployment-audit',
    children: 'navikt/deployment-audit',
  },
}

export const InsideText: Story = {
  name: 'Inline i en setning',
  render: () => (
    <BodyShort>
      Se{' '}
      <ExternalLink href="https://console.nav.cloud.nais.io/team/pensjon/applications">
        applikasjonene i NAIS Console
      </ExternalLink>{' '}
      for å sjekke status.
    </BodyShort>
  ),
}

export const MultipleStacked: Story = {
  name: 'Flere lenker stablet',
  render: () => (
    <VStack gap="space-8">
      <ExternalLink href="https://github.com/navikt/deployment-audit">GitHub repo</ExternalLink>
      <ExternalLink href="https://console.nav.cloud.nais.io/team/pensjon/applications">NAIS Console</ExternalLink>
      <ExternalLink href="https://teamkatalogen.nav.no/team/pensjon">Teamkatalogen</ExternalLink>
      <ExternalLink href="https://nav-it.slack.com/team/U123456">Slack-profil</ExternalLink>
    </VStack>
  ),
}

export const HiddenIcon: Story = {
  name: 'Med skjult ikon (sjelden bruk)',
  args: {
    href: 'https://github.com/navikt',
    children: 'navikt',
    hideIcon: true,
  },
}
