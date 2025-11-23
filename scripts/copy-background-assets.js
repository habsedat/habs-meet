/**
 * Script to copy background assets from dev Firebase project to prod Firebase project
 * 
 * This script:
 * 1. Reads all defaultMedia documents from dev Firestore
 * 2. Downloads images/videos from dev storage
 * 3. Uploads them to prod storage
 * 4. Updates prod Firestore with new URLs
 */

const admin = require('firebase-admin');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// Check if service account keys exist
const devKeyPath = path.join(__dirname, '../apps/functions/serviceAccountKey-dev.json');
const prodKeyPath = path.join(__dirname, '../apps/functions/serviceAccountKey-prod.json');

if (!fs.existsSync(devKeyPath) || !fs.existsSync(prodKeyPath)) {
  console.error('❌ Service account keys not found!');
  console.error('\n📋 To use this script, you need to:');
  console.error('1. Download service account keys from Firebase Console:');
  console.error('   - Dev: https://console.firebase.google.com/project/habs-meet-dev/settings/serviceaccounts/adminsdk');
  console.error('   - Prod: https://console.firebase.google.com/project/habs-meet-prod/settings/serviceaccounts/adminsdk');
  console.error('2. Save them as:');
  console.error(`   - ${devKeyPath}`);
  console.error(`   - ${prodKeyPath}`);
  console.error('\nAlternatively, you can set GOOGLE_APPLICATION_CREDENTIALS environment variables.');
  process.exit(1);
}

// Initialize Firebase Admin SDKs for both projects
const devServiceAccount = require(devKeyPath);
const prodServiceAccount = require(prodKeyPath);

// Initialize dev Firebase Admin
const devApp = admin.initializeApp({
  credential: admin.credential.cert(devServiceAccount),
  storageBucket: 'habs-meet-dev.firebasestorage.app'
}, 'dev');

// Initialize prod Firebase Admin
const prodApp = admin.initializeApp({
  credential: admin.credential.cert(prodServiceAccount),
  storageBucket: 'habs-meet-prod.firebasestorage.app'
}, 'prod');

const devDb = admin.firestore(devApp);
const prodDb = admin.firestore(prodApp);
const devStorage = admin.storage(devApp);
const prodStorage = admin.storage(prodApp);

/**
 * Download file from URL to buffer
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract storage path from Firebase Storage URL
 */
function extractStoragePath(url) {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/o\/(.+)$/);
    if (!pathMatch) {
      throw new Error('Invalid Firebase Storage URL format');
    }
    return decodeURIComponent(pathMatch[1].replace(/%2F/g, '/'));
  } catch (error) {
    throw new Error(`Failed to extract storage path: ${error.message}`);
  }
}

/**
 * Copy a single media file from dev to prod
 */
async function copyMediaFile(mediaDoc) {
  const mediaData = mediaDoc.data();
  const mediaId = mediaDoc.id;
  
  console.log(`\n📦 Processing: ${mediaData.name} (${mediaData.type})`);
  
  try {
    // Extract storage path from URL
    const storagePath = extractStoragePath(mediaData.url);
    console.log(`   Storage path: ${storagePath}`);
    
    // Download file from dev storage
    console.log(`   ⬇️  Downloading from dev storage...`);
    const devFile = devStorage.bucket().file(storagePath);
    const [exists] = await devFile.exists();
    
    if (!exists) {
      console.log(`   ⚠️  File not found in dev storage, skipping...`);
      return null;
    }
    
    const [buffer] = await devFile.download();
    console.log(`   ✅ Downloaded ${(buffer.length / 1024).toFixed(2)} KB`);
    
    // Upload to prod storage
    console.log(`   ⬆️  Uploading to prod storage...`);
    const prodFile = prodStorage.bucket().file(storagePath);
    await prodFile.save(buffer, {
      metadata: {
        contentType: mediaData.mimeType,
        cacheControl: 'public, max-age=31536000',
      },
    });
    
    // Make file publicly readable
    await prodFile.makePublic();
    
    // Get new download URL
    const newUrl = `https://firebasestorage.googleapis.com/v0/b/${prodStorage.bucket().name}/o/${encodeURIComponent(storagePath).replace(/%2F/g, '/')}?alt=media`;
    console.log(`   ✅ Uploaded successfully`);
    console.log(`   🔗 New URL: ${newUrl}`);
    
    return {
      id: mediaId,
      newUrl,
      storagePath,
    };
  } catch (error) {
    console.error(`   ❌ Error copying file: ${error.message}`);
    throw error;
  }
}

/**
 * Update Firestore document in prod with new URL
 */
async function updateFirestoreDoc(mediaId, newUrl, mediaData) {
  try {
    const prodDocRef = prodDb.collection('defaultMedia').doc(mediaId);
    const prodDoc = await prodDocRef.get();
    
    const updateData = {
      url: newUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (prodDoc.exists) {
      // Update existing document
      await prodDocRef.update(updateData);
      console.log(`   ✅ Updated Firestore document`);
    } else {
      // Create new document with all original data
      await prodDocRef.set({
        ...mediaData,
        ...updateData,
      });
      console.log(`   ✅ Created new Firestore document`);
    }
  } catch (error) {
    console.error(`   ❌ Error updating Firestore: ${error.message}`);
    throw error;
  }
}

/**
 * Main function to copy all background assets
 */
async function copyAllBackgroundAssets() {
  console.log('🚀 Starting background assets migration...\n');
  console.log('📋 Reading defaultMedia from dev Firestore...');
  
  try {
    // Get all defaultMedia documents from dev
    const devSnapshot = await devDb.collection('defaultMedia').get();
    
    if (devSnapshot.empty) {
      console.log('⚠️  No defaultMedia documents found in dev Firestore');
      return;
    }
    
    console.log(`✅ Found ${devSnapshot.size} media documents\n`);
    
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
    };
    
    // Process each document
    for (const doc of devSnapshot.docs) {
      const mediaData = doc.data();
      
      try {
        // Copy file from dev to prod storage
        const copyResult = await copyMediaFile(doc);
        
        if (!copyResult) {
          results.skipped++;
          continue;
        }
        
        // Update Firestore document
        await updateFirestoreDoc(copyResult.id, copyResult.newUrl, mediaData);
        
        results.success++;
      } catch (error) {
        console.error(`❌ Failed to process ${mediaData.name}: ${error.message}`);
        results.failed++;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successfully copied: ${results.success}`);
    console.log(`   ⚠️  Skipped: ${results.skipped}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`\n🎉 Migration complete!`);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    // Clean up Firebase Admin instances
    await devApp.delete();
    await prodApp.delete();
  }
}

// Run the migration
if (require.main === module) {
  copyAllBackgroundAssets()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { copyAllBackgroundAssets };

