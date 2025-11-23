/**
 * Script to sync defaultMedia collection from dev Firestore to prod Firestore
 * 
 * This ensures default media is accessible from both projects
 * Run this script after uploading default media in dev project
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Check if service account keys exist
const devKeyPath = path.join(__dirname, '../apps/functions/serviceAccountKey-dev.json');
const prodKeyPath = path.join(__dirname, '../apps/functions/serviceAccountKey-prod.json');

if (!fs.existsSync(devKeyPath) || !fs.existsSync(prodKeyPath)) {
  console.error('❌ Service account keys not found!');
  console.error('\n📋 To use this script, you need:');
  console.error('1. Download service account keys from Firebase Console:');
  console.error('   - Dev: https://console.firebase.google.com/project/habs-meet-dev/settings/serviceaccounts/adminsdk');
  console.error('   - Prod: https://console.firebase.google.com/project/habs-meet-prod/settings/serviceaccounts/adminsdk');
  console.error(`2. Save them as:`);
  console.error(`   - ${devKeyPath}`);
  console.error(`   - ${prodKeyPath}`);
  process.exit(1);
}

const devServiceAccount = require(devKeyPath);
const prodServiceAccount = require(prodKeyPath);

// Initialize Firebase Admin SDKs for both projects
const devApp = admin.initializeApp({
  credential: admin.credential.cert(devServiceAccount),
  projectId: 'habs-meet-dev'
}, 'dev');

const prodApp = admin.initializeApp({
  credential: admin.credential.cert(prodServiceAccount),
  projectId: 'habs-meet-prod'
}, 'prod');

const devDb = admin.firestore(devApp);
const prodDb = admin.firestore(prodApp);

async function syncDefaultMedia() {
  console.log('🚀 Syncing defaultMedia from dev to prod Firestore...\n');
  
  try {
    // Get all defaultMedia documents from dev
    const devSnapshot = await devDb.collection('defaultMedia').get();
    
    if (devSnapshot.empty) {
      console.log('⚠️  No defaultMedia documents found in dev Firestore');
      return;
    }
    
    console.log(`✅ Found ${devSnapshot.size} defaultMedia documents in dev\n`);
    
    let synced = 0;
    let skipped = 0;
    let errors = 0;
    
    // Sync each document to prod
    for (const doc of devSnapshot.docs) {
      const mediaData = doc.data();
      const mediaId = doc.id;
      
      try {
        // Check if document already exists in prod
        const prodDoc = await prodDb.collection('defaultMedia').doc(mediaId).get();
        
        if (prodDoc.exists) {
          // Update existing document
          await prodDb.collection('defaultMedia').doc(mediaId).set(mediaData, { merge: true });
          console.log(`   ✅ Updated: ${mediaData.name || mediaId}`);
        } else {
          // Create new document
          await prodDb.collection('defaultMedia').doc(mediaId).set(mediaData);
          console.log(`   ✅ Created: ${mediaData.name || mediaId}`);
        }
        
        synced++;
      } catch (error) {
        console.error(`   ❌ Error syncing ${mediaData.name || mediaId}: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n📊 Sync Summary:');
    console.log(`   ✅ Synced: ${synced}`);
    console.log(`   ⚠️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`\n🎉 Sync complete!`);
    console.log('\n📋 Default media is now accessible from both dev and prod projects.');
    console.log('   Note: Storage files remain in dev storage (with CORS configured).');
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    throw error;
  } finally {
    // Clean up Firebase Admin instances
    await devApp.delete();
    await prodApp.delete();
  }
}

// Run the sync
if (require.main === module) {
  syncDefaultMedia()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { syncDefaultMedia };

