-- Add sync job logs table for detailed per-deployment logging
CREATE TABLE sync_job_logs (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',  -- 'info' | 'warn' | 'error'
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX sync_job_logs_job_id ON sync_job_logs (job_id, created_at);

-- Update the unique constraint to also allow 'cancelled' as a non-blocking status
-- The existing constraint only blocks on status = 'running', so 'cancelled' is already fine.
-- No schema change needed for the cancelled status - it's just a new value in the text column.
