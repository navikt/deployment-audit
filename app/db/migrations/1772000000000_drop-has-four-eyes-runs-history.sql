-- Drop has_four_eyes from verification_runs and deployment_status_history.
-- Migration 1771990000000 only covered verification_diffs before these
-- were added, and since it already ran, the additions were never applied.

ALTER TABLE verification_runs DROP COLUMN IF EXISTS has_four_eyes;

ALTER TABLE deployment_status_history DROP COLUMN IF EXISTS from_has_four_eyes;
ALTER TABLE deployment_status_history DROP COLUMN IF EXISTS to_has_four_eyes;
