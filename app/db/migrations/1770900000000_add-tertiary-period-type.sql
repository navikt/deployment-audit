-- Update CHECK constraint on period_type to include 'tertiary'

-- audit_reports
ALTER TABLE audit_reports DROP CONSTRAINT IF EXISTS audit_reports_period_type_check;
ALTER TABLE audit_reports ADD CONSTRAINT audit_reports_period_type_check
  CHECK (period_type IN ('yearly', 'tertiary', 'quarterly', 'monthly'));

-- report_jobs
ALTER TABLE report_jobs DROP CONSTRAINT IF EXISTS report_jobs_period_type_check;
ALTER TABLE report_jobs ADD CONSTRAINT report_jobs_period_type_check
  CHECK (period_type IN ('yearly', 'tertiary', 'quarterly', 'monthly'));
