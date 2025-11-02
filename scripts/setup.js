#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Habs Meet...\n');

// Check if pnpm is installed
try {
  execSync('pnpm --version', { stdio: 'ignore' });
  console.log('✅ pnpm is installed');
} catch (error) {
  console.log('❌ pnpm is not installed. Please install it first:');
  console.log('   npm install -g pnpm');
  process.exit(1);
}

// Check if Firebase CLI is installed
try {
  execSync('firebase --version', { stdio: 'ignore' });
  console.log('✅ Firebase CLI is installed');
} catch (error) {
  console.log('❌ Firebase CLI is not installed. Please install it first:');
  console.log('   npm install -g firebase-tools');
  process.exit(1);
}

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('pnpm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed');
} catch (error) {
  console.log('❌ Failed to install dependencies');
  process.exit(1);
}

// Create .env.local template
const envTemplate = `VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_APP_ID=your_app_id
VITE_API_BASE=/api
VITE_LIVEKIT_WS_URL=wss://your-subdomain.livekit.cloud
VITE_SHOW_BRAND_PAGE=true`;

const envPath = path.join(__dirname, '..', 'apps', 'web', '.env.local');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envTemplate);
  console.log('✅ Created .env.local template');
} else {
  console.log('ℹ️  .env.local already exists');
}

// Create fonts directory
const fontsDir = path.join(__dirname, '..', 'apps', 'web', 'public', 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
  console.log('✅ Created fonts directory');
}

console.log('\n🎉 Setup completed successfully!');
console.log('\n📝 Next steps:');
console.log('1. Create Firebase projects: habs-meet-dev and habs-meet-prod');
console.log('2. Configure Firebase Functions with your LiveKit credentials');
console.log('3. Update apps/web/.env.local with your Firebase config');
console.log('4. Place Habs Futurist font in apps/web/public/fonts/');
console.log('5. Run: pnpm dev');
console.log('\n📖 See README.md for detailed setup instructions');







