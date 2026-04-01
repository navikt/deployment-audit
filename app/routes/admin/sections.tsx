import { CheckmarkCircleIcon, ExclamationmarkTriangleIcon, PlusIcon } from '@navikt/aksel-icons'
import { Alert, BodyShort, Box, Button, Detail, Heading, HStack, Tag, TextField, VStack } from '@navikt/ds-react'
import { type ReactNode, useState } from 'react'
import { Form, Link, useLoaderData } from 'react-router'
import { getSectionOverallStats, type SectionOverallStats } from '~/db/dashboard-stats.server'
import { createSection, getAllSectionsWithTeams, type SectionWithTeams } from '~/db/sections.server'
import { requireAdmin, requireUser } from '~/lib/auth.server'
import type { Route } from './+types/sections'

export function meta() {
  return [{ title: 'Seksjoner - Deployment Audit' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request)
  const sections = await getAllSectionsWithTeams()
  const ytdStart = new Date(new Date().getFullYear(), 0, 1)

  const statsBySection = new Map<number, SectionOverallStats>()
  await Promise.all(
    sections.map(async (s) => {
      statsBySection.set(s.id, await getSectionOverallStats(s.id, ytdStart))
    }),
  )

  return {
    isAdmin: user.role === 'admin',
    sections: sections.map((s) => ({
      ...s,
      stats: statsBySection.get(s.id) ?? {
        total_deployments: 0,
        with_four_eyes: 0,
        without_four_eyes: 0,
        pending_verification: 0,
        linked_to_goal: 0,
        four_eyes_coverage: 0,
        goal_coverage: 0,
      },
    })),
  }
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request)
  const formData = await request.formData()
  const intent = formData.get('intent') as string

  if (intent === 'create') {
    const slug = (formData.get('slug') as string)?.trim()
    const name = (formData.get('name') as string)?.trim()
    const entraGroupAdmin = (formData.get('entra_group_admin') as string)?.trim() || undefined
    const entraGroupUser = (formData.get('entra_group_user') as string)?.trim() || undefined

    if (!slug || !name) {
      return { error: 'Slug og navn er påkrevd.' }
    }

    try {
      await createSection(slug, name, entraGroupAdmin, entraGroupUser)
      return { success: true }
    } catch (error) {
      return { error: `Kunne ikke opprette seksjon: ${error}` }
    }
  }

  return { error: 'Ukjent handling.' }
}

export default function AdminSections() {
  const { sections, isAdmin } = useLoaderData<typeof loader>()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <VStack gap="space-24">
      <HStack justify="space-between" align="center">
        <Heading level="1" size="large">
          Seksjoner
        </Heading>
        {isAdmin && !showCreate && (
          <Button variant="tertiary" size="small" icon={<PlusIcon aria-hidden />} onClick={() => setShowCreate(true)}>
            Ny seksjon
          </Button>
        )}
      </HStack>

      {showCreate && (
        <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
          <Form method="post" onSubmit={() => setShowCreate(false)}>
            <input type="hidden" name="intent" value="create" />
            <VStack gap="space-16">
              <Heading level="2" size="small">
                Opprett ny seksjon
              </Heading>
              <HStack gap="space-16" wrap>
                <TextField label="Slug" name="slug" size="small" placeholder="f.eks. pensjon" autoComplete="off" />
                <TextField
                  label="Visningsnavn"
                  name="name"
                  size="small"
                  placeholder="f.eks. Pensjon og uføre"
                  autoComplete="off"
                />
              </HStack>
              <HStack gap="space-16" wrap>
                <TextField
                  label="Entra ID admin-gruppe"
                  name="entra_group_admin"
                  size="small"
                  placeholder="Gruppe-ID (valgfritt)"
                  autoComplete="off"
                />
                <TextField
                  label="Entra ID bruker-gruppe"
                  name="entra_group_user"
                  size="small"
                  placeholder="Gruppe-ID (valgfritt)"
                  autoComplete="off"
                />
              </HStack>
              <HStack gap="space-8">
                <Button type="submit" size="small">
                  Opprett
                </Button>
                <Button variant="tertiary" size="small" onClick={() => setShowCreate(false)}>
                  Avbryt
                </Button>
              </HStack>
            </VStack>
          </Form>
        </Box>
      )}

      {sections.length === 0 ? (
        <Alert variant="info">Ingen seksjoner er opprettet ennå.</Alert>
      ) : (
        <VStack gap="space-12">
          {sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </VStack>
      )}
    </VStack>
  )
}

function SectionCard({ section }: { section: SectionWithTeams & { stats: SectionOverallStats } }) {
  const { stats } = section
  const fourEyesPct = formatCoverage(stats.four_eyes_coverage)
  const goalPct = formatCoverage(stats.goal_coverage)

  return (
    <Box padding="space-20" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
      <HStack justify="space-between" align="start" wrap>
        <Heading level="2" size="medium">
          <Link to={`/sections/${section.slug}`}>{section.name}</Link>
        </Heading>

        <HStack gap="space-24" wrap>
          <VStack gap="space-4" align="center" style={{ minWidth: '7rem' }}>
            <Detail textColor="subtle">Deployments i år</Detail>
            <BodyShort weight="semibold">{stats.total_deployments}</BodyShort>
          </VStack>
          <VStack gap="space-4" align="center" style={{ minWidth: '5rem' }}>
            <Detail textColor="subtle">4-øyne</Detail>
            <Tag variant={getHealthVariant(stats.four_eyes_coverage)} size="small">
              {fourEyesPct}
            </Tag>
          </VStack>
          <VStack gap="space-4" align="center" style={{ minWidth: '7rem' }}>
            <Detail textColor="subtle">Endringsopphav</Detail>
            <Tag variant={getHealthVariant(stats.goal_coverage)} size="small">
              {goalPct}
            </Tag>
          </VStack>
          <VStack gap="space-4" align="center" style={{ minWidth: '9rem' }}>
            <Detail textColor="subtle">Helsetilstand</Detail>
            <Tag
              variant={getHealthVariant(Math.min(stats.four_eyes_coverage, stats.goal_coverage))}
              size="small"
              icon={getHealthIcon(stats.four_eyes_coverage, stats.goal_coverage)}
            >
              {getHealthLabel(stats.four_eyes_coverage, stats.goal_coverage)}
            </Tag>
          </VStack>
        </HStack>
      </HStack>
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
  if (ratio >= 0.9) return 'success'
  if (ratio >= 0.7) return 'warning'
  if (ratio > 0) return 'error'
  return 'neutral'
}

function getHealthLabel(fourEyes: number, goalCoverage: number): string {
  const min = Math.min(fourEyes, goalCoverage)
  if (min >= 0.9) return 'God'
  if (min >= 0.7) return 'Akseptabel'
  if (min > 0) return 'Trenger oppfølging'
  return 'Ingen data'
}

function getHealthIcon(fourEyes: number, goalCoverage: number): ReactNode {
  const min = Math.min(fourEyes, goalCoverage)
  if (min >= 0.7) return <CheckmarkCircleIcon aria-hidden />
  return <ExclamationmarkTriangleIcon aria-hidden />
}
