#!/usr/bin/env node

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function deploy() {
  console.log('🚀 Habs Meet Deployment\n');

  const environment = await question('Select environment (dev/prod): ');
  
  if (environment !== 'dev' && environment !== 'prod') {
    console.log('❌ Invalid environment. Use "dev" or "prod"');
    process.exit(1);
  }

  const project = environment === 'dev' ? 'habs-meet-dev' : 'habs-meet-prod';
  
  console.log(`\n📋 Deploying to: ${project}`);
  
  const confirm = await question('Continue? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ Deployment cancelled');
    process.exit(0);
  }

  try {
    console.log('\n🔨 Building web application...');
    const buildCommand = environment === 'prod' 
      ? 'pnpm --filter web build:prod'
      : 'pnpm --filter web build:dev';
    console.log(`Building for ${environment.toUpperCase()} environment...`);
    execSync(buildCommand, { stdio: 'inherit', cwd: process.cwd() });

    console.log('\n☁️ Deploying to Firebase...');
    execSync(`firebase use ${project}`, { stdio: 'inherit' });
    execSync('firebase deploy --only hosting,functions', { stdio: 'inherit' });

    console.log('\n✅ Deployment completed successfully!');
    console.log(`🌐 Your app is now live at: https://${project}.web.app`);
    
  } catch (error) {
    console.log('\n❌ Deployment failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

deploy();







