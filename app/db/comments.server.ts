import { query } from './connection.server';

export interface DeploymentComment {
  id: number;
  deployment_id: number;
  comment_text: string;
  slack_link: string | null;
  created_at: Date;
}

export interface CreateCommentParams {
  deployment_id: number;
  comment_text: string;
  slack_link?: string;
}

export async function getCommentsByDeploymentId(
  deployment_id: number
): Promise<DeploymentComment[]> {
  const result = await query<DeploymentComment>(
    'SELECT * FROM deployment_comments WHERE deployment_id = $1 ORDER BY created_at DESC',
    [deployment_id]
  );
  return result.rows;
}

export async function createComment(params: CreateCommentParams): Promise<DeploymentComment> {
  const result = await query<DeploymentComment>(
    `INSERT INTO deployment_comments (deployment_id, comment_text, slack_link)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.deployment_id, params.comment_text, params.slack_link || null]
  );
  return result.rows[0];
}

export async function deleteComment(id: number): Promise<boolean> {
  const result = await query('DELETE FROM deployment_comments WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
