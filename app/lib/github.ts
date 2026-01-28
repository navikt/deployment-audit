import { Octokit } from '@octokit/rest';

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

export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
}

export async function searchRepositories(org: string, query: string): Promise<GitHubRepo[]> {
  const client = getGitHubClient();

  const searchQuery = `${query} org:${org}`;

  const response = await client.search.repos({
    q: searchQuery,
    sort: 'updated',
    per_page: 10,
  });

  return response.data.items as GitHubRepo[];
}

export interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  html_url: string;
}

export async function getCommit(owner: string, repo: string, sha: string): Promise<GitHubCommit> {
  const client = getGitHubClient();

  const response = await client.repos.getCommit({
    owner,
    repo,
    ref: sha,
  });

  return response.data as GitHubCommit;
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
