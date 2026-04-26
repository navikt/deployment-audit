import { LinkIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons'
import { BodyShort, Box, Button, Heading, HStack, Select, Tabs, Tag, TextField, VStack } from '@navikt/ds-react'
import { useState } from 'react'
import { Form } from 'react-router'
import type { DeploymentGoalLinkWithDetails } from '~/db/deployment-goal-links.server'
import { formatBoardLabel } from '~/lib/board-periods'
import { ExternalLink } from './ExternalLink'

const LINK_METHOD_LABELS: Record<string, string> = {
  manual: 'Manuell',
  slack: 'Slack',
  commit_keyword: 'Commit-nøkkelord',
  pr_title: 'PR-tittel',
}

interface AvailableBoard {
  id: number
  period_label: string
  dev_team_name?: string
  objectives: Array<{
    id: number
    title: string
    key_results: Array<{ id: number; title: string }>
  }>
}

interface GoalLinksSectionProps {
  goalLinks: DeploymentGoalLinkWithDetails[]
  availableBoards?: AvailableBoard[]
  sectionBoards?: AvailableBoard[]
}

export function GoalLinksSection({ goalLinks, availableBoards = [], sectionBoards = [] }: GoalLinksSectionProps) {
  const [showAddLink, setShowAddLink] = useState(false)

  return (
    <VStack gap="space-16">
      <HStack justify="space-between" align="center">
        <Heading size="medium" level="2">
          Endringsopphav
        </Heading>
        <Button
          variant="tertiary"
          size="small"
          icon={<PlusIcon aria-hidden />}
          onClick={() => setShowAddLink(!showAddLink)}
        >
          Knytt til mål
        </Button>
      </HStack>

      {goalLinks.length === 0 && !showAddLink && (
        <BodyShort textColor="subtle" style={{ fontStyle: 'italic' }}>
          Ingen kobling til mål eller ekstern referanse.
        </BodyShort>
      )}

      {goalLinks.length > 0 && (
        <VStack gap="space-8">
          {goalLinks.map((link) => (
            <GoalLinkItem key={link.id} link={link} />
          ))}
        </VStack>
      )}

      {showAddLink && (
        <AddGoalLinkForm
          onCancel={() => setShowAddLink(false)}
          availableBoards={availableBoards}
          sectionBoards={sectionBoards}
        />
      )}
    </VStack>
  )
}

function GoalLinkItem({ link }: { link: DeploymentGoalLinkWithDetails }) {
  const label = link.key_result_title
    ? `${link.objective_title} → ${link.key_result_title}`
    : link.objective_title
      ? link.objective_title
      : (link.external_url_title ?? link.external_url ?? '(ukjent)')

  const isGoalInactive = link.objective_is_active === false || link.key_result_is_active === false
  const isLinkRemoved = link.is_active === false
  const isInactive = isGoalInactive || isLinkRemoved

  return (
    <Box padding="space-12" borderRadius="8" background="sunken">
      <HStack justify="space-between" align="center">
        <HStack gap="space-8" align="center" wrap>
          <LinkIcon aria-hidden />
          <div>
            {link.external_url ? (
              <ExternalLink href={link.external_url}>{label}</ExternalLink>
            ) : (
              <BodyShort weight="semibold">{label}</BodyShort>
            )}
            <HStack gap="space-4">
              {link.board_period_label && (
                <Tag variant="neutral" size="xsmall">
                  {link.board_period_label}
                </Tag>
              )}
              <Tag variant={link.link_method === 'commit_keyword' ? 'alt3' : 'info'} size="xsmall">
                {LINK_METHOD_LABELS[link.link_method] ?? link.link_method}
              </Tag>
              {isLinkRemoved && (
                <Tag variant="neutral" size="xsmall">
                  Fjernet
                </Tag>
              )}
              {isGoalInactive && !isLinkRemoved && (
                <Tag variant="warning" size="xsmall">
                  Deaktivert
                </Tag>
              )}
            </HStack>
          </div>
        </HStack>
        <Form method="post" style={{ display: 'inline' }}>
          <input type="hidden" name="intent" value="unlink_goal" />
          <input type="hidden" name="link_id" value={link.id} />
          <Button
            variant="tertiary-neutral"
            size="xsmall"
            icon={<TrashIcon aria-hidden />}
            type="submit"
            disabled={isInactive}
          />
        </Form>
      </HStack>
    </Box>
  )
}

function AddGoalLinkForm({
  onCancel,
  availableBoards,
  sectionBoards,
}: {
  onCancel: () => void
  availableBoards: AvailableBoard[]
  sectionBoards: AvailableBoard[]
}) {
  const [selectedBoardId, setSelectedBoardId] = useState('')
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('')
  const [selectedKeyResultId, setSelectedKeyResultId] = useState('')

  const allBoards = [...availableBoards, ...sectionBoards]
  const selectedBoard = allBoards.find((b) => String(b.id) === selectedBoardId)
  const selectedObjective = selectedBoard?.objectives.find((o) => String(o.id) === selectedObjectiveId)

  const hasBoards = availableBoards.length > 0
  const hasSectionBoards = sectionBoards.length > 0

  const resetSelections = () => {
    setSelectedBoardId('')
    setSelectedObjectiveId('')
    setSelectedKeyResultId('')
  }

  const goalForm = (boards: AvailableBoard[]) => (
    <Form method="post" onSubmit={onCancel}>
      <input type="hidden" name="intent" value="link_goal" />
      {selectedObjectiveId && <input type="hidden" name="objective_id" value={selectedObjectiveId} />}
      {selectedKeyResultId && <input type="hidden" name="key_result_id" value={selectedKeyResultId} />}
      <VStack gap="space-12" paddingBlock="space-16 space-0">
        <Select
          label="Tavle"
          size="small"
          value={selectedBoardId}
          onChange={(e) => {
            setSelectedBoardId(e.target.value)
            setSelectedObjectiveId('')
            setSelectedKeyResultId('')
          }}
        >
          <option value="">Velg tavle…</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {formatBoardLabel({ teamName: board.dev_team_name ?? '', periodLabel: board.period_label })}
            </option>
          ))}
        </Select>

        {selectedBoard && (
          <Select
            label="Mål"
            size="small"
            value={selectedObjectiveId}
            onChange={(e) => {
              setSelectedObjectiveId(e.target.value)
              setSelectedKeyResultId('')
            }}
          >
            <option value="">Velg mål…</option>
            {selectedBoard.objectives.map((obj) => (
              <option key={obj.id} value={obj.id}>
                {obj.title}
              </option>
            ))}
          </Select>
        )}

        {selectedObjective && selectedObjective.key_results.length > 0 && (
          <Select
            label="Nøkkelresultat (valgfritt)"
            size="small"
            value={selectedKeyResultId}
            onChange={(e) => setSelectedKeyResultId(e.target.value)}
          >
            <option value="">Kun mål (ingen nøkkelresultat)</option>
            {selectedObjective.key_results.map((kr) => (
              <option key={kr.id} value={kr.id}>
                {kr.title}
              </option>
            ))}
          </Select>
        )}

        <HStack gap="space-8" justify="end">
          <Button variant="tertiary" size="small" onClick={onCancel}>
            Avbryt
          </Button>
          <Button type="submit" size="small" disabled={!selectedObjectiveId}>
            Legg til
          </Button>
        </HStack>
      </VStack>
    </Form>
  )

  return (
    <Box padding="space-16" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
      <Tabs
        defaultValue={hasBoards ? 'goal' : hasSectionBoards ? 'section' : 'external'}
        size="small"
        onChange={resetSelections}
      >
        <Tabs.List>
          {hasBoards && <Tabs.Tab value="goal" label="Mål / nøkkelresultat" />}
          {hasSectionBoards && <Tabs.Tab value="section" label="Andre team i seksjonen" />}
          <Tabs.Tab value="external" label="Ekstern referanse" />
        </Tabs.List>

        {hasBoards && <Tabs.Panel value="goal">{goalForm(availableBoards)}</Tabs.Panel>}

        {hasSectionBoards && <Tabs.Panel value="section">{goalForm(sectionBoards)}</Tabs.Panel>}

        <Tabs.Panel value="external">
          <Form method="post" onSubmit={onCancel}>
            <input type="hidden" name="intent" value="link_goal" />
            <VStack gap="space-12" paddingBlock="space-16 space-0">
              <HStack gap="space-12" wrap>
                <TextField
                  label="URL"
                  name="external_url"
                  size="small"
                  autoComplete="off"
                  style={{ minWidth: '300px' }}
                />
                <TextField label="Tittel (valgfritt)" name="external_url_title" size="small" autoComplete="off" />
              </HStack>
              <HStack gap="space-8" justify="end">
                <Button variant="tertiary" size="small" onClick={onCancel}>
                  Avbryt
                </Button>
                <Button type="submit" size="small">
                  Legg til
                </Button>
              </HStack>
            </VStack>
          </Form>
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}
