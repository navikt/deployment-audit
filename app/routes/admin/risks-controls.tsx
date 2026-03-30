import {
  ExclamationmarkTriangleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShieldCheckmarkIcon,
  TrashIcon,
} from '@navikt/aksel-icons'
import {
  Alert,
  BodyShort,
  Box,
  Button,
  Detail,
  Heading,
  HStack,
  Select,
  Tag,
  Textarea,
  TextField,
  ToggleGroup,
  VStack,
} from '@navikt/ds-react'
import { useState } from 'react'
import { Form, useLoaderData, useSearchParams } from 'react-router'
import {
  createRiskOrControl,
  deleteRiskOrControl,
  getAllRisksAndControls,
  searchRisksAndControls,
  updateRiskOrControl,
} from '~/db/risks-controls.server'
import { getAllSectionsWithTeams } from '~/db/sections.server'
import { requireAdmin } from '~/lib/auth.server'
import type { Route } from './+types/risks-controls'

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Risiko og kontroller – Deployment Audit' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request)
  const url = new URL(request.url)
  const query = url.searchParams.get('q') || ''
  const category = url.searchParams.get('category') || 'all'

  let items = query.trim() ? await searchRisksAndControls(query) : await getAllRisksAndControls()

  if (category === 'risk') items = items.filter((i) => i.category === 'risk')
  else if (category === 'control') items = items.filter((i) => i.category === 'control')

  const sections = await getAllSectionsWithTeams()

  return { items, sections, query, category }
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request)
  const formData = await request.formData()
  const intent = formData.get('intent') as string

  if (intent === 'create') {
    const category = formData.get('category') as 'risk' | 'control'
    const shortTitle = (formData.get('short_title') as string)?.trim()
    const longTitle = (formData.get('long_title') as string)?.trim()
    const severity = (formData.get('severity') as string) || null
    const sectionId = formData.get('section_id') as string

    if (!shortTitle || !category) {
      return { error: 'Kort overskrift og kategori er påkrevd.' }
    }

    await createRiskOrControl({
      category,
      short_title: shortTitle,
      long_title: longTitle || '',
      severity: severity || undefined,
      section_id: sectionId ? Number(sectionId) : null,
      created_by: user.navIdent,
    })
    return { success: `${category === 'risk' ? 'Risiko' : 'Kontroll'} opprettet.` }
  }

  if (intent === 'update') {
    const id = Number(formData.get('id'))
    const shortTitle = (formData.get('short_title') as string)?.trim()
    const longTitle = (formData.get('long_title') as string)?.trim()
    const status = formData.get('status') as string
    const severity = (formData.get('severity') as string) || null
    const sectionId = formData.get('section_id') as string

    await updateRiskOrControl(id, {
      short_title: shortTitle || undefined,
      long_title: longTitle,
      status: status || undefined,
      severity,
      section_id: sectionId ? Number(sectionId) : null,
    })
    return { success: 'Oppdatert.' }
  }

  if (intent === 'delete') {
    const id = Number(formData.get('id'))
    await deleteRiskOrControl(id)
    return { success: 'Slettet.' }
  }

  return { error: 'Ukjent handling.' }
}

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Lav',
  medium: 'Middels',
  high: 'Høy',
  critical: 'Kritisk',
}

const SEVERITY_COLORS = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
} as const

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  mitigated: 'Mitigert',
  accepted: 'Akseptert',
  closed: 'Lukket',
}

const STATUS_COLORS = {
  active: 'warning',
  mitigated: 'success',
  accepted: 'info',
  closed: 'neutral',
} as const

export default function RisksAndControls() {
  const { items, sections, query, category } = useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showCreate, setShowCreate] = useState(false)

  const risks = items.filter((i) => i.category === 'risk')
  const controls = items.filter((i) => i.category === 'control')

  return (
    <VStack gap="space-24">
      <div>
        <Heading level="1" size="large" spacing>
          Risiko og kontroller
        </Heading>
        <BodyShort textColor="subtle">Risikoregister og kontroller for deployment-prosessen.</BodyShort>
      </div>

      {/* Search and filter */}
      <HStack gap="space-16" wrap align="end">
        <Form method="get" style={{ flex: 1, minWidth: '200px' }}>
          <input type="hidden" name="category" value={category} />
          <TextField
            label="Søk"
            hideLabel
            placeholder="Søk på kort eller lang overskrift…"
            name="q"
            defaultValue={query}
            size="small"
          />
        </Form>

        <ToggleGroup
          defaultValue={category}
          onChange={(value) => {
            const params = new URLSearchParams(searchParams)
            params.set('category', value)
            setSearchParams(params)
          }}
          size="small"
        >
          <ToggleGroup.Item value="all">Alle ({items.length})</ToggleGroup.Item>
          <ToggleGroup.Item value="risk">
            <HStack gap="space-4" align="center">
              <ExclamationmarkTriangleIcon aria-hidden fontSize="1em" />
              Risiko ({risks.length})
            </HStack>
          </ToggleGroup.Item>
          <ToggleGroup.Item value="control">
            <HStack gap="space-4" align="center">
              <ShieldCheckmarkIcon aria-hidden fontSize="1em" />
              Kontroller ({controls.length})
            </HStack>
          </ToggleGroup.Item>
        </ToggleGroup>
      </HStack>

      {/* Create button / form */}
      {!showCreate ? (
        <div>
          <Button size="small" variant="secondary" icon={<PlusIcon aria-hidden />} onClick={() => setShowCreate(true)}>
            Ny oppføring
          </Button>
        </div>
      ) : (
        <CreateForm sections={sections} onCancel={() => setShowCreate(false)} />
      )}

      {/* Results */}
      {items.length === 0 ? (
        <Alert variant="info">
          {query ? `Ingen treff for "${query}".` : 'Ingen risiko eller kontroller er registrert ennå.'}
        </Alert>
      ) : (
        <VStack gap="space-12">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} sections={sections} />
          ))}
        </VStack>
      )}
    </VStack>
  )
}

