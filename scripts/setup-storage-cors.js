/**
 * Script to configure CORS on dev Firebase Storage to allow prod domain access
 * 
 * This allows the production app to access default media stored in dev storage
 */

const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

// Check if service account key exists
const devKeyPath = path.join(__dirname, '../apps/functions/serviceAccountKey-dev.json');

if (!fs.existsSync(devKeyPath)) {
  console.error('❌ Service account key not found!');
  console.error('\n📋 To use this script, you need to:');
  console.error('1. Download service account key from Firebase Console:');
  console.error('   https://console.firebase.google.com/project/habs-meet-dev/settings/serviceaccounts/adminsdk');
  console.error(`2. Save it as: ${devKeyPath}`);
  process.exit(1);
}

const serviceAccount = require(devKeyPath);

// Initialize Google Cloud Storage client
const storage = new Storage({
  projectId: 'habs-meet-dev',
  credentials: serviceAccount,
});

const bucketName = 'habs-meet-dev.firebasestorage.app';
const corsConfig = [
  {
    origin: [
      'https://habs-meet-prod.web.app',
      'https://habs-meet-prod.firebaseapp.com',
      'https://habs-meet-dev.web.app',
      'https://habs-meet-dev.firebaseapp.com',
    ],
    method: ['GET', 'HEAD'],
    responseHeader: ['Content-Type', 'Content-Length', 'Content-Range'],
    maxAgeSeconds: 3600,
  },
];

async function setCorsConfiguration() {
  try {
    console.log('🚀 Configuring CORS for dev Firebase Storage...\n');
    console.log(`📦 Bucket: ${bucketName}`);
    console.log('🌐 Allowed origins:');
    corsConfig[0].origin.forEach(origin => console.log(`   - ${origin}`));
    console.log('');

    const bucket = storage.bucket(bucketName);
    await bucket.setCorsConfiguration(corsConfig);

    console.log('✅ CORS configuration updated successfully!');
    console.log('\n📋 The production app can now access default media from dev storage.');
  } catch (error) {
    console.error('❌ Error setting CORS configuration:', error.message);
    if (error.message.includes('Permission denied')) {
      console.error('\n⚠️  Make sure the service account has Storage Admin permissions.');
    }
    process.exit(1);
  }
}

setCorsConfiguration();

