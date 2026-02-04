/**
 * Types for the verification system
 *
 * This module defines all types used for:
 * - Fetching data from GitHub
 * - Storing data in database snapshots
 * - Stateless verification logic
 * - Verification results
 */

// =============================================================================
// Schema Version
// =============================================================================

/**
 * Current schema version for GitHub data snapshots.
 * Increment this when the data structure changes and re-fetching is needed.
 */
export const CURRENT_SCHEMA_VERSION = 1

// =============================================================================
// Data Types for Granular Storage
// =============================================================================

/**
 * Types of PR data that can be fetched/stored separately
 */
export type PrDataType = 'metadata' | 'reviews' | 'commits' | 'comments' | 'checks' | 'files'

/**
 * Types of commit data that can be fetched/stored separately
 */
export type CommitDataType = 'metadata' | 'status' | 'checks' | 'prs'

// =============================================================================
// Snapshot Types (Database Storage)
// =============================================================================

/**
 * Base interface for all snapshots
 */
export interface SnapshotBase {
  id: number
  schemaVersion: number
  fetchedAt: Date
  source: 'github' | 'cached'
  githubAvailable: boolean
}

/**
 * PR data snapshot from database
 */
export interface PrSnapshot extends SnapshotBase {
  owner: string
  repo: string
  prNumber: number
  dataType: PrDataType
  data: unknown
}

/**
 * Commit data snapshot from database
 */
export interface CommitSnapshot extends SnapshotBase {
  owner: string
  repo: string
  sha: string
  dataType: CommitDataType
  data: unknown
}

// =============================================================================
// PR Data Types (what's stored in snapshots)
// =============================================================================

/**
 * PR metadata (stored in 'metadata' snapshot)
 */
export interface PrMetadata {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  merged: boolean
  draft: boolean
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  baseBranch: string
  baseSha: string
  headBranch: string
  headSha: string
  mergeCommitSha: string | null
  author: {
    username: string
    avatarUrl?: string
  }
  mergedBy: {
    username: string
    avatarUrl?: string
  } | null
  labels: string[]
  commitsCount: number
  changedFiles: number
  additions: number
  deletions: number
}

/**
 * PR review (stored in 'reviews' snapshot as array)
 */
export interface PrReview {
  id: number
  username: string
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'
  submittedAt: string
  body: string | null
}

/**
 * PR commit (stored in 'commits' snapshot as array)
 */
export interface PrCommit {
  sha: string
  message: string
  authorUsername: string
  authorDate: string
  committerDate: string
  isMergeCommit: boolean
  parentShas: string[]
}

/**
 * PR comment (stored in 'comments' snapshot as array)
 */
export interface PrComment {
  id: number
  username: string
  body: string
  createdAt: string
  updatedAt: string
}

/**
 * PR check/status (stored in 'checks' snapshot)
 */
export interface PrChecks {
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null
  checkRuns: Array<{
    id: number
    name: string
    status: 'queued' | 'in_progress' | 'completed'
    conclusion: string | null
    startedAt: string | null
    completedAt: string | null
  }>
  statuses: Array<{
    context: string
    state: 'pending' | 'success' | 'failure' | 'error'
    description: string | null
    targetUrl: string | null
  }>
}

// =============================================================================
// Commit Data Types
// =============================================================================

/**
 * Commit metadata (stored in 'metadata' snapshot)
 */
export interface CommitMetadata {
  sha: string
  message: string
  authorUsername: string
  authorDate: string
  committerUsername: string
  committerDate: string
  parentShas: string[]
  isMergeCommit: boolean
  htmlUrl: string
}

/**
 * Commit status (stored in 'status' snapshot)
 */
export interface CommitStatus {
  state: 'pending' | 'success' | 'failure' | 'error'
  totalCount: number
  statuses: Array<{
    context: string
    state: 'pending' | 'success' | 'failure' | 'error'
    description: string | null
    targetUrl: string | null
  }>
}

/**
 * Associated PRs for a commit (stored in 'prs' snapshot)
 */
