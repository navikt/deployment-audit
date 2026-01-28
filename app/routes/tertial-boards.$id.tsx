import { PlusIcon, TrashIcon } from '@navikt/aksel-icons';
import {
  Alert,
  BodyShort,
  Button,
  ConfirmationPanel,
  Detail,
  Heading,
  Panel,
  Textarea,
  TextField,
} from '@navikt/ds-react';
import { useState } from 'react';
import { Form, redirect } from 'react-router';
import {
  createGoal,
  deleteBoard,
  deleteGoal,
  getBoardById,
  getGoalsByBoardId,
} from '../db/tertial.server';
import styles from '../styles/common.module.css';
import type { Route } from './+types/tertial-boards.$id';

export async function loader({ params }: Route.LoaderArgs) {
  const boardId = parseInt(params.id, 10);
  const board = await getBoardById(boardId);

  if (!board) {
    throw new Response('Board not found', { status: 404 });
  }

  const goals = await getGoalsByBoardId(boardId);

  return { board, goals };
}

export async function action({ request, params }: Route.ActionArgs) {
  const boardId = parseInt(params.id, 10);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'add_goal') {
    const title = formData.get('goal_title') as string;
    const description = formData.get('goal_description') as string;

    if (!title || title.trim() === '') {
      return { error: 'Måltittel må fylles ut' };
    }

    try {
      await createGoal({
        board_id: boardId,
        goal_title: title.trim(),
        goal_description: description || undefined,
      });
      return { success: 'Mål lagt til' };
    } catch (_error) {
      return { error: 'Kunne ikke legge til mål' };
    }
  }

  if (intent === 'delete_goal') {
    const goalId = parseInt(formData.get('goal_id') as string, 10);
    try {
      await deleteGoal(goalId);
      return { success: 'Mål slettet' };
    } catch (_error) {
      return { error: 'Kunne ikke slette mål' };
    }
  }

  if (intent === 'delete_board') {
    try {
      await deleteBoard(boardId);
      return redirect('/tertial-boards');
    } catch (_error) {
      return { error: 'Kunne ikke slette tertialtavle' };
    }
  }

  return null;
}

export default function TertialBoardDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { board, goals } = loaderData;
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={styles.stackContainer}>
      <div>
        <Detail>Tertialtavle</Detail>
        <Heading size="large">
          {board.team_name} - {board.year} T{board.tertial}
        </Heading>
      </div>

      {actionData?.success && <Alert variant="success">{actionData.success}</Alert>}
      {actionData?.error && <Alert variant="error">{actionData.error}</Alert>}

      <div>
        <Heading size="medium" spacing>
          Mål ({goals.length})
        </Heading>

        {goals.length === 0 ? (
          <Alert variant="info">Ingen mål lagt til ennå. Legg til et mål under.</Alert>
        ) : (
          <div className={styles.stackContainer}>
            {goals.map((goal) => (
              <Panel key={goal.id} border>
                <div className={styles.stackContainer}>
                  <Heading size="small">{goal.goal_title}</Heading>
                  {goal.goal_description && <BodyShort>{goal.goal_description}</BodyShort>}
                  <Form method="post" className={styles.marginTop05}>
                    <input type="hidden" name="intent" value="delete_goal" />
                    <input type="hidden" name="goal_id" value={goal.id} />
                    <Button
                      type="submit"
                      size="small"
                      variant="tertiary"
                      icon={<TrashIcon aria-hidden />}
                    >
                      Slett mål
                    </Button>
                  </Form>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>

      <Panel border>
        <Form
          method="post"
          onSubmit={() => {
            setGoalTitle('');
            setGoalDescription('');
          }}
        >
          <input type="hidden" name="intent" value="add_goal" />
          <div className={styles.formContainer}>
            <Heading size="small">Legg til nytt mål</Heading>

            <TextField
              label="Måltittel"
              name="goal_title"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              required
            />

            <Textarea
              label="Beskrivelse (valgfri)"
              name="goal_description"
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
              rows={3}
            />

            <Button type="submit" icon={<PlusIcon aria-hidden />}>
              Legg til mål
            </Button>
          </div>
        </Form>
      </Panel>

      <div className={styles.dangerZone}>
        <Heading size="small" spacing>
          Farlig sone
        </Heading>

        <Form method="post">
          <input type="hidden" name="intent" value="delete_board" />
          <div className={styles.formContainer}>
            <ConfirmationPanel
              checked={confirmDelete}
              onChange={() => setConfirmDelete(!confirmDelete)}
              label="Ja, jeg er sikker på at jeg vil slette denne tertialtavlen"
            >
              Sletting fjerner også alle mål i tavlen og koblingen til deployments.
            </ConfirmationPanel>

            <div>
              <Button
                type="submit"
                variant="danger"
                icon={<TrashIcon aria-hidden />}
                disabled={!confirmDelete}
              >
                Slett tertialtavle
              </Button>
            </div>
          </div>
        </Form>
      </div>
    </div>
  );
}
