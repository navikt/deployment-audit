import {
  Alert,
  BodyShort,
  Button,
  Heading,
  Loader,
  Modal,
  Search,
  Table,
  TextField,
} from '@navikt/ds-react';
import { useState } from 'react';
import { Form, redirect, useNavigation } from 'react-router';
import { createRepository } from '../db/repositories';
import { type GitHubRepo, searchRepositories } from '../lib/github';
import type { Route } from './+types/repos.search';

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'search') {
    const query = formData.get('query') as string;
    if (!query) {
      return { repos: [], query: '' };
    }

    try {
      const repos = await searchRepositories('navikt', query);
      return { repos, query };
    } catch (_error) {
      return {
        repos: [],
        query,
        error: 'Kunne ikke søke i GitHub. Sjekk at GITHUB_TOKEN er satt.',
      };
    }
  }

  if (intent === 'add') {
    const repoName = formData.get('repoName') as string;
    const teamSlug = formData.get('teamSlug') as string;
    const environment = formData.get('environment') as string;

    try {
      const repo = await createRepository({
        github_repo_name: repoName,
        nais_team_slug: teamSlug,
        nais_environment_name: environment,
      });
      return redirect(`/repos/${repo.id}`);
    } catch (_error) {
      return {
        error: 'Kunne ikke legge til repository. Sjekk at alle felt er fylt ut.',
      };
    }
  }

  return null;
}

export default function ReposSearch({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [teamSlug, setTeamSlug] = useState('');
  const [environment, setEnvironment] = useState('');

  const isSearching =
    navigation.state === 'submitting' && navigation.formData?.get('intent') === 'search';

  const repos = actionData?.repos || [];
  const query = actionData?.query || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Heading size="large">Søk etter repository på GitHub</Heading>

      {actionData?.error && <Alert variant="error">{actionData.error}</Alert>}

      <Form method="post">
        <input type="hidden" name="intent" value="search" />
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Search
            label="Søk i navikt organisasjonen"
            hideLabel={false}
            name="query"
            defaultValue={query}
          />
          <Button type="submit" disabled={isSearching}>
            {isSearching ? <Loader size="small" /> : 'Søk'}
          </Button>
        </div>
      </Form>

      {repos.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Repository</Table.HeaderCell>
              <Table.HeaderCell>Beskrivelse</Table.HeaderCell>
              <Table.HeaderCell>Språk</Table.HeaderCell>
              <Table.HeaderCell>Stars</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {repos.map((repo: GitHubRepo) => (
              <Table.Row key={repo.full_name}>
                <Table.DataCell>
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 500 }}
                  >
                    {repo.name}
                  </a>
                </Table.DataCell>
                <Table.DataCell>{repo.description || <em>Ingen beskrivelse</em>}</Table.DataCell>
                <Table.DataCell>{repo.language || '-'}</Table.DataCell>
                <Table.DataCell>{repo.stargazers_count}</Table.DataCell>
                <Table.DataCell>
                  <Button size="small" variant="secondary" onClick={() => setSelectedRepo(repo)}>
                    Legg til
                  </Button>
                </Table.DataCell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {query && repos.length === 0 && !actionData?.error && (
        <Alert variant="info">Ingen repositories funnet for "{query}"</Alert>
      )}

      <Modal
        open={selectedRepo !== null}
        onClose={() => setSelectedRepo(null)}
        header={{ heading: `Legg til ${selectedRepo?.name}` }}
      >
        <Modal.Body>
          <Form method="post">
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="repoName" value={selectedRepo?.name || ''} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <BodyShort>Konfigurer Nais-innstillinger for dette repositoryet.</BodyShort>

              <TextField
                label="Nais Team Slug"
                name="teamSlug"
                value={teamSlug}
                onChange={(e) => setTeamSlug(e.target.value)}
                description="F.eks. pensjon-q2"
                required
              />

              <TextField
                label="Nais Miljø"
                name="environment"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                description="F.eks. dev-gcp, dev-fss, prod-gcp"
                required
              />

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button type="submit">Legg til</Button>
                <Button type="button" variant="secondary" onClick={() => setSelectedRepo(null)}>
                  Avbryt
                </Button>
              </div>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
}
