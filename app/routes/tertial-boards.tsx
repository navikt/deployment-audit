import { PlusIcon } from '@navikt/aksel-icons';
import { Alert, Button, Heading, Table } from '@navikt/ds-react';
import { Link } from 'react-router';
import { getAllBoards } from '../db/tertial';
import type { Route } from './+types/tertial-boards';

export async function loader() {
  const boards = await getAllBoards();

  // Group by team
  const boardsByTeam = boards.reduce(
    (acc, board) => {
      if (!acc[board.team_name]) {
        acc[board.team_name] = [];
      }
      acc[board.team_name].push(board);
      return acc;
    },
    {} as Record<string, typeof boards>
  );

  return { boards, boardsByTeam };
}

export default function TertialBoards({ loaderData }: Route.ComponentProps) {
  const { boards, boardsByTeam } = loaderData;

  if (boards.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Heading size="large">Tertialtavler</Heading>
        <Alert variant="info">
          Ingen tertialtavler opprettet ennå. Opprett en tavle for å komme i gang.
        </Alert>
        <div>
          <Button as={Link} to="/tertial-boards/new" icon={<PlusIcon aria-hidden />}>
            Opprett tertialtavle
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Heading size="large">Tertialtavler</Heading>
        <Button as={Link} to="/tertial-boards/new" icon={<PlusIcon aria-hidden />}>
          Opprett tertialtavle
        </Button>
      </div>

      {Object.entries(boardsByTeam).map(([teamName, teamBoards]) => (
        <div key={teamName}>
          <Heading size="medium" spacing>
            {teamName}
          </Heading>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>År</Table.HeaderCell>
                <Table.HeaderCell>Tertial</Table.HeaderCell>
                <Table.HeaderCell>Opprettet</Table.HeaderCell>
                <Table.HeaderCell>Handlinger</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {teamBoards.map((board) => (
                <Table.Row key={board.id}>
                  <Table.DataCell>{board.year}</Table.DataCell>
                  <Table.DataCell>T{board.tertial}</Table.DataCell>
                  <Table.DataCell>
                    {new Date(board.created_at).toLocaleDateString('no-NO')}
                  </Table.DataCell>
                  <Table.DataCell>
                    <Button
                      as={Link}
                      to={`/tertial-boards/${board.id}`}
                      size="small"
                      variant="secondary"
                    >
                      Administrer
                    </Button>
                  </Table.DataCell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      ))}
    </div>
  );
}
