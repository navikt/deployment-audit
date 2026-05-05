-- Add optional comment field to deployment_goal_links.
-- Non-destructive: existing rows get NULL comment (no data loss).
ALTER TABLE deployment_goal_links
  ADD COLUMN IF NOT EXISTS comment TEXT;
