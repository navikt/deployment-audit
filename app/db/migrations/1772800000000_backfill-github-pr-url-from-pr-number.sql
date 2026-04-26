-- Migration: Backfill github_pr_url from github_pr_number + repo info
-- Created: 2026-04-26
--
-- Context:
-- The verification system historically stored github_pr_number but not
-- github_pr_url. The deployment detail page requires BOTH fields to render
-- the PR link, so older deployments lack the link.
--
-- A previous attempt (orphaned migration 1772700000000_populate-missing-github-pr-urls,
-- file removed in commit a47cdc9) tried to read the URL from
-- github_pr_data->>'url', but buildGithubPrDataFromSnapshots() never stores
-- a 'url' field, so that migration was a no-op.
--
-- This migration constructs the URL deterministically from
-- detected_github_owner / detected_github_repo_name / github_pr_number, which
-- is exactly what new verifications now persist (see store-data.server.ts,
-- commit 70f061a).
--
-- Safe to re-run: idempotent because the WHERE clause excludes rows that
-- already have github_pr_url set.

UPDATE deployments
SET github_pr_url = 'https://github.com/'
  || detected_github_owner || '/'
  || detected_github_repo_name || '/pull/'
  || github_pr_number::text
WHERE github_pr_url IS NULL
  AND github_pr_number IS NOT NULL
  AND detected_github_owner IS NOT NULL
  AND detected_github_repo_name IS NOT NULL;
