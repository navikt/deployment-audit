-- Drop has_four_eyes columns from verification_diffs table.
-- These are no longer written; approval is derived from four_eyes_status.

ALTER TABLE verification_diffs DROP COLUMN IF EXISTS old_has_four_eyes;
ALTER TABLE verification_diffs DROP COLUMN IF EXISTS new_has_four_eyes;
