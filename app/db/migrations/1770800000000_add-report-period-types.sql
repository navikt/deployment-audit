-- Add period_type and period_label to audit_reports for monthly/quarterly reports
ALTER TABLE audit_reports
  ADD COLUMN period_type TEXT NOT NULL DEFAULT 'yearly' CHECK (period_type IN ('yearly', 'quarterly', 'monthly')),
  ADD COLUMN period_label TEXT;

-- Update existing reports with period_label
UPDATE audit_reports SET period_label = year::TEXT WHERE period_label IS NULL;

-- Make period_label NOT NULL after backfill
ALTER TABLE audit_reports ALTER COLUMN period_label SET NOT NULL;

-- Drop old unique constraint and add new one supporting multiple period types
ALTER TABLE audit_reports DROP CONSTRAINT IF EXISTS audit_reports_monitored_app_id_year_key;
ALTER TABLE audit_reports ADD CONSTRAINT audit_reports_app_period_unique UNIQUE (monitored_app_id, period_type, period_start);

-- Add period_type and period_label to report_jobs
ALTER TABLE report_jobs
  ADD COLUMN period_type TEXT NOT NULL DEFAULT 'yearly' CHECK (period_type IN ('yearly', 'quarterly', 'monthly')),
  ADD COLUMN period_label TEXT,
  ADD COLUMN period_start DATE,
  ADD COLUMN period_end DATE;
