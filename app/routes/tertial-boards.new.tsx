import { Alert, Button, Heading, Select, TextField } from '@navikt/ds-react';
import { Form, redirect } from 'react-router';
import { createBoard } from '../db/tertial';
import type { Route } from './+types/tertial-boards.new';

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const teamName = formData.get('team_name') as string;
  const year = parseInt(formData.get('year') as string, 10);
  const tertial = parseInt(formData.get('tertial') as string, 10);

  if (!teamName || !year || !tertial) {
    return { error: 'Alle felt må fylles ut' };
  }

  try {
    const board = await createBoard({ team_name: teamName, year, tertial });
    return redirect(`/tertial-boards/${board.id}`);
  } catch (_error) {
    return { error: 'Kunne ikke opprette tertialtavle' };
  }
}

export default function NewTertialBoard({ actionData }: Route.ComponentProps) {
  const currentYear = new Date().getFullYear();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Heading size="large">Opprett tertialtavle</Heading>

      {actionData?.error && <Alert variant="error">{actionData.error}</Alert>}

      <Form method="post">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <TextField label="Teamnavn" name="team_name" description="F.eks. pensjon-q2" required />

          <Select label="År" name="year" required>
            <option value="">Velg år</option>
            <option value={currentYear - 1}>{currentYear - 1}</option>
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear + 1}>{currentYear + 1}</option>
          </Select>

          <Select label="Tertial" name="tertial" required>
            <option value="">Velg tertial</option>
            <option value="1">Tertial 1 (jan-apr)</option>
            <option value="2">Tertial 2 (mai-aug)</option>
            <option value="3">Tertial 3 (sep-des)</option>
          </Select>

          <Button type="submit">Opprett tavle</Button>
        </div>
      </Form>
    </div>
  );
}
