-- Seed: Create "Pensjon og uføre" section and link existing teams
-- Uses the existing Entra ID group IDs that were previously hardcoded in auth.server.ts

INSERT INTO sections (slug, name, entra_group_admin, entra_group_user)
VALUES ('pensjon', 'Pensjon og uføre', '1e97cbc6-0687-4d23-aebd-c611035279c1', '415d3817-c83d-44c9-a52b-5116757f8fa8')
ON CONFLICT (slug) DO NOTHING;

-- Link all currently monitored teams to the Pensjon section
INSERT INTO section_teams (section_id, team_slug)
SELECT s.id, DISTINCT_TEAMS.team_slug
FROM sections s
CROSS JOIN (
  SELECT DISTINCT team_slug FROM monitored_applications WHERE is_active = true
) AS DISTINCT_TEAMS
WHERE s.slug = 'pensjon'
ON CONFLICT DO NOTHING;
