import { PlusIcon } from '@navikt/aksel-icons';
import { Alert, Button, Heading, Table } from '@navikt/ds-react';
import { Link } from 'react-router';
import { getAllRepositories } from '../db/repositories';
import type { Route } from './+types/repos';

export async function loader() {
  const repos = await getAllRepositories();
  return { repos };
}

export default function Repos({ loaderData }: Route.ComponentProps) {
  const { repos } = loaderData;

  if (repos.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Heading size="large">Repositories</Heading>
        <Alert variant="info">
          Ingen repositories er lagt til ennå. Søk etter et repo for å komme i gang.
        </Alert>
        <div>
          <Button as={Link} to="/repos/search" icon={<PlusIcon aria-hidden />}>
            Søk etter repo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Heading size="large">Repositories</Heading>
        <Button as={Link} to="/repos/search" icon={<PlusIcon aria-hidden />}>
          Søk etter repo
        </Button>
      </div>

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Repository</Table.HeaderCell>
            <Table.HeaderCell>Nais Team</Table.HeaderCell>
            <Table.HeaderCell>Miljø</Table.HeaderCell>
            <Table.HeaderCell>Opprettet</Table.HeaderCell>
            <Table.HeaderCell>Handlinger</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {repos.map((repo) => (
            <Table.Row key={repo.id}>
              <Table.DataCell>
                <Link to={`/repos/${repo.id}`} style={{ fontWeight: 500 }}>
                  {repo.github_owner}/{repo.github_repo_name}
                </Link>
              </Table.DataCell>
              <Table.DataCell>{repo.nais_team_slug}</Table.DataCell>
              <Table.DataCell>{repo.nais_environment_name}</Table.DataCell>
              <Table.DataCell>
                {new Date(repo.created_at).toLocaleDateString('no-NO')}
              </Table.DataCell>
              <Table.DataCell>
                <Button as={Link} to={`/repos/${repo.id}`} size="small" variant="secondary">
                  Vis
                </Button>
              </Table.DataCell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}
