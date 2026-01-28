#!/usr/bin/env node

/**
 * Test script for Nais API client
 * 
 * Usage:
 *   npm run test:nais-discovery -- <team-slug>
 *   npm run test:nais-fetch -- <team> <env> <app>
 * 
 * Example:
 *   npm run test:nais-discovery -- pensjon-q2
 *   npm run test:nais-fetch -- pensjon-q2 dev-fss pensjon-pen-q2
 */

import { discoverTeamApplications, fetchApplicationDeployments, getApplicationInfo } from '../app/lib/nais';

const command = process.argv[2];
const args = process.argv.slice(3);

async function testDiscovery(teamSlug: string) {
  console.log('\n🔍 Testing Application Discovery\n');
  console.log(`Team: ${teamSlug}`);
  console.log('─'.repeat(80));
  
  try {
    const result = await discoverTeamApplications(teamSlug);
    
    console.log(`\n✅ Found ${result.environments.size} environments:\n`);
    
    for (const [envName, apps] of result.environments.entries()) {
      console.log(`📁 ${envName} (${apps.length} applications)`);
      for (const app of apps) {
        console.log(`   └─ ${app}`);
      }
      console.log();
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function testFetch(teamSlug: string, envName: string, appName: string) {
  console.log('\n📦 Testing Deployment Fetch\n');
  console.log(`Team: ${teamSlug}`);
  console.log(`Environment: ${envName}`);
  console.log(`Application: ${appName}`);
  console.log('─'.repeat(80));
  
  try {
    // First get app info
    console.log('\n1️⃣ Fetching application info...\n');
    const appInfo = await getApplicationInfo(teamSlug, envName, appName);
    
    if (!appInfo) {
      console.error('❌ Application not found or no access');
      process.exit(1);
    }
    
    console.log('Application info:');
    console.log(`  Name: ${appInfo.name}`);
    console.log(`  Team: ${appInfo.team}`);
    console.log(`  Environment: ${appInfo.environment}`);
    console.log(`  Repository: ${appInfo.repository || 'N/A'}`);
    
    // Then fetch deployments
    console.log('\n2️⃣ Fetching deployments...\n');
    const deployments = await fetchApplicationDeployments(teamSlug, envName, appName, 10);
    
    console.log(`\n✅ Found ${deployments.length} deployments\n`);
    
    if (deployments.length > 0) {
      console.log('Latest 5 deployments:');
      console.log('─'.repeat(80));
      
      for (const dep of deployments.slice(0, 5)) {
        console.log(`\n📌 ${dep.id}`);
        console.log(`   Created: ${new Date(dep.createdAt).toLocaleString('nb-NO')}`);
        console.log(`   Deployer: ${dep.deployerUsername}`);
        console.log(`   Commit: ${dep.commitSha.substring(0, 8)}`);
        console.log(`   Repository: ${dep.repository}`);
        console.log(`   Resources: ${dep.resources.nodes.length} (${dep.resources.nodes.map(r => r.kind).join(', ')})`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function main() {
  if (command === 'discovery') {
    if (args.length < 1) {
      console.error('Usage: npm run test:nais-discovery -- <team-slug>');
      process.exit(1);
    }
    await testDiscovery(args[0]);
    
  } else if (command === 'fetch') {
    if (args.length < 3) {
      console.error('Usage: npm run test:nais-fetch -- <team> <env> <app>');
      process.exit(1);
    }
    await testFetch(args[0], args[1], args[2]);
    
  } else {
    console.error('Unknown command. Use "discovery" or "fetch"');
    process.exit(1);
  }
  
  console.log('\n✨ Test complete!\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
