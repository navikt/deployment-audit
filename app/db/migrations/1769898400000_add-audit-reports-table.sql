-- Audit reports table for storing generated compliance reports
CREATE TABLE IF NOT EXISTS audit_reports (
  id SERIAL PRIMARY KEY,
  
  -- Report identification
  report_id TEXT UNIQUE NOT NULL, -- Format: AUDIT-{year}-{app_name}-{env}-{short_hash}
  
  -- Scope
  monitored_app_id INTEGER REFERENCES monitored_applications(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL,
  team_slug TEXT NOT NULL,
  environment_name TEXT NOT NULL, -- Should be prod-fss or prod-gcp
  repository TEXT NOT NULL, -- owner/repo format
  
  -- Period (calendar year)
  year INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Summary statistics
  total_deployments INTEGER NOT NULL,
  pr_approved_count INTEGER NOT NULL,
  manually_approved_count INTEGER NOT NULL,
  unique_deployers INTEGER NOT NULL,
  unique_reviewers INTEGER NOT NULL,
  
  -- Report content (JSON for flexibility)
  report_data JSONB NOT NULL,
  -- Structure: {
  --   deployments: [{ id, date, commit_sha, method, deployer, approver, pr_number?, slack_link? }],
  --   manual_approvals: [{ deployment_id, reason, approved_by, approved_at, slack_link, comment }],
  --   contributors: [{ github_username, display_name, nav_ident, deployment_count }],
  --   reviewers: [{ github_username, display_name, review_count }]
  -- }
  
  -- Integrity
  content_hash TEXT NOT NULL, -- SHA256 of report_data for verification
  
  -- PDF storage (optional - can regenerate from report_data)
  pdf_data BYTEA,
  
  -- Metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT, -- Username who generated the report
  
  UNIQUE(monitored_app_id, year)
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_app ON audit_reports(monitored_app_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_year ON audit_reports(year);
CREATE INDEX IF NOT EXISTS idx_audit_reports_report_id ON audit_reports(report_id);
