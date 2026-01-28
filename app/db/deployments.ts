import { query } from './connection';

export interface Deployment {
  id: number;
  repo_id: number;
  nais_deployment_id: string;
  created_at: Date;
  team_slug: string;
  environment_name: string;
  repository: string;
  deployer_username: string;
  commit_sha: string;
  trigger_url: string | null;
  has_four_eyes: boolean;
  four_eyes_status: string;
  github_pr_number: number | null;
  github_pr_url: string | null;
  synced_at: Date;
}

export interface CreateDeploymentParams {
  repo_id: number;
  nais_deployment_id: string;
  created_at: Date;
  team_slug: string;
  environment_name: string;
  repository: string;
  deployer_username: string;
  commit_sha: string;
  trigger_url: string | null;
  has_four_eyes: boolean;
  four_eyes_status: string;
  github_pr_number?: number;
  github_pr_url?: string;
}

export interface DeploymentFilters {
  repo_id?: number;
  start_date?: Date;
  end_date?: Date;
  four_eyes_status?: string;
  only_missing_four_eyes?: boolean;
  environment_name?: string;
}

export async function getAllDeployments(filters?: DeploymentFilters): Promise<Deployment[]> {
  let sql = 'SELECT * FROM deployments WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.repo_id) {
    sql += ` AND repo_id = $${paramIndex++}`;
    params.push(filters.repo_id);
  }

  if (filters?.start_date) {
    sql += ` AND created_at >= $${paramIndex++}`;
    params.push(filters.start_date);
  }

  if (filters?.end_date) {
    sql += ` AND created_at <= $${paramIndex++}`;
    params.push(filters.end_date);
  }

  if (filters?.four_eyes_status) {
    sql += ` AND four_eyes_status = $${paramIndex++}`;
    params.push(filters.four_eyes_status);
  }

  if (filters?.only_missing_four_eyes) {
    sql += ' AND has_four_eyes = false';
  }

  if (filters?.environment_name) {
    sql += ` AND environment_name = $${paramIndex++}`;
    params.push(filters.environment_name);
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query<Deployment>(sql, params);
  return result.rows;
}

export async function getDeploymentById(id: number): Promise<Deployment | null> {
  const result = await query<Deployment>('SELECT * FROM deployments WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getDeploymentByNaisId(
  nais_deployment_id: string
): Promise<Deployment | null> {
  const result = await query<Deployment>(
    'SELECT * FROM deployments WHERE nais_deployment_id = $1',
    [nais_deployment_id]
  );
  return result.rows[0] || null;
}

export async function createDeployment(params: CreateDeploymentParams): Promise<Deployment> {
  const result = await query<Deployment>(
    `INSERT INTO deployments (
      repo_id, nais_deployment_id, created_at, team_slug, environment_name,
      repository, deployer_username, commit_sha, trigger_url, has_four_eyes,
      four_eyes_status, github_pr_number, github_pr_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (nais_deployment_id) DO UPDATE SET
      has_four_eyes = EXCLUDED.has_four_eyes,
      four_eyes_status = EXCLUDED.four_eyes_status,
      github_pr_number = EXCLUDED.github_pr_number,
      github_pr_url = EXCLUDED.github_pr_url,
      synced_at = CURRENT_TIMESTAMP
    RETURNING *`,
    [
      params.repo_id,
      params.nais_deployment_id,
      params.created_at,
      params.team_slug,
      params.environment_name,
      params.repository,
      params.deployer_username,
      params.commit_sha,
      params.trigger_url,
      params.has_four_eyes,
      params.four_eyes_status,
      params.github_pr_number || null,
      params.github_pr_url || null,
    ]
  );

  return result.rows[0];
}

export async function getDeploymentStats(): Promise<{
  total: number;
  with_four_eyes: number;
  without_four_eyes: number;
  percentage: number;
}> {
  const result = await query<{
    total: string;
    with_four_eyes: string;
    without_four_eyes: string;
  }>(
    `SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE has_four_eyes = true) as with_four_eyes,
      COUNT(*) FILTER (WHERE has_four_eyes = false) as without_four_eyes
    FROM deployments`
  );

  const row = result.rows[0];
  const total = parseInt(row.total, 10);
  const withFourEyes = parseInt(row.with_four_eyes, 10);
  const withoutFourEyes = parseInt(row.without_four_eyes, 10);
  const percentage = total > 0 ? (withFourEyes / total) * 100 : 0;

  return {
    total,
    with_four_eyes: withFourEyes,
    without_four_eyes: withoutFourEyes,
    percentage: Math.round(percentage * 10) / 10,
  };
}
