-- Migration: Add dev_teams and dev_team_nais_teams tables
-- Dev teams are organizational teams within a section, independent of Nais teams.
-- Used for goal/commitment boards and SDLC governance.

CREATE TABLE IF NOT EXISTS dev_teams (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES sections(id),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_teams_section_id ON dev_teams(section_id);

-- Links dev teams to Nais teams (many-to-many, but typically one dev team per Nais team)
CREATE TABLE IF NOT EXISTS dev_team_nais_teams (
  dev_team_id INTEGER NOT NULL REFERENCES dev_teams(id) ON DELETE CASCADE,
  nais_team_slug TEXT NOT NULL,
  PRIMARY KEY (dev_team_id, nais_team_slug)
);

CREATE INDEX IF NOT EXISTS idx_dev_team_nais_teams_slug ON dev_team_nais_teams(nais_team_slug);
