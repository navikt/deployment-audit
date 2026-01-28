-- Database schema for Pensjon Deployment Audit Application

-- Repositories configuration
CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  github_owner VARCHAR(255) NOT NULL DEFAULT 'navikt',
  github_repo_name VARCHAR(255) NOT NULL,
  nais_team_slug VARCHAR(255) NOT NULL,
  nais_environment_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(github_owner, github_repo_name, nais_team_slug, nais_environment_name)
);

-- Deployments from Nais
CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  nais_deployment_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  team_slug VARCHAR(255) NOT NULL,
  environment_name VARCHAR(255) NOT NULL,
  repository VARCHAR(512) NOT NULL,
  deployer_username VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(40) NOT NULL,
  trigger_url TEXT,
  has_four_eyes BOOLEAN DEFAULT FALSE,
  four_eyes_status VARCHAR(50) DEFAULT 'unknown',
  github_pr_number INTEGER,
  github_pr_url TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deployments_repo_id ON deployments(repo_id);
CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments(created_at);
CREATE INDEX IF NOT EXISTS idx_deployments_commit_sha ON deployments(commit_sha);
CREATE INDEX IF NOT EXISTS idx_deployments_four_eyes_status ON deployments(four_eyes_status);

-- Comments on deployments (including Slack links for direct pushes)
CREATE TABLE IF NOT EXISTS deployment_comments (
  id SERIAL PRIMARY KEY,
  deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  slack_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deployment_comments_deployment_id ON deployment_comments(deployment_id);

-- Tertial boards for teams
CREATE TABLE IF NOT EXISTS tertial_boards (
  id SERIAL PRIMARY KEY,
  team_name VARCHAR(255) NOT NULL,
  year INTEGER NOT NULL,
  tertial INTEGER NOT NULL CHECK (tertial IN (1, 2, 3)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_name, year, tertial)
);

-- Goals within tertial boards
CREATE TABLE IF NOT EXISTS tertial_goals (
  id SERIAL PRIMARY KEY,
  board_id INTEGER REFERENCES tertial_boards(id) ON DELETE CASCADE,
  goal_title VARCHAR(512) NOT NULL,
  goal_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tertial_goals_board_id ON tertial_goals(board_id);

-- Many-to-many relationship between deployments and goals
CREATE TABLE IF NOT EXISTS deployment_goals (
  deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES tertial_goals(id) ON DELETE CASCADE,
  PRIMARY KEY (deployment_id, goal_id)
);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_repositories_updated_at BEFORE UPDATE ON repositories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
