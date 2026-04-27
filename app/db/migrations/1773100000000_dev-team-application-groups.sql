-- Dev teams can own application groups (just as they can own individual apps
-- via dev_team_applications or Nais teams via dev_team_nais_teams).
-- When a dev team owns a group, all member applications are included in the
-- team's scope for dashboards, stats, and issue lists.

CREATE TABLE dev_team_application_groups (
  dev_team_id   INTEGER NOT NULL REFERENCES dev_teams(id),
  application_group_id INTEGER NOT NULL REFERENCES application_groups(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  deleted_by    TEXT,
  PRIMARY KEY (dev_team_id, application_group_id)
);

-- Partial index for fast "active links" lookups (matches soft-delete pattern
-- used by dev_team_applications and dev_team_nais_teams).
CREATE INDEX idx_dev_team_application_groups_active
  ON dev_team_application_groups (dev_team_id, application_group_id)
  WHERE deleted_at IS NULL;
