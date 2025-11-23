/**
 * Simple script to configure CORS using Firebase Admin SDK
 * This uses the same approach as Firebase Functions
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Try to find service account key
const possiblePaths = [
  path.join(__dirname, '../apps/functions/serviceAccountKey-dev.json'),
  path.join(__dirname, '../serviceAccountKey-dev.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
];

let serviceAccountPath = null;
for (const p of possiblePaths) {
  if (p && fs.existsSync(p)) {
    serviceAccountPath = p;
    break;
  }
}

if (!serviceAccountPath) {
  console.error('❌ Service account key not found!');
  console.error('\n📋 Please download service account key:');
  console.error('   https://console.firebase.google.com/project/habs-meet-dev/settings/serviceaccounts/adminsdk');
  console.error('\n   Save it as one of these locations:');
  possiblePaths.forEach(p => {
    if (p) console.error(`   - ${p}`);
  });
  console.error('\n   OR set GOOGLE_APPLICATION_CREDENTIALS environment variable');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'habs-meet-dev.firebasestorage.app',
});

const bucket = admin.storage().bucket('habs-meet-dev.firebasestorage.app');

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

async function setCors() {
  try {
    console.log('🚀 Configuring CORS for dev Firebase Storage...\n');
    console.log(`📦 Bucket: habs-meet-dev.firebasestorage.app`);
    console.log('🌐 Allowed origins:');
    corsConfig[0].origin.forEach(origin => console.log(`   - ${origin}`));
    console.log('');

    await bucket.setCorsConfiguration(corsConfig);

    console.log('✅ CORS configuration updated successfully!');
    console.log('\n📋 The production app can now access default media from dev storage.');
    console.log('⏳ Wait 1-2 minutes for changes to propagate, then test the production app.');
  } catch (error) {
    console.error('❌ Error setting CORS:', error.message);
    if (error.message.includes('Permission denied') || error.message.includes('403')) {
      console.error('\n⚠️  Permission denied. Make sure:');
      console.error('   1. Service account has "Storage Admin" role');
      console.error('   2. You have access to the habs-meet-dev project');
      console.error('\n   Check: https://console.cloud.google.com/iam-admin/iam?project=habs-meet-dev');
    }
    process.exit(1);
  }
}

setCors();

