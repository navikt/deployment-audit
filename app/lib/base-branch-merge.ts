/**
 * Base Branch Merge Detection
 *
 * Handles the case where the base branch (main/master) is merged INTO a feature branch
 * after the PR is approved. In this case:
 * 1. The PR contains commits from main that weren't part of the original review
 * 2. These commits appear as "unverified" because they're from other PRs
 * 3. But if the PR is still approved, we should consider the deployment approved
 *
 * The rationale: commits from main are already approved via their own PRs.
 * The merge into the feature branch is just updating the branch before merge.
 */

/**
 * Detects if a commit message indicates a merge of base branch into feature branch.
 * Common patterns:
 * - "Merge branch 'main' into feature/..."
 * - "Merge branch 'master' into feature/..."
 * - "Merge remote-tracking branch 'origin/main' into feature/..."
 */
export function isBaseBranchMergeCommit(message: string, baseBranch = 'main'): boolean {
  const patterns = [
    new RegExp(`^Merge branch '${baseBranch}' into`, 'i'),
    new RegExp(`^Merge branch '${baseBranch === 'main' ? 'master' : 'main'}' into`, 'i'),
    new RegExp(`^Merge remote-tracking branch 'origin/${baseBranch}' into`, 'i'),
  ]

  return patterns.some((pattern) => pattern.test(message))
}

interface CommitInfo {
  sha: string
  message: string
  author?: string
  date?: string
}

interface BaseMergeCheckResult {
  canExplain: boolean
  reason?: string
  mergeCommitSha?: string
}

/**
 * Checks if unverified commits can be explained by a base branch merge.
 *
 * Logic:
 * 1. If there's a merge commit bringing base into feature branch
 * 2. All other unverified commits have dates BEFORE that merge
 * 3. Those commits likely came from the base branch
 *
 * Returns true if all unverified commits can be attributed to base branch merge.
 */
export function canExplainUnverifiedByBaseMerge(
  unverifiedCommits: CommitInfo[],
  prCommits: CommitInfo[],
  baseBranch = 'main',
): BaseMergeCheckResult {
  if (unverifiedCommits.length === 0) {
    return { canExplain: true, reason: 'no_unverified_commits' }
  }

  // Find the merge commit that brought base into feature branch
  const mergeCommit = prCommits.find((c) => isBaseBranchMergeCommit(c.message, baseBranch))

  if (!mergeCommit) {
    return { canExplain: false, reason: 'no_base_merge_commit_found' }
  }

  // If merge commit has no date, we can't do date-based verification
  if (!mergeCommit.date) {
    // Fall back to just checking that all unverified are either the merge commit
    // or appear before it in the commit list
    const mergeIndex = prCommits.findIndex((c) => c.sha === mergeCommit.sha)

    for (const commit of unverifiedCommits) {
      if (commit.sha === mergeCommit.sha) continue

      const commitIndex = prCommits.findIndex((c) => c.sha === commit.sha)
      // If commit appears after merge in the list, it's suspicious
      if (commitIndex > mergeIndex) {
        return {
          canExplain: false,
          reason: `commit_${commit.sha.substring(0, 7)}_after_merge_in_list`,
        }
      }
    }

    return {
      canExplain: true,
      reason: 'all_unverified_from_base_branch',
      mergeCommitSha: mergeCommit.sha,
    }
  }

  const mergeDate = new Date(mergeCommit.date)

  // Check if all unverified commits can be explained
  for (const commit of unverifiedCommits) {
    // If it's the merge commit itself, that's fine
    if (commit.sha === mergeCommit.sha) {
      continue
    }

    // If the commit has no date, check if it's in the PR commits before merge
    if (!commit.date) {
      const mergeIndex = prCommits.findIndex((c) => c.sha === mergeCommit.sha)
      const commitIndex = prCommits.findIndex((c) => c.sha === commit.sha)

      if (commitIndex === -1 || commitIndex > mergeIndex) {
        return {
          canExplain: false,
          reason: `commit_${commit.sha.substring(0, 7)}_position_unknown`,
        }
      }
      continue
    }

    // If the commit's date is BEFORE the merge, it came from base branch
    const commitDate = new Date(commit.date)
    if (commitDate >= mergeDate) {
      // This commit was made AFTER the merge - can't be from base branch
      return {
        canExplain: false,
        reason: `commit_${commit.sha.substring(0, 7)}_after_merge`,
      }
    }
  }

  return {
    canExplain: true,
    reason: 'all_unverified_from_base_branch',
    mergeCommitSha: mergeCommit.sha,
  }
}

interface ReviewInfo {
  state: string
}

interface ApprovalResult {
  approved: boolean
  reason: string
}

/**
 * Determines if a deployment should be approved despite unverified commits,
 * when those commits came from base branch merge.
 */
export function shouldApproveWithBaseMerge(
  reviews: ReviewInfo[],
  unverifiedCommits: CommitInfo[],
  prCommits: CommitInfo[],
  baseBranch = 'main',
): ApprovalResult {
  // First, check if PR has any approvals
  const approvals = reviews.filter((r) => r.state === 'APPROVED')
  if (approvals.length === 0) {
    return { approved: false, reason: 'no_approval' }
  }

  // Check if unverified commits can be explained by base merge
  const baseMergeCheck = canExplainUnverifiedByBaseMerge(unverifiedCommits, prCommits, baseBranch)

  if (!baseMergeCheck.canExplain) {
    return { approved: false, reason: baseMergeCheck.reason || 'unexplained_commits' }
  }

  // PR is approved and all unverified commits are from base branch merge
  return {
    approved: true,
    reason: `approved_with_base_merge:${baseMergeCheck.mergeCommitSha}`,
  }
}
