-- Add options column to sync_jobs for per-job configuration (e.g. debug logging)
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS options JSONB;
