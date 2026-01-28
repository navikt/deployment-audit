import { query } from './connection.server';

export interface TertialBoard {
  id: number;
  team_name: string;
  year: number;
  tertial: number;
  created_at: Date;
}

export interface TertialGoal {
  id: number;
  board_id: number;
  goal_title: string;
  goal_description: string | null;
  created_at: Date;
}

export interface CreateBoardParams {
  team_name: string;
  year: number;
  tertial: number;
}

export interface CreateGoalParams {
  board_id: number;
  goal_title: string;
  goal_description?: string;
}

// Tertial Boards
export async function getAllBoards(): Promise<TertialBoard[]> {
  const result = await query<TertialBoard>(
    'SELECT * FROM tertial_boards ORDER BY year DESC, tertial DESC'
  );
  return result.rows;
}

export async function getBoardById(id: number): Promise<TertialBoard | null> {
  const result = await query<TertialBoard>('SELECT * FROM tertial_boards WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createBoard(params: CreateBoardParams): Promise<TertialBoard> {
  const result = await query<TertialBoard>(
    `INSERT INTO tertial_boards (team_name, year, tertial)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_name, year, tertial) DO UPDATE SET created_at = tertial_boards.created_at
     RETURNING *`,
    [params.team_name, params.year, params.tertial]
  );
  return result.rows[0];
}

export async function deleteBoard(id: number): Promise<boolean> {
  const result = await query('DELETE FROM tertial_boards WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// Tertial Goals
export async function getGoalsByBoardId(board_id: number): Promise<TertialGoal[]> {
  const result = await query<TertialGoal>(
    'SELECT * FROM tertial_goals WHERE board_id = $1 ORDER BY created_at ASC',
    [board_id]
  );
  return result.rows;
}

export async function createGoal(params: CreateGoalParams): Promise<TertialGoal> {
  const result = await query<TertialGoal>(
    `INSERT INTO tertial_goals (board_id, goal_title, goal_description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.board_id, params.goal_title, params.goal_description || null]
  );
  return result.rows[0];
}

export async function updateGoal(
  id: number,
  goal_title: string,
  goal_description?: string
): Promise<TertialGoal | null> {
  const result = await query<TertialGoal>(
    `UPDATE tertial_goals SET goal_title = $1, goal_description = $2
     WHERE id = $3
     RETURNING *`,
    [goal_title, goal_description || null, id]
  );
  return result.rows[0] || null;
}

export async function deleteGoal(id: number): Promise<boolean> {
  const result = await query('DELETE FROM tertial_goals WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// Deployment-Goal associations
export async function linkDeploymentToGoal(deployment_id: number, goal_id: number): Promise<void> {
  await query(
    `INSERT INTO deployment_goals (deployment_id, goal_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [deployment_id, goal_id]
  );
}

export async function unlinkDeploymentFromGoal(
  deployment_id: number,
  goal_id: number
): Promise<void> {
  await query('DELETE FROM deployment_goals WHERE deployment_id = $1 AND goal_id = $2', [
    deployment_id,
    goal_id,
  ]);
}

export async function getGoalsForDeployment(deployment_id: number): Promise<TertialGoal[]> {
  const result = await query<TertialGoal>(
    `SELECT tg.* FROM tertial_goals tg
     JOIN deployment_goals dg ON tg.id = dg.goal_id
     WHERE dg.deployment_id = $1
     ORDER BY tg.created_at ASC`,
    [deployment_id]
  );
  return result.rows;
}
