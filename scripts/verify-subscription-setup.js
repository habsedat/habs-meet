/**
 * Verify Subscription System Setup
 * 
 * This script verifies that the subscription system is properly configured
 * for the current Firebase project.
 * 
 * Usage:
 *   firebase use <project>
 *   node scripts/verify-subscription-setup.js
 */

const admin = require('firebase-admin');
const { execSync } = require('child_process');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    console.log('\n💡 Tip: Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
    console.log('   Or use: firebase use <project> before running this script');
    process.exit(1);
  }
}

const db = admin.firestore();

async function verifySubscriptionSetup() {
  console.log('🔍 Verifying Subscription System Setup...\n');

  const issues = [];
  const warnings = [];
  const successes = [];

  // 1. Check Firebase Functions config
  console.log('1️⃣  Checking Firebase Functions Configuration...');
  try {
    const configOutput = execSync('firebase functions:config:get', { encoding: 'utf-8' });
    const config = JSON.parse(configOutput);
    
    if (!config.stripe) {
      issues.push('❌ Stripe configuration not found in Firebase Functions config');
    } else {
      if (!config.stripe.secret_key) {
        issues.push('❌ stripe.secret_key not configured');
      } else {
        const isTest = config.stripe.secret_key.startsWith('sk_test_');
        const isLive = config.stripe.secret_key.startsWith('sk_live_');
        
        if (isTest) {
          successes.push('✅ Stripe Test Mode secret key configured');
        } else if (isLive) {
          successes.push('✅ Stripe Live Mode secret key configured');
        } else {
          warnings.push('⚠️  Stripe secret key format unrecognized');
        }
      }
      
      if (!config.stripe.webhook_secret) {
        issues.push('❌ stripe.webhook_secret not configured');
      } else {
        successes.push('✅ Stripe webhook secret configured');
      }
    }
  } catch (error) {
    issues.push(`❌ Error checking Firebase Functions config: ${error.message}`);
  }

  // 2. Check Firestore subscription plans
  console.log('\n2️⃣  Checking Firestore Subscription Plans...');
  try {
    const collectionRef = db.collection('subscriptionPlans');
    const tiers = ['free', 'pro', 'business', 'enterprise'];
    
    for (const tier of tiers) {
      const planDoc = await collectionRef.doc(tier).get();
      if (planDoc.exists) {
        successes.push(`✅ Plan "${tier}" exists in Firestore`);
      } else {
        issues.push(`❌ Plan "${tier}" missing in Firestore`);
      }
    }
    
    // Check pricing texts
    const pricingTextsDoc = await collectionRef.doc('pricingTexts').get();
    if (pricingTextsDoc.exists) {
      successes.push('✅ Pricing page texts exist in Firestore');
    } else {
      warnings.push('⚠️  Pricing page texts missing in Firestore (will use defaults)');
    }
  } catch (error) {
    issues.push(`❌ Error checking Firestore plans: ${error.message}`);
  }

  // 3. Check billing.ts price mapping
  console.log('\n3️⃣  Checking Price ID Mapping...');
  try {
    const fs = require('fs');
    const path = require('path');
    const billingPath = path.join(__dirname, '..', 'apps', 'functions', 'src', 'billing.ts');
    const billingCode = fs.readFileSync(billingPath, 'utf-8');
    
    if (billingCode.includes('YOUR_TEST_PRO_PRICE_ID') || billingCode.includes('YOUR_LIVE_PRO_PRICE_ID')) {
      warnings.push('⚠️  Price IDs in billing.ts need to be updated with actual Stripe price IDs');
    } else {
      successes.push('✅ Price ID mapping appears to be configured');
    }
  } catch (error) {
    warnings.push(`⚠️  Could not verify price ID mapping: ${error.message}`);
  }

  // 4. Get current project
  console.log('\n4️⃣  Checking Current Firebase Project...');
  try {
    const projectOutput = execSync('firebase use', { encoding: 'utf-8' });
    const projectMatch = projectOutput.match(/Using (.+)/);
    if (projectMatch) {
      const project = projectMatch[1];
      successes.push(`✅ Current project: ${project}`);
      
      if (project === 'habs-meet-dev') {
        console.log('   ℹ️  This is the DEVELOPMENT project (should use Stripe Test Mode)');
      } else if (project === 'habs-meet-prod') {
        console.log('   ℹ️  This is the PRODUCTION project (should use Stripe Live Mode)');
      }
    }
  } catch (error) {
    warnings.push(`⚠️  Could not determine current project: ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  
  if (successes.length > 0) {
    console.log('\n✅ Successes:');
    successes.forEach(msg => console.log(`   ${msg}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(msg => console.log(`   ${msg}`));
  }
  
  if (issues.length > 0) {
    console.log('\n❌ Issues (must be fixed):');
    issues.forEach(msg => console.log(`   ${msg}`));
    console.log('\n🔧 Next Steps:');
    console.log('   1. Fix all issues listed above');
    console.log('   2. Run this script again to verify');
    console.log('   3. See ACTIVATE_SUBSCRIPTION_SYSTEM.md for detailed setup instructions');
    process.exit(1);
  } else {
    console.log('\n🎉 All checks passed! Subscription system appears to be properly configured.');
    console.log('\n📝 Next Steps:');
    console.log('   1. Test the subscription flow end-to-end');
    console.log('   2. Verify webhook events are received');
    console.log('   3. Test upgrade/downgrade flows');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  verifySubscriptionSetup()
    .catch((error) => {
      console.error('❌ Error during verification:', error);
      process.exit(1);
    });
}

module.exports = { verifySubscriptionSetup };




