-- Add resources column to deployments table
ALTER TABLE deployments
ADD COLUMN IF NOT EXISTS resources JSONB;