function CreateForm({ sections, onCancel }: { sections: Array<{ id: number; name: string }>; onCancel: () => void }) {
  return (
    <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
      <Form method="post" onSubmit={onCancel}>
        <input type="hidden" name="intent" value="create" />
        <VStack gap="space-16">
          <Heading level="2" size="small">
            Ny oppføring
          </Heading>
          <HStack gap="space-16" wrap>
            <Select label="Kategori" name="category" size="small">
              <option value="risk">Risiko</option>
              <option value="control">Kontroll</option>
            </Select>
            <Select label="Alvorlighetsgrad" name="severity" size="small">
              <option value="">Ikke angitt</option>
              <option value="low">Lav</option>
              <option value="medium">Middels</option>
              <option value="high">Høy</option>
              <option value="critical">Kritisk</option>
            </Select>
            <Select label="Seksjon" name="section_id" size="small">
              <option value="">Ikke tilknyttet</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </HStack>
          <TextField
            label="Kort overskrift"
            name="short_title"
            size="small"
            placeholder="Kort beskrivende tittel"
            autoComplete="off"
          />
          <Textarea
            label="Lang overskrift"
            name="long_title"
            size="small"
            placeholder="Utdypende beskrivelse av risiko eller kontroll"
          />
          <HStack gap="space-8">
            <Button type="submit" size="small">
              Opprett
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

function ItemCard({
  item,
  sections,
}: {
  item: ReturnType<typeof useLoaderData<typeof loader>>['items'][number]
  sections: Array<{ id: number; name: string }>
}) {
  const [editing, setEditing] = useState(false)

  const categoryIcon =
    item.category === 'risk' ? (
      <ExclamationmarkTriangleIcon aria-hidden fontSize="1.2em" />
    ) : (
      <ShieldCheckmarkIcon aria-hidden fontSize="1.2em" />
    )

  if (editing) {
    return (
      <Box padding="space-16" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
        <Form method="post" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="id" value={item.id} />
          <VStack gap="space-12">
            <HStack gap="space-12" wrap>
              <Select label="Status" name="status" size="small" defaultValue={item.status}>
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select label="Alvorlighetsgrad" name="severity" size="small" defaultValue={item.severity ?? ''}>
                <option value="">Ikke angitt</option>
                {Object.entries(SEVERITY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select label="Seksjon" name="section_id" size="small" defaultValue={item.section_id ?? ''}>
                <option value="">Ikke tilknyttet</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </HStack>
            <TextField label="Kort overskrift" name="short_title" size="small" defaultValue={item.short_title} />
            <Textarea label="Lang overskrift" name="long_title" size="small" defaultValue={item.long_title} />
            <HStack gap="space-8">
              <Button type="submit" size="small">
                Lagre
              </Button>
              <Button variant="tertiary" size="small" onClick={() => setEditing(false)}>
                Avbryt
              </Button>
            </HStack>
          </VStack>
        </Form>
      </Box>
    )
  }

  return (
    <Box
      padding="space-16"
      borderRadius="8"
      background="raised"
      borderColor={item.category === 'risk' ? 'warning-subtle' : 'neutral-subtle'}
      borderWidth="1"
    >
      <VStack gap="space-8">
        <HStack justify="space-between" align="start" wrap>
          <HStack gap="space-8" align="center" style={{ flex: 1 }}>
            {categoryIcon}
            <BodyShort weight="semibold">{item.short_title}</BodyShort>
          </HStack>
          <HStack gap="space-8" align="center">
            {item.severity && (
              <Tag data-color={SEVERITY_COLORS[item.severity]} variant="moderate" size="xsmall">
                {SEVERITY_LABELS[item.severity]}
              </Tag>
            )}
            <Tag data-color={STATUS_COLORS[item.status]} variant="moderate" size="xsmall">
              {STATUS_LABELS[item.status]}
            </Tag>
            <Tag variant="outline" size="xsmall">
              {item.category === 'risk' ? 'Risiko' : 'Kontroll'}
            </Tag>
          </HStack>
        </HStack>

        {item.long_title && <BodyShort size="small">{item.long_title}</BodyShort>}

        <HStack justify="space-between" align="center">
          <Detail textColor="subtle">
            {item.section_name ? `${item.section_name} · ` : ''}
            {new Date(item.created_at).toLocaleDateString('no-NO')}
          </Detail>
          <HStack gap="space-8">
            <Button variant="tertiary" size="xsmall" onClick={() => setEditing(true)}>
              Rediger
            </Button>
            <Form method="post" style={{ display: 'inline' }}>
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={item.id} />
              <Button variant="tertiary" size="xsmall" icon={<TrashIcon aria-hidden />} type="submit" />
            </Form>
          </HStack>
        </HStack>
      </VStack>
    </Box>
  )
}
