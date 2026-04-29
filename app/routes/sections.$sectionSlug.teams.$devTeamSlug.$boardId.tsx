import { MinusCircleIcon, PlusCircleIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons'
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
  TextField,
  Tooltip,
  VStack,
} from '@navikt/ds-react'
import { useEffect, useState } from 'react'
import { Form, useLoaderData, useSubmit } from 'react-router'
import { ExternalLink } from '~/components/ExternalLink'
import {
  addExternalReference,
  type BoardKeyResultWithRefs,
  createKeyResult,
  createObjective,
  deactivateKeyResult,
  deactivateObjective,
  deleteExternalReference,
  type ExternalReference,
  getBoardWithObjectives,
  type ObjectiveWithKeyResults,
  reactivateKeyResult,
  reactivateObjective,
  updateKeyResult,
  updateKeyResultKeywords,
  updateObjective,
  updateObjectiveKeywords,
} from '~/db/boards.server'
import { getDevTeamBySlug } from '~/db/dev-teams.server'
import { getSectionBySlug } from '~/db/sections.server'
import { requireUser } from '~/lib/auth.server'
import { computePeriodDates, formatBoardLabel } from '~/lib/board-periods'
import type { Route } from './+types/sections.$sectionSlug.teams.$devTeamSlug.$boardId'

export function meta({ data }: Route.MetaArgs) {
  const label =
    data?.devTeam && data?.board
      ? formatBoardLabel({ teamName: data.devTeam.name, periodLabel: data.board.period_label })
      : 'Tavle'
  return [{ title: label }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request)
  const devTeam = await getDevTeamBySlug(params.devTeamSlug)
  if (!devTeam) throw new Response('Utviklingsteam ikke funnet', { status: 404 })

  const board = await getBoardWithObjectives(Number(params.boardId))
  if (!board || board.dev_team_id !== devTeam.id) throw new Response('Tavle ikke funnet', { status: 404 })

  const section = await getSectionBySlug(params.sectionSlug)
  return { devTeam, board, sectionSlug: params.sectionSlug, sectionName: section?.name ?? params.sectionSlug }
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request)
  const devTeam = await getDevTeamBySlug(params.devTeamSlug)
  if (!devTeam) throw new Response('Utviklingsteam ikke funnet', { status: 404 })

  const formData = await request.formData()
  const intent = formData.get('intent') as string

  try {
    switch (intent) {
      case 'add-objective': {
        const title = (formData.get('title') as string)?.trim()
        if (!title) return { error: 'Tittel er påkrevd.' }
        await createObjective(Number(params.boardId), title, (formData.get('description') as string)?.trim())
        return { success: true }
      }
      case 'update-objective': {
        const id = Number(formData.get('id'))
        const title = (formData.get('title') as string)?.trim()
        if (!title) return { error: 'Tittel er påkrevd.' }
        await updateObjective(id, { title, description: (formData.get('description') as string)?.trim() })
        return { success: true }
      }
      case 'deactivate-objective': {
        await deactivateObjective(Number(formData.get('id')))
        return { success: true }
      }
      case 'reactivate-objective': {
        await reactivateObjective(Number(formData.get('id')))
        return { success: true }
      }
      case 'add-key-result': {
        const objectiveId = Number(formData.get('objective_id'))
        const title = (formData.get('title') as string)?.trim()
        if (!title) return { error: 'Tittel er påkrevd.' }
        await createKeyResult(objectiveId, title, (formData.get('description') as string)?.trim())
        return { success: true }
      }
      case 'update-key-result': {
        const id = Number(formData.get('id'))
        const title = (formData.get('title') as string)?.trim()
        if (!title) return { error: 'Tittel er påkrevd.' }
        await updateKeyResult(id, { title, description: (formData.get('description') as string)?.trim() })
        return { success: true }
      }
      case 'deactivate-key-result': {
        await deactivateKeyResult(Number(formData.get('id')))
        return { success: true }
      }
      case 'reactivate-key-result': {
        await reactivateKeyResult(Number(formData.get('id')))
        return { success: true }
      }
      case 'add-reference': {
        const refType = formData.get('ref_type') as ExternalReference['ref_type']
        const url = (formData.get('url') as string)?.trim()
        const title = (formData.get('ref_title') as string)?.trim()
        const objectiveId = formData.get('objective_id') ? Number(formData.get('objective_id')) : undefined
        const keyResultId = formData.get('key_result_id') ? Number(formData.get('key_result_id')) : undefined
        if (!url) return { error: 'URL er påkrevd.' }
        await addExternalReference({
          ref_type: refType,
          url,
          title,
          objective_id: objectiveId,
          key_result_id: keyResultId,
        })
        return { success: true }
      }
      case 'delete-reference': {
        await deleteExternalReference(Number(formData.get('id')), user.navIdent)
        return { success: true }
      }
      case 'update-objective-keywords': {
        const id = Number(formData.get('id'))
        const raw = (formData.get('keywords') as string) ?? ''
        const keywords = raw
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
        await updateObjectiveKeywords(id, keywords)
        return { success: true }
      }
      case 'update-kr-keywords': {
        const id = Number(formData.get('id'))
        const raw = (formData.get('keywords') as string) ?? ''
        const keywords = raw
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
        await updateKeyResultKeywords(id, keywords)
        return { success: true }
      }
      default:
        return { error: 'Ukjent handling.' }
    }
  } catch (error) {
    return { error: `Feil: ${error}` }
  }
}

