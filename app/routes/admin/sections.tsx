import { BarChartIcon, PencilIcon, PersonGroupIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons'
import { Alert, BodyShort, Box, Button, Heading, HStack, Tag, TextField, VStack } from '@navikt/ds-react'
import { useState } from 'react'
import { Form, Link, useLoaderData } from 'react-router'
import {
  createSection,
  getAllSectionsWithTeams,
  type SectionWithTeams,
  setSectionTeams,
  updateSection,
} from '~/db/sections.server'
import { requireAdmin } from '~/lib/auth.server'
import type { Route } from './+types/sections'

export function meta() {
  return [{ title: 'Seksjoner - Admin - Deployment Audit' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request)
  const sections = await getAllSectionsWithTeams()
  return { sections }
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

  if (intent === 'update') {
    const id = Number(formData.get('id'))
    const name = (formData.get('name') as string)?.trim()
    const entraGroupAdmin = (formData.get('entra_group_admin') as string)?.trim()
    const entraGroupUser = (formData.get('entra_group_user') as string)?.trim()
    const teamSlugs = (formData.get('team_slugs') as string)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (!id || !name) {
      return { error: 'ID og navn er påkrevd.' }
    }

    try {
      await updateSection(id, {
        name,
        entra_group_admin: entraGroupAdmin || null,
        entra_group_user: entraGroupUser || null,
      })
      if (teamSlugs) {
        await setSectionTeams(id, teamSlugs)
      }
      return { success: true }
    } catch (error) {
      return { error: `Kunne ikke oppdatere seksjon: ${error}` }
    }
  }

  if (intent === 'deactivate') {
    const id = Number(formData.get('id'))
    try {
      await updateSection(id, { is_active: false })
      return { success: true }
    } catch (error) {
      return { error: `Kunne ikke deaktivere seksjon: ${error}` }
    }
  }

  return { error: 'Ukjent handling.' }
}

export default function AdminSections() {
  const { sections } = useLoaderData<typeof loader>()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  return (
    <VStack gap="space-24">
      <div>
        <Heading level="1" size="large" spacing>
          Seksjoner
        </Heading>
        <BodyShort textColor="subtle">Administrer seksjoner og tilhørende nais-team.</BodyShort>
      </div>

      {!showCreate ? (
        <HStack>
          <Button variant="secondary" size="small" icon={<PlusIcon aria-hidden />} onClick={() => setShowCreate(true)}>
            Ny seksjon
          </Button>
        </HStack>
      ) : (
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
        <VStack gap="space-16">
          {sections.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              isEditing={editingId === section.id}
              onEdit={() => setEditingId(section.id)}
              onCancel={() => setEditingId(null)}
            />
          ))}
        </VStack>
      )}
    </VStack>
  )
}

function SectionCard({
  section,
  isEditing,
  onEdit,
  onCancel,
}: {
  section: SectionWithTeams
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
}) {
  if (isEditing) {
    return (
      <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
        <Form method="post" onSubmit={onCancel}>
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="id" value={section.id} />
          <VStack gap="space-12">
            <HStack gap="space-16" wrap>
              <TextField label="Navn" name="name" size="small" defaultValue={section.name} autoComplete="off" />
              <TextField
                label="Nais-team (kommaseparert)"
                name="team_slugs"
                size="small"
                defaultValue={section.team_slugs.join(', ')}
                autoComplete="off"
                style={{ minWidth: '300px' }}
              />
            </HStack>
            <HStack gap="space-16" wrap>
              <TextField
                label="Admin-gruppe (Entra ID)"
                name="entra_group_admin"
                size="small"
                defaultValue={section.entra_group_admin ?? ''}
                autoComplete="off"
              />
              <TextField
                label="Bruker-gruppe (Entra ID)"
                name="entra_group_user"
                size="small"
                defaultValue={section.entra_group_user ?? ''}
                autoComplete="off"
              />
            </HStack>
            <HStack gap="space-8">
              <Button type="submit" size="small">
                Lagre
              </Button>
              <Button variant="tertiary" size="small" onClick={onCancel}>
                Avbryt
              </Button>
            </HStack>
          </VStack>
        </Form>
      </Box>
    )
  }

  return (
    <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
      <HStack justify="space-between" align="center" wrap>
        <VStack gap="space-8">
          <Heading level="2" size="medium">
            {section.name}
          </Heading>
          <HStack gap="space-4" wrap>
            {section.team_slugs.map((slug) => (
              <Tag key={slug} variant="neutral" size="small">
                {slug}
              </Tag>
            ))}
            {section.team_slugs.length === 0 && (
              <BodyShort size="small" textColor="subtle">
                Ingen nais-team
              </BodyShort>
            )}
          </HStack>
        </VStack>
        <HStack gap="space-4">
          <Button
            as={Link}
            to={`/sections/${section.slug}`}
            variant="tertiary"
            size="small"
            icon={<BarChartIcon aria-hidden />}
          >
            Oversikt
          </Button>
          <Button
            as={Link}
            to={`/admin/sections/${section.slug}/dev-teams`}
            variant="tertiary"
            size="small"
            icon={<PersonGroupIcon aria-hidden />}
          >
            Utviklingsteam
          </Button>
          <Button variant="tertiary" size="small" icon={<PencilIcon aria-hidden />} onClick={onEdit}>
            Rediger
          </Button>
          <Form method="post" style={{ display: 'inline' }}>
            <input type="hidden" name="intent" value="deactivate" />
            <input type="hidden" name="id" value={section.id} />
            <Button variant="tertiary-neutral" size="small" icon={<TrashIcon aria-hidden />} type="submit">
              Deaktiver
            </Button>
          </Form>
        </HStack>
      </HStack>
    </Box>
  )
}
