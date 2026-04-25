import { HGrid } from '@navikt/ds-react'
import type { Meta, StoryObj } from '@storybook/react'
import { type BoardSummary, BoardSummaryCard } from '../BoardSummaryCard'

const meta: Meta<typeof BoardSummaryCard> = {
  title: 'Components/BoardSummaryCard',
  component: BoardSummaryCard,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '600px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof BoardSummaryCard>

const baseBoard: BoardSummary = {
  boardId: 1,
  periodLabel: 'T1 2026',
  teamName: 'Skjermbildemodernisering',
  teamSlug: 'skjermbildemodernisering',
  sectionSlug: 'pensjon',
  objectives: [
    {
      objective_id: 1,
      objective_title: 'Forbedre brukeropplevelse i saksbehandlerverktøy',
      total_linked_deployments: 12,
    },
    { objective_id: 2, objective_title: 'Modernisere komponentbibliotek', total_linked_deployments: 7 },
    { objective_id: 3, objective_title: 'Redusere teknisk gjeld', total_linked_deployments: 3 },
  ],
}

export const Default: Story = {
  args: { board: baseBoard },
}

export const UtenMål: Story = {
  name: 'Uten mål',
  args: {
    board: {
      ...baseBoard,
      boardId: 2,
      objectives: [],
    },
  },
}

export const BareEttMål: Story = {
  name: 'Bare ett mål',
  args: {
    board: {
      ...baseBoard,
      boardId: 3,
      teamName: 'Starte pensjon',
      teamSlug: 'starte-pensjon',
      objectives: [{ objective_id: 10, objective_title: 'Lansere ny pensjonskalkulator', total_linked_deployments: 5 }],
    },
  },
}

export const MålUtenLeveranser: Story = {
  name: 'Mål uten koblede leveranser',
  args: {
    board: {
      ...baseBoard,
      boardId: 4,
      objectives: [
        { objective_id: 20, objective_title: 'Pilot for nytt fagsystem', total_linked_deployments: 0 },
        { objective_id: 21, objective_title: 'Utforske AI-assistert saksbehandling', total_linked_deployments: 0 },
      ],
    },
  },
}

export const MangeLeveranser: Story = {
  name: 'Mange leveranser',
  args: {
    board: {
      ...baseBoard,
      boardId: 5,
      objectives: [
        { objective_id: 30, objective_title: 'Stabilisere produksjonsmiljø', total_linked_deployments: 84 },
        { objective_id: 31, objective_title: 'Migrere til ny plattform', total_linked_deployments: 56 },
        { objective_id: 32, objective_title: 'Innføre nye kvalitetssikringsrutiner', total_linked_deployments: 23 },
      ],
    },
  },
}

export const IGrid: Story = {
  name: 'I grid (to kort side ved side)',
  render: () => (
    <HGrid gap="space-16" columns={{ xs: 1, md: 2 }}>
      <BoardSummaryCard board={baseBoard} />
      <BoardSummaryCard
        board={{
          ...baseBoard,
          boardId: 99,
          teamName: 'Starte pensjon',
          teamSlug: 'starte-pensjon',
          objectives: [
            { objective_id: 40, objective_title: 'Forenkle søknadsflyt', total_linked_deployments: 9 },
            { objective_id: 41, objective_title: 'Bedre feilhåndtering', total_linked_deployments: 0 },
          ],
        }}
      />
    </HGrid>
  ),
}
