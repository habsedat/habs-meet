/**
 * Script to assign admin role to a user
 * 
 * Usage:
 *   node scripts/assign-admin.js <user-email> [project]
 * 
 * Examples:
 *   node scripts/assign-admin.js admin@example.com habs-meet-dev
 *   node scripts/assign-admin.js admin@example.com habs-meet-prod
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
// You need to set up a service account key first
// Download it from: Firebase Console > Project Settings > Service Accounts > Generate New Private Key
// Then set: export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"

async function assignAdmin(userEmail, projectId) {
  try {
    // Initialize Firebase Admin if not already initialized
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: projectId
      });
    }

    console.log(`\n🔍 Looking up user: ${userEmail} in project: ${projectId}...`);

    // Get user by email
    const user = await admin.auth().getUserByEmail(userEmail);
    console.log(`✅ Found user: ${user.uid} (${user.displayName || 'No name'})`);

    // Update Firestore user document
    const db = admin.firestore();
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const currentRole = userDoc.data()?.role || 'user';
      console.log(`📋 Current role: ${currentRole}`);

      await userRef.set({
        role: 'admin'
      }, { merge: true });

      console.log(`✅ Successfully assigned admin role to ${userEmail}`);
      console.log(`\n🎉 User ${userEmail} is now an admin!`);
      console.log(`\n📝 Next steps:`);
      console.log(`   1. Refresh the admin page in your browser`);
      console.log(`   2. You should now have access to admin features`);
    } else {
      // Create user document if it doesn't exist
      console.log(`⚠️  User document doesn't exist in Firestore, creating it...`);
      await userRef.set({
        displayName: user.displayName || '',
        email: user.email || userEmail,
        phoneNumber: '',
        dateOfBirth: '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        isEmailVerified: user.emailVerified || false,
        isPhoneVerified: false,
        role: 'admin'
      });
      console.log(`✅ Created user document and assigned admin role`);
    }

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.error(`\n💡 User with email ${userEmail} not found. Make sure:`);
      console.error(`   1. The user has signed up at least once`);
      console.error(`   2. You're using the correct project (${projectId})`);
      console.error(`   3. The email address is correct`);
    } else if (error.code === 'app/no-app') {
      console.error(`\n💡 Firebase Admin not initialized. Please:`);
      console.error(`   1. Download service account key from Firebase Console`);
      console.error(`   2. Set GOOGLE_APPLICATION_CREDENTIALS environment variable`);
      console.error(`   3. Or modify this script to use admin.credential.cert()`);
    }
    
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
📋 Assign Admin Role Script

Usage:
  node scripts/assign-admin.js <user-email> [project-id]

Examples:
  node scripts/assign-admin.js admin@example.com habs-meet-dev
  node scripts/assign-admin.js admin@example.com habs-meet-prod

Options:
  user-email    Email address of the user to make admin (required)
  project-id   Firebase project ID (optional, defaults to habs-meet-dev)

Setup:
  1. Download service account key from Firebase Console
  2. Set environment variable: export GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json"
  3. Or modify this script to use admin.credential.cert() with the key file
  `);
  process.exit(1);
}

const userEmail = args[0];
const projectId = args[1] || 'habs-meet-dev';

assignAdmin(userEmail, projectId);






















