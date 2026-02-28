-- Migration: Add sections and section_teams tables for multi-section support
-- Sections group Nais teams under an organizational unit with Entra ID access control

CREATE TABLE IF NOT EXISTS sections (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  entra_group_admin TEXT,
  entra_group_user TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS section_teams (
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  team_slug TEXT NOT NULL,
  PRIMARY KEY (section_id, team_slug)
);

CREATE INDEX IF NOT EXISTS idx_section_teams_team_slug ON section_teams(team_slug);
