import 'dotenv/config';
import { createRepository } from '../app/db/repositories.server';

async function testCreateRepo() {
  try {
    console.log('Testing repository creation...');
    const repo = await createRepository({
      github_repo_name: 'test-repo',
      nais_team_slug: 'test-team',
      nais_environment_name: 'dev-gcp',
    });
    console.log('Success! Created repo:', repo);
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

testCreateRepo();
