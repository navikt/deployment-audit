-- User dev team preference: each user selects one active dev team
CREATE TABLE user_dev_team_preference (
  nav_ident TEXT PRIMARY KEY,
  dev_team_id INTEGER NOT NULL REFERENCES dev_teams(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
