-- Migration: Populate missing github_pr_url from github_pr_data
-- Created: 2026-04-26
-- 
-- Context:
-- The verification system was storing github_pr_number but not github_pr_url
-- when verifying deployments. This caused the main deployment detail page
-- to not show the PR link, even though the debug-verify page (which reads
-- from github_pr_data) showed it correctly.
--
-- Fix:
-- 1. Update store-data.server.ts to also set github_pr_url during verification
-- 2. Backfill existing records where github_pr_url is NULL but github_pr_data has the URL

-- Backfill missing github_pr_url from github_pr_data->>'url'
UPDATE deployments
SET github_pr_url = github_pr_data->>'url'
WHERE github_pr_url IS NULL
  AND github_pr_data IS NOT NULL
  AND github_pr_data->>'url' IS NOT NULL;