export interface CommitPrs {
  prs: Array<{
    number: number
    title: string
    state: 'open' | 'closed' | 'merged'
    baseRef: string
    merged: boolean
    mergedAt: string | null
  }>
}

// =============================================================================
// Verification Input (what the stateless verifier receives)
// =============================================================================

/**
 * Complete input for verifying a deployment
 * This contains ALL data needed - no database/API calls during verification
 */
export interface VerificationInput {
  // Deployment info
  deploymentId: number
  commitSha: string
  repository: string
  environmentName: string
  baseBranch: string

  // App settings
  auditStartYear: number | null
  implicitApprovalSettings: ImplicitApprovalSettings

  // Previous deployment (for determining commit range)
  previousDeployment: {
    id: number
    commitSha: string
    createdAt: string
  } | null

  // The deployed commit's PR (if any)
  deployedPr: {
    number: number
    url: string
    metadata: PrMetadata
    reviews: PrReview[]
    commits: PrCommit[]
  } | null

  // All commits between previous and current deployment
  commitsBetween: Array<{
    sha: string
    message: string
    authorUsername: string
    authorDate: string
    isMergeCommit: boolean
    parentShas: string[]
    htmlUrl: string
    // PR info for this commit (if found)
    pr: {
      number: number
      title: string
      url: string
      reviews: PrReview[]
      commits: PrCommit[]
      baseBranch: string
      rebaseMatched?: boolean
    } | null
  }>

  // Metadata about data freshness
  dataFreshness: {
    deployedPrFetchedAt: Date | null
    commitsFetchedAt: Date | null
    schemaVersion: number
  }
}

/**
 * Settings for implicit approval (single-author PRs, etc.)
 */
export interface ImplicitApprovalSettings {
  mode: 'off' | 'dependabot_only' | 'all'
  requireMergerDifferentFromAuthor?: boolean // Legacy field, not used in new logic
}

// =============================================================================
// Verification Result (what the stateless verifier returns)
// =============================================================================

/**
 * Result from verifying a deployment
 */
export interface VerificationResult {
  // Overall result
  hasFourEyes: boolean
  status: VerificationStatus

  // Details about the deployed PR
  deployedPr: {
    number: number
    url: string
    title: string
    author: string
  } | null

  // Unverified commits (if any)
  unverifiedCommits: UnverifiedCommit[]

  // Approval details
  approvalDetails: {
    method: 'pr_review' | 'implicit' | 'base_merge' | 'no_changes' | 'pending_baseline' | null
    approvers: string[]
    reason: string
  }

  // Metadata
  verifiedAt: Date
  schemaVersion: number
}

/**
 * Possible verification statuses
 */
export type VerificationStatus =
  | 'approved' // All commits verified via PR review
  | 'implicitly_approved' // Approved via implicit approval rules
  | 'unverified_commits' // Some commits not verified
  | 'pending_baseline' // First deployment, no previous to compare
  | 'no_changes' // Same commit as previous deployment
  | 'manually_approved' // Manually approved by user
  | 'legacy' // Legacy deployment (before audit start)
  | 'error' // Error during verification

/**
 * An unverified commit
 */
export interface UnverifiedCommit {
  sha: string
  message: string
  author: string
  date: string
  htmlUrl: string
  prNumber: number | null
  reason: UnverifiedReason
}

/**
 * Reasons why a commit is unverified
 */
export type UnverifiedReason =
  | 'no_pr' // Commit was pushed directly to main
  | 'pr_not_approved' // PR exists but has no approval
  | 'approval_before_last_commit' // Approval was before the last commit
  | 'no_approved_reviews' // PR has reviews but none approved
  | 'author_is_approver' // Self-approval (if not allowed)

// =============================================================================
// Verification Run (stored in database)
// =============================================================================

/**
 * A verification run record from the database
 */
export interface VerificationRun {
  id: number
  deploymentId: number
  schemaVersion: number
  runAt: Date
  prSnapshotIds: number[]
  commitSnapshotIds: number[]
  result: VerificationResult
  status: VerificationStatus
  hasFourEyes: boolean
}
