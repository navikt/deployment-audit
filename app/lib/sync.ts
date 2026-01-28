import { createDeployment, getDeploymentByNaisId } from '../db/deployments';
import type { Repository } from '../db/repositories';
import { getPullRequestForCommit, verifyPullRequestFourEyes } from './github';
import { fetchDeploymentsInRange } from './nais';

export interface SyncResult {
  success: boolean;
  deploymentsProcessed: number;
  deploymentsCreated: number;
  deploymentsUpdated: number;
  errors: string[];
}

/**
 * Synchronize deployments for a repository from Nais GraphQL API
 * and verify four-eyes status using GitHub API
 */
export async function syncDeploymentsForRepository(
  repo: Repository,
  startDate: Date,
  endDate: Date
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    deploymentsProcessed: 0,
    deploymentsCreated: 0,
    deploymentsUpdated: 0,
    errors: [],
  };

  try {
    // Fetch deployments from Nais for the specified time range
    const naisDeployments = await fetchDeploymentsInRange(repo.nais_team_slug, startDate, endDate);

    // Filter to only deployments for this specific repository and environment
    const relevantDeployments = naisDeployments.filter(
      (deployment) =>
        deployment.repository === `${repo.github_owner}/${repo.github_repo_name}` &&
        deployment.environmentName === repo.nais_environment_name
    );

    result.deploymentsProcessed = relevantDeployments.length;

    // Process each deployment
    for (const naisDeployment of relevantDeployments) {
      try {
        // Check if deployment already exists
        const existingDeployment = await getDeploymentByNaisId(naisDeployment.id);

        // Get PR info from GitHub
        let hasFourEyes = false;
        let fourEyesStatus = 'unknown';
        let prNumber: number | undefined;
        let prUrl: string | undefined;

        try {
          const pr = await getPullRequestForCommit(
            repo.github_owner,
            repo.github_repo_name,
            naisDeployment.commitSha
          );

          if (pr?.merged_at) {
            // This commit was merged via PR
            prNumber = pr.number;
            prUrl = pr.html_url;

            // Verify four-eyes on the PR
            const verification = await verifyPullRequestFourEyes(
              repo.github_owner,
              repo.github_repo_name,
              pr.number
            );

            hasFourEyes = verification.hasFourEyes;
            fourEyesStatus = verification.hasFourEyes ? 'approved_pr' : 'pr_not_approved';
          } else {
            // Direct push to main/branch
            fourEyesStatus = 'direct_push';
            hasFourEyes = false;
          }
        } catch (error) {
          console.error(`Error checking GitHub for commit ${naisDeployment.commitSha}:`, error);
          fourEyesStatus = 'error';
          result.errors.push(`Failed to check GitHub for commit ${naisDeployment.commitSha}`);
        }

        // Create or update deployment in database
        await createDeployment({
          repo_id: repo.id,
          nais_deployment_id: naisDeployment.id,
          created_at: new Date(naisDeployment.createdAt),
          team_slug: naisDeployment.teamSlug,
          environment_name: naisDeployment.environmentName,
          repository: naisDeployment.repository,
          deployer_username: naisDeployment.deployerUsername,
          commit_sha: naisDeployment.commitSha,
          trigger_url: naisDeployment.triggerUrl,
          has_four_eyes: hasFourEyes,
          four_eyes_status: fourEyesStatus,
          github_pr_number: prNumber,
          github_pr_url: prUrl,
        });

        if (existingDeployment) {
          result.deploymentsUpdated++;
        } else {
          result.deploymentsCreated++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to process deployment ${naisDeployment.id}: ${errorMsg}`);
      }
    }

    result.success = result.errors.length === 0;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.success = false;
    result.errors.push(`Failed to sync deployments: ${errorMsg}`);
  }

  return result;
}
