-- Boards (goal/commitment boards per period)
CREATE TABLE IF NOT EXISTS boards (
  id SERIAL PRIMARY KEY,
  dev_team_id INTEGER NOT NULL REFERENCES dev_teams(id),
  title TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('tertiary', 'quarterly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (dev_team_id, period_type, period_start)
);

-- Board objectives (goals)
CREATE TABLE IF NOT EXISTS board_objectives (
  id SERIAL PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Board key results
CREATE TABLE IF NOT EXISTS board_key_results (
  id SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES board_objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- External references (Jira, Slack, etc.)
CREATE TABLE IF NOT EXISTS external_references (
  id SERIAL PRIMARY KEY,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('jira', 'slack', 'confluence', 'github_issue', 'other')),
  url TEXT NOT NULL,
  title TEXT,
  objective_id INTEGER REFERENCES board_objectives(id) ON DELETE CASCADE,
  key_result_id INTEGER REFERENCES board_key_results(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (objective_id IS NOT NULL AND key_result_id IS NULL) OR
    (objective_id IS NULL AND key_result_id IS NOT NULL)
  )
);
