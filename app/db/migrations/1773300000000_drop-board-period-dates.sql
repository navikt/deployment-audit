-- Remove stored period dates from boards table.
-- Period dates are now computed at runtime from period_type + period_label.
-- This fixes a timezone bug where .toISOString() converted local dates to UTC,
-- causing boards created in CEST to have off-by-one end dates.

-- Drop the old unique constraint (uses period_start)
ALTER TABLE boards DROP CONSTRAINT IF EXISTS boards_dev_team_id_period_type_period_start_key;

-- Add new unique constraint using period_label instead
ALTER TABLE boards ADD CONSTRAINT boards_dev_team_id_period_type_period_label_key
  UNIQUE (dev_team_id, period_type, period_label);

-- Drop the date columns
ALTER TABLE boards DROP COLUMN period_start;
ALTER TABLE boards DROP COLUMN period_end;
