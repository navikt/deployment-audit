-- Add registered_by column to deployment_comments for tracking who registered legacy info
ALTER TABLE deployment_comments ADD COLUMN IF NOT EXISTS registered_by VARCHAR(255);