export default function BoardDetail() {
  const { devTeam, board } = useLoaderData<typeof loader>()
  const [showAddObjective, setShowAddObjective] = useState(false)

  return (
    <VStack gap="space-24">
      <div>
        <Heading level="1" size="large" spacing>
          {formatBoardLabel({ teamName: devTeam.name, periodLabel: board.period_label })}
        </Heading>
        <HStack gap="space-8">
          <Tag variant="neutral" size="small">
            {board.period_type === 'tertiary' ? 'Tertial' : 'Kvartal'}
          </Tag>
          <Tag variant={board.is_active ? 'success' : 'neutral'} size="small">
            {board.is_active ? 'Aktiv' : 'Avsluttet'}
          </Tag>
          <Detail textColor="subtle">
            {(() => {
              const { start, end } = computePeriodDates(board.period_type, board.period_label)
              return `${new Date(`${start}T00:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(`${end}T00:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })}`
            })()}
          </Detail>
        </HStack>
      </div>

      {board.objectives.length === 0 && !showAddObjective && (
        <Alert variant="info">Ingen mål er lagt til ennå. Legg til det første målet for denne tavlen.</Alert>
      )}

      {board.objectives.map((objective) => (
        <ObjectiveCard key={objective.id} objective={objective} />
      ))}

      {!showAddObjective ? (
        <HStack>
          <Button
            variant="secondary"
            size="small"
            icon={<PlusIcon aria-hidden />}
            onClick={() => setShowAddObjective(true)}
          >
            Legg til mål
          </Button>
        </HStack>
      ) : (
        <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
          <Form method="post" onSubmit={() => setShowAddObjective(false)}>
            <input type="hidden" name="intent" value="add-objective" />
            <VStack gap="space-16">
              <Heading level="2" size="small">
                Nytt mål (Objective)
              </Heading>
              <TextField label="Tittel" name="title" size="small" autoComplete="off" />
              <TextField label="Beskrivelse (valgfritt)" name="description" size="small" autoComplete="off" />
              <HStack gap="space-8">
                <Button type="submit" size="small">
                  Legg til
                </Button>
                <Button variant="tertiary" size="small" onClick={() => setShowAddObjective(false)}>
                  Avbryt
                </Button>
              </HStack>
            </VStack>
          </Form>
        </Box>
      )}
    </VStack>
  )
}

function ObjectiveCard({ objective }: { objective: ObjectiveWithKeyResults }) {
  const [showAddKR, setShowAddKR] = useState(false)
  const [showAddRef, setShowAddRef] = useState(false)
  const isInactive = !objective.is_active

  useEffect(() => {
    if (isInactive) {
      setShowAddKR(false)
      setShowAddRef(false)
    }
  }, [isInactive])

  return (
    <Box
      padding="space-24"
      borderRadius="8"
      background="raised"
      borderColor={isInactive ? 'neutral' : 'neutral-subtle'}
      borderWidth="1"
      style={isInactive ? { opacity: 0.7 } : undefined}
    >
      <VStack gap="space-16">
        <HStack justify="space-between" align="start">
          <HStack gap="space-8" align="center">
            <div>
              <Heading level="2" size="medium">
                {objective.title}
              </Heading>
              {objective.description && <BodyShort textColor="subtle">{objective.description}</BodyShort>}
            </div>
            {isInactive && (
              <Tag variant="neutral" size="xsmall">
                Deaktivert
              </Tag>
            )}
          </HStack>
          <Form method="post" style={{ display: 'inline' }}>
            <input type="hidden" name="intent" value={isInactive ? 'reactivate-objective' : 'deactivate-objective'} />
            <input type="hidden" name="id" value={objective.id} />
            {isInactive ? (
              <Tooltip content="Reaktiver mål">
                <Button variant="tertiary-neutral" size="xsmall" icon={<PlusCircleIcon aria-hidden />} type="submit">
                  Reaktiver
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="Deaktiver mål (kan ikke kobles til nye endringsopphav)">
                <Button variant="tertiary-neutral" size="xsmall" icon={<MinusCircleIcon aria-hidden />} type="submit">
                  Deaktiver
                </Button>
              </Tooltip>
            )}
          </Form>
        </HStack>

        {objective.external_references.length > 0 && (
          <ReferenceList refs={objective.external_references} readOnly={isInactive} />
        )}

        <KeywordEditor
          id={objective.id}
          keywords={objective.keywords ?? []}
          intent="update-objective-keywords"
          readOnly={isInactive}
        />

        {objective.key_results.length > 0 && (
          <VStack gap="space-8">
            <Heading level="3" size="xsmall">
              Nøkkelresultater
            </Heading>
            {objective.key_results.map((kr) => (
              <KeyResultRow key={kr.id} kr={kr} objectiveIsActive={objective.is_active} />
            ))}
          </VStack>
        )}

        {!isInactive && (
          <HStack gap="space-8">
            {!showAddKR && (
              <Button
                variant="tertiary"
                size="xsmall"
                icon={<PlusIcon aria-hidden />}
                onClick={() => setShowAddKR(true)}
              >
                Nøkkelresultat
              </Button>
            )}
            {!showAddRef && (
              <Button
                variant="tertiary"
                size="xsmall"
                icon={<PlusIcon aria-hidden />}
                onClick={() => setShowAddRef(true)}
              >
                Ekstern lenke
              </Button>
            )}
          </HStack>
        )}

        {showAddKR && !isInactive && (
          <Form method="post" onSubmit={() => setShowAddKR(false)}>
            <input type="hidden" name="intent" value="add-key-result" />
            <input type="hidden" name="objective_id" value={objective.id} />
            <VStack gap="space-8">
              <TextField label="Nøkkelresultat" name="title" size="small" autoComplete="off" />
              <TextField label="Beskrivelse (valgfritt)" name="description" size="small" autoComplete="off" />
              <HStack gap="space-8">
                <Button type="submit" size="xsmall">
                  Legg til
                </Button>
                <Button variant="tertiary" size="xsmall" onClick={() => setShowAddKR(false)}>
                  Avbryt
                </Button>
              </HStack>
            </VStack>
          </Form>
        )}

        {showAddRef && !isInactive && (
          <AddReferenceForm objectiveId={objective.id} onCancel={() => setShowAddRef(false)} />
        )}
      </VStack>
    </Box>
  )
}

function KeyResultRow({ kr, objectiveIsActive }: { kr: BoardKeyResultWithRefs; objectiveIsActive: boolean }) {
  const isInactive = !kr.is_active

  return (
    <Box padding="space-12" borderRadius="4" background="sunken" style={isInactive ? { opacity: 0.7 } : undefined}>
      <HStack justify="space-between" align="start">
        <HStack gap="space-8" align="center">
          <div>
            <BodyShort weight="semibold">{kr.title}</BodyShort>
            {kr.description && (
              <BodyShort size="small" textColor="subtle">
                {kr.description}
              </BodyShort>
            )}
            {kr.external_references.length > 0 && (
              <ReferenceList refs={kr.external_references} readOnly={isInactive || !objectiveIsActive} />
            )}
            <KeywordEditor
              id={kr.id}
              keywords={kr.keywords ?? []}
              intent="update-kr-keywords"
              readOnly={isInactive || !objectiveIsActive}
            />
          </div>
          {isInactive && (
            <Tag variant="neutral" size="xsmall">
              Deaktivert
            </Tag>
          )}
        </HStack>
        <Form method="post" style={{ display: 'inline' }}>
          <input type="hidden" name="intent" value={isInactive ? 'reactivate-key-result' : 'deactivate-key-result'} />
          <input type="hidden" name="id" value={kr.id} />
          {isInactive ? (
            objectiveIsActive ? (
              <Tooltip content="Reaktiver nøkkelresultat">
                <Button variant="tertiary-neutral" size="xsmall" icon={<PlusCircleIcon aria-hidden />} type="submit">
                  Reaktiver
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="Reaktiver målet først for å kunne endre nøkkelresultatet">
                <span>
                  <Button
                    variant="tertiary-neutral"
                    size="xsmall"
                    icon={<PlusCircleIcon aria-hidden />}
                    type="submit"
                    disabled
                  >
                    Reaktiver
                  </Button>
                </span>
              </Tooltip>
            )
          ) : objectiveIsActive ? (
            <Tooltip content="Deaktiver nøkkelresultat">
              <Button variant="tertiary-neutral" size="xsmall" icon={<MinusCircleIcon aria-hidden />} type="submit">
                Deaktiver
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content="Reaktiver målet først for å kunne endre nøkkelresultatet">
              <span>
                <Button
                  variant="tertiary-neutral"
                  size="xsmall"
                  icon={<MinusCircleIcon aria-hidden />}
                  type="submit"
                  disabled
                >
                  Deaktiver
                </Button>
              </span>
            </Tooltip>
          )}
        </Form>
      </HStack>
    </Box>
  )
}

function ReferenceList({ refs, readOnly }: { refs: ExternalReference[]; readOnly?: boolean }) {
  const REF_TYPE_LABELS: Record<string, string> = {
    jira: 'Jira',
    slack: 'Slack',
    confluence: 'Confluence',
    github_issue: 'GitHub Issue',
    other: 'Lenke',
  }

  return (
    <HStack gap="space-4" wrap>
      {refs.map((ref) => (
        <HStack key={ref.id} gap="space-4" align="center">
          <Tag variant="info" size="xsmall">
            {REF_TYPE_LABELS[ref.ref_type] ?? ref.ref_type}
          </Tag>
          <ExternalLink href={ref.url}>{ref.title ?? ref.url}</ExternalLink>
          {!readOnly && (
            <Form method="post" style={{ display: 'inline' }}>
              <input type="hidden" name="intent" value="delete-reference" />
              <input type="hidden" name="id" value={ref.id} />
              <Button variant="tertiary-neutral" size="xsmall" icon={<TrashIcon aria-hidden />} type="submit" />
            </Form>
          )}
        </HStack>
      ))}
    </HStack>
  )
}

function AddReferenceForm({
  objectiveId,
  keyResultId,
  onCancel,
}: {
  objectiveId?: number
  keyResultId?: number
  onCancel: () => void
}) {
  return (
    <Form method="post" onSubmit={onCancel}>
      <input type="hidden" name="intent" value="add-reference" />
      {objectiveId && <input type="hidden" name="objective_id" value={objectiveId} />}
      {keyResultId && <input type="hidden" name="key_result_id" value={keyResultId} />}
      <VStack gap="space-8">
        <HStack gap="space-8" wrap>
          <Select label="Type" name="ref_type" size="small">
            <option value="jira">Jira</option>
            <option value="slack">Slack</option>
            <option value="confluence">Confluence</option>
            <option value="github_issue">GitHub Issue</option>
            <option value="other">Annet</option>
          </Select>
          <TextField label="URL" name="url" size="small" autoComplete="off" style={{ minWidth: '300px' }} />
          <TextField label="Tittel (valgfritt)" name="ref_title" size="small" autoComplete="off" />
        </HStack>
        <HStack gap="space-8">
          <Button type="submit" size="xsmall">
            Legg til
          </Button>
          <Button variant="tertiary" size="xsmall" onClick={onCancel}>
            Avbryt
          </Button>
        </HStack>
      </VStack>
    </Form>
  )
}

function KeywordEditor({
  id,
  keywords,
  intent,
  readOnly,
}: {
  id: number
  keywords: string[]
  intent: string
  readOnly?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const submit = useSubmit()

  function handleAdd() {
    const trimmed = newKeyword.trim()
    if (!trimmed || keywords.includes(trimmed)) return
    const updated = [...keywords, trimmed]
    const formData = new FormData()
    formData.set('intent', intent)
    formData.set('id', String(id))
    formData.set('keywords', updated.join(','))
    submit(formData, { method: 'post' })
    setNewKeyword('')
    setAdding(false)
  }

  function handleRemove(keyword: string) {
    const updated = keywords.filter((k) => k !== keyword)
    const formData = new FormData()
    formData.set('intent', intent)
    formData.set('id', String(id))
    formData.set('keywords', updated.join(','))
    submit(formData, { method: 'post' })
  }

  return (
    <VStack gap="space-4">
      <HStack gap="space-4" align="center" wrap>
        <Detail textColor="subtle">Kode-ord:</Detail>
        {keywords.length === 0 && !adding && (
          <Detail textColor="subtle" style={{ fontStyle: 'italic' }}>
            Ingen
          </Detail>
        )}
        {keywords.map((kw) => (
          <Tag key={kw} variant="neutral" size="xsmall">
            {readOnly ? (
              kw
            ) : (
              <HStack gap="space-4" align="center">
                {kw}
                <button
                  type="button"
                  onClick={() => handleRemove(kw)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                  aria-label={`Fjern kode-ord ${kw}`}
                >
                  ×
                </button>
              </HStack>
            )}
          </Tag>
        ))}
        {!adding && !readOnly && (
          <Button
            variant="tertiary-neutral"
            size="xsmall"
            icon={<PlusIcon aria-hidden />}
            onClick={() => setAdding(true)}
          >
            Legg til
          </Button>
        )}
      </HStack>
      {adding && (
        <HStack gap="space-4" align="end">
          <TextField
            label="Kode-ord"
            hideLabel
            size="small"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder="f.eks. PEN-123"
            autoFocus
            style={{ width: '160px' }}
          />
          <Button size="xsmall" onClick={handleAdd}>
            Legg til
          </Button>
          <Button
            variant="tertiary"
            size="xsmall"
            onClick={() => {
              setAdding(false)
              setNewKeyword('')
            }}
          >
            Avbryt
          </Button>
        </HStack>
      )}
    </VStack>
  )
}
