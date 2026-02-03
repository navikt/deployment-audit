import { CheckmarkCircleIcon, ClockIcon, XMarkOctagonIcon } from '@navikt/aksel-icons'
import { BodyShort, Box, Button, Heading, HStack, Tag, VStack } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'

/**
 * Eksempel-stories for å demonstrere Aksel-komponenter i prosjektet.
 */
const meta: Meta = {
  title: 'Components/Examples',
}

export default meta

type Story = StoryObj

export const DeploymentStatusTags: Story = {
  name: 'Deployment Status Tags',
  render: () => (
    <VStack gap="space-16">
      <Heading size="small">Deployment statuser</Heading>
      <HStack gap="space-8">
        <Tag data-color="success" variant="outline" size="small">
          <CheckmarkCircleIcon aria-hidden /> Godkjent
        </Tag>
        <Tag data-color="success" variant="outline" size="small">
          Implisitt godkjent
        </Tag>
        <Tag data-color="warning" variant="outline" size="small">
          <ClockIcon aria-hidden /> Venter
        </Tag>
        <Tag data-color="danger" variant="outline" size="small">
          <XMarkOctagonIcon aria-hidden /> Avvist
        </Tag>
      </HStack>
    </VStack>
  ),
}

export const StatisticsCard: Story = {
  name: 'Statistics Card',
  render: () => (
    <Box
      padding="space-24"
      borderRadius="8"
      background="raised"
      borderColor="neutral-subtle"
      borderWidth="1"
      style={{ maxWidth: '300px' }}
    >
      <VStack gap="space-8">
        <BodyShort size="small" textColor="subtle">
          Totalt deployments
        </BodyShort>
        <Heading size="xlarge">42</Heading>
      </VStack>
    </Box>
  ),
}

export const ButtonVariants: Story = {
  name: 'Button Variants',
  render: () => (
    <VStack gap="space-16">
      <Heading size="small">Knappevarianter</Heading>
      <HStack gap="space-8">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="danger">Danger</Button>
      </HStack>
      <HStack gap="space-8">
        <Button variant="primary" size="small">
          Small
        </Button>
        <Button variant="primary" size="medium">
          Medium
        </Button>
      </HStack>
    </VStack>
  ),
}
