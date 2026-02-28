-- Migration: Add verification_diffs table for pre-computed verification differences
-- This stores the result of comparing stored four_eyes_status with V2 verification output.
-- Computed in batch by the reverify_app sync job; read by the verification-diff page.

CREATE TABLE IF NOT EXISTS verification_diffs (
  id SERIAL PRIMARY KEY,
  monitored_app_id INTEGER NOT NULL REFERENCES monitored_applications(id) ON DELETE CASCADE,
  deployment_id INTEGER NOT NULL UNIQUE REFERENCES deployments(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  old_has_four_eyes BOOLEAN,
  new_has_four_eyes BOOLEAN NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verification_diffs_app ON verification_diffs(monitored_app_id);
