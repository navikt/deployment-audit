import { Octokit } from '@octokit/rest';
import type { GitHubPRData } from '~/db/deployments.server';

let octokit: Octokit | null = null;

export function getGitHubClient(): Octokit {
  if (!octokit) {
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is not set');
    }

    octokit = new Octokit({
      auth: token,
    });
  }

  return octokit;
}

export interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  state: string;
}

export async function getPullRequestForCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<PullRequest | null> {
  const client = getGitHubClient();

  try {
    const response = await client.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: sha,
    });

    if (response.data.length === 0) {
      return null;
    }

    // Return the first (most relevant) PR
    const pr = response.data[0];
    return {
      number: pr.number,
      title: pr.title,
      html_url: pr.html_url,
      merged_at: pr.merged_at,
      state: pr.state,
    };
  } catch (error) {
    console.error('Error fetching PR for commit:', error);
    return null;
  }
}

export interface PullRequestReview {
  id: number;
  user: {
    login: string;
  } | null;
  state: string;
  submitted_at: string | null;
}

export async function getPullRequestReviews(
  owner: string,
  repo: string,
  pull_number: number
): Promise<PullRequestReview[]> {
  const client = getGitHubClient();

  const response = await client.pulls.listReviews({
    owner,
    repo,
    pull_number,
  });

  return response.data as PullRequestReview[];
}

export interface PullRequestCommit {
  sha: string;
  commit: {
    author: {
      date: string;
    };
  };
}

export async function getPullRequestCommits(
  owner: string,
  repo: string,
  pull_number: number
): Promise<PullRequestCommit[]> {
  const client = getGitHubClient();

  const response = await client.pulls.listCommits({
    owner,
    repo,
    pull_number,
    per_page: 100,
  });

  return response.data as PullRequestCommit[];
}

/**
 * Verifies if a PR has "four eyes" (two sets of eyes):
 * - At least one APPROVED review
 * - The approval came after the last commit in the PR
 */
export async function verifyPullRequestFourEyes(
  owner: string,
  repo: string,
  pull_number: number
): Promise<{ hasFourEyes: boolean; reason: string }> {
  try {
    const [reviews, commits] = await Promise.all([
      getPullRequestReviews(owner, repo, pull_number),
      getPullRequestCommits(owner, repo, pull_number),
    ]);

    if (commits.length === 0) {
      return { hasFourEyes: false, reason: 'No commits found in PR' };
    }

    // Get the timestamp of the last commit
    const lastCommit = commits[commits.length - 1];
    const lastCommitDate = new Date(lastCommit.commit.author.date);

    // Find approved reviews that came after the last commit
    const approvedReviewsAfterLastCommit = reviews.filter((review) => {
      if (review.state !== 'APPROVED' || !review.submitted_at) {
        return false;
      }
      const reviewDate = new Date(review.submitted_at);
      return reviewDate > lastCommitDate;
    });

    if (approvedReviewsAfterLastCommit.length > 0) {
      return {
        hasFourEyes: true,
        reason: `Approved by ${approvedReviewsAfterLastCommit[0].user?.login || 'unknown'} after last commit`,
      };
    }

    // Check if there are any approved reviews (even before last commit)
    const approvedReviews = reviews.filter((r) => r.state === 'APPROVED');
    if (approvedReviews.length === 0) {
      return { hasFourEyes: false, reason: 'No approved reviews found' };
    }

    return {
      hasFourEyes: false,
      reason: 'Approved review exists but came before the last commit',
    };
  } catch (error) {
    console.error('Error verifying PR four eyes:', error);
    return { hasFourEyes: false, reason: 'Error checking reviews' };
  }
}

/**
 * Get detailed PR information including metadata, reviewers, and checks
 */
export async function getDetailedPullRequestInfo(
  owner: string,
  repo: string,
  pull_number: number
): Promise<GitHubPRData | null> {
  const client = getGitHubClient();

  try {
    // Fetch PR details
    const prResponse = await client.pulls.get({
      owner,
      repo,
      pull_number,
    });

    const pr = prResponse.data;

    // Fetch reviews
    const reviewsResponse = await client.pulls.listReviews({
      owner,
      repo,
      pull_number,
    });

    // Group reviews by user (latest review per user)
    const reviewsByUser = new Map<
      string,
      { username: string; avatar_url: string; state: string; submitted_at: string }
    >();

    for (const review of reviewsResponse.data) {
      if (review.user && review.submitted_at) {
        const existing = reviewsByUser.get(review.user.login);
        // Keep the latest review from each user
        if (!existing || new Date(review.submitted_at) > new Date(existing.submitted_at)) {
          reviewsByUser.set(review.user.login, {
            username: review.user.login,
            avatar_url: review.user.avatar_url,
            state: review.state,
            submitted_at: review.submitted_at,
          });
        }
      }
    }

    // Fetch check runs details
    let checks_passed: boolean | null = null;
    const checks: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      started_at: string | null;
      completed_at: string | null;
      html_url: string | null;
    }> = [];

    try {
      const checksResponse = await client.checks.listForRef({
        owner,
        repo,
        ref: pr.head.sha,
      });

      if (checksResponse.data.total_count > 0) {
        // All checks must have conclusion 'success' or 'skipped'
        checks_passed = checksResponse.data.check_runs.every(
          (check) => check.conclusion === 'success' || check.conclusion === 'skipped'
        );

        // Store detailed check info
        for (const check of checksResponse.data.check_runs) {
          checks.push({
            name: check.name,
            status: check.status,
            conclusion: check.conclusion,
            started_at: check.started_at,
            completed_at: check.completed_at,
            html_url: check.html_url,
          });
        }
      }
    } catch (error) {
      console.warn('Could not fetch check runs:', error);
    }

    return {
      title: pr.title,
      body: pr.body,
      labels: pr.labels.map((label) => (typeof label === 'string' ? label : label.name || '')),
      created_at: pr.created_at,
      merged_at: pr.merged_at,
      base_branch: pr.base.ref,
      commits_count: pr.commits,
      changed_files: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      draft: pr.draft || false,
      creator: {
        username: pr.user?.login || 'unknown',
        avatar_url: pr.user?.avatar_url || '',
      },
      merger: pr.merged_by
        ? {
            username: pr.merged_by.login,
            avatar_url: pr.merged_by.avatar_url,
          }
        : null,
      reviewers: Array.from(reviewsByUser.values()),
      checks_passed,
      checks,
    };
  } catch (error) {
    console.error('Error fetching detailed PR info:', error);
    return null;
  }
}
