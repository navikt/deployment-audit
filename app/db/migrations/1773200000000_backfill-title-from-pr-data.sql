-- Backfill deployments.title from github_pr_data and unverified_commits
-- for deployments where title was never populated during verification

-- Step 1: Fill from PR title in github_pr_data JSONB
UPDATE deployments
SET title = github_pr_data->>'title'
WHERE title IS NULL
  AND github_pr_data->>'title' IS NOT NULL;

-- Step 2: Fill from first unverified commit message
UPDATE deployments
SET title = unverified_commits->0->>'message'
WHERE title IS NULL
  AND unverified_commits->0->>'message' IS NOT NULL;
