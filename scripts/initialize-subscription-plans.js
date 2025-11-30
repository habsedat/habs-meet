/**
 * Initialize Subscription Plans in Firestore
 * 
 * This script initializes the default subscription plan configurations
 * in Firestore. Run this after deploying the subscription system.
 * 
 * Usage:
 *   node scripts/initialize-subscription-plans.js
 * 
 * Note: Requires Firebase Admin SDK to be initialized.
 * You may need to set GOOGLE_APPLICATION_CREDENTIALS environment variable.
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
// Option 1: Use application default credentials (recommended for scripts)
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

// Default subscription plan configurations
const DEFAULT_PLANS = {
  free: {
    tierKey: 'free',
    displayName: 'Free',
    tagline: 'Perfect for personal calls, testing, and short meetings.',
    displayPrice: '€0',
    sortOrder: 0,
    isRecommended: false,
    limits: {
      maxMeetingDurationMinutes: 20,
      maxParticipantsPerMeeting: 6,
      maxMeetingsPerMonth: 20,
      recordingEnabled: false,
      maxRecordingMinutesPerMonth: 0,
      maxStorageBytes: 100 * 1024 * 1024, // 100 MB
      backgroundEffects: {
        blur: true,
        defaultImages: 'basic',
        userUploads: false,
        videoBackgrounds: false,
      },
      chatFeatures: {
        publicChat: true,
        privateChat: false,
        fileSharing: false,
      },
      scheduling: {
        instant: true,
        schedule: false,
        recurring: false,
      },
    },
  },
  pro: {
    tierKey: 'pro',
    displayName: 'Pro',
    tagline: 'Best for professionals, creators, educators, and small teams.',
    displayPrice: '€9.99',
    currency: 'EUR',
    sortOrder: 1,
    isRecommended: true,
    limits: {
      maxMeetingDurationMinutes: 120, // 2 hours
      maxParticipantsPerMeeting: 25,
      maxMeetingsPerMonth: 100,
      recordingEnabled: true,
      maxRecordingMinutesPerMonth: 120, // 2 hours
      maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
      backgroundEffects: {
        blur: true,
        defaultImages: 'standard',
        userUploads: 'limited',
        videoBackgrounds: false,
      },
      chatFeatures: {
        publicChat: true,
        privateChat: true,
        fileSharing: true,
        maxFileSizeMB: 50,
      },
      scheduling: {
        instant: true,
        schedule: true,
        recurring: 'basic',
      },
    },
  },
  business: {
    tierKey: 'business',
    displayName: 'Business',
    tagline: 'Ideal for organizations, online classes, and daily meeting workflows.',
    displayPrice: '€19.99',
    currency: 'EUR',
    sortOrder: 2,
    isRecommended: false,
    limits: {
      maxMeetingDurationMinutes: 480, // 8 hours
      maxParticipantsPerMeeting: 100,
      maxMeetingsPerMonth: 500,
      recordingEnabled: true,
      maxRecordingMinutesPerMonth: 1200, // 20 hours
      maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      backgroundEffects: {
        blur: true,
        defaultImages: 'full',
        userUploads: 'extended',
        videoBackgrounds: true,
      },
      chatFeatures: {
        publicChat: true,
        privateChat: true,
        fileSharing: true,
        maxFileSizeMB: 100,
      },
      scheduling: {
        instant: true,
        schedule: true,
        recurring: 'advanced',
      },
    },
  },
  enterprise: {
    tierKey: 'enterprise',
    displayName: 'Enterprise',
    tagline: 'For schools, governments, teams, and professional organizations.',
    displayPrice: '€49.99',
    currency: 'EUR',
    sortOrder: 3,
    isRecommended: false,
    limits: {
      maxMeetingDurationMinutes: Infinity,
      maxParticipantsPerMeeting: Infinity,
      maxMeetingsPerMonth: Infinity,
      recordingEnabled: true,
      maxRecordingMinutesPerMonth: Infinity,
      maxStorageBytes: Infinity,
      backgroundEffects: {
        blur: true,
        defaultImages: 'full',
        userUploads: 'unlimited',
        videoBackgrounds: true,
      },
      chatFeatures: {
        publicChat: true,
        privateChat: true,
        fileSharing: true,
        maxFileSizeMB: Infinity,
      },
      scheduling: {
        instant: true,
        schedule: true,
        recurring: 'advanced',
      },
    },
  },
};

// Default pricing page texts
const DEFAULT_PRICING_TEXTS = {
  hero: {
    headline: 'Choose the Right Plan for Your Meetings',
    subheadline: 'Upgrade to longer meetings, higher participant limits, HD recording, and premium background effects.',
    keyPoints: [
      'Only hosts need a paid plan — participants always join for free.',
      'Start free. Upgrade anytime. Cancel anytime.',
    ],
  },
  footerNote: 'Prices exclude VAT depending on your country. Subscription renews based on your personal billing date (not monthly calendar dates). Discounts available for schools, NGOs, and governments (contact us).',
  faq: {
    questions: [
      {
        question: 'Do participants need to pay?',
        answer: 'No. Only the meeting host needs a paid plan. All guests join for free.',
      },
      {
        question: 'Can I upgrade or downgrade anytime?',
        answer: 'Yes. Changes happen immediately, and your new billing period begins on the day you upgrade.',
      },
      {
        question: 'Is there a long-term contract?',
        answer: 'No contracts. Habs Meet is fully flexible — cancel or change plans anytime.',
      },
      {
        question: 'What happens if I hit my recording limit?',
        answer: 'You can upgrade your plan or wait for your billing cycle to reset. Enterprise users never hit limits.',
      },
      {
        question: 'Is my payment secure?',
        answer: 'Payments are handled by Stripe, the world\'s most trusted secure payment platform.',
      },
    ],
  },
  tiers: {
    free: {
      tierDescription: 'Perfect for personal calls, testing, and short meetings.',
      tierBulletPoints: [
        '✔ 20 min duration',
        '✔ Up to 6 participants',
        '✘ Recording disabled',
        '✔ 100 MB cloud storage',
        '✘ Video backgrounds',
        '✔ Background blur',
        '✔ Public chat',
        '✘ Scheduling',
      ],
      buttonText: 'Current Plan',
    },
    pro: {
      tierDescription: 'Best for professionals, creators, educators, and small teams.',
      tierBulletPoints: [
        '✔ 2 hr meeting duration',
        '✔ Up to 25 participants',
        '✔ HD recording',
        '✔ 2 hr/month recording quota',
        '✔ 5 GB storage',
        '✔ Video backgrounds (basic)',
        '✔ Private chat + file sharing',
        '✔ Scheduling + recurring meetings',
        '✔ HD screen share with audio',
      ],
      psychologicalTriggers: ['🔥 Most Popular', '⭐ Best for 1–10 people'],
      buttonText: 'Upgrade',
    },
    business: {
      tierDescription: 'Ideal for organizations, online classes, and daily meeting workflows.',
      tierBulletPoints: [
        '✔ 8 hr meeting duration',
        '✔ Up to 100 participants',
        '✔ 20 hr/month recording quota',
        '✔ 10 GB storage',
        '✔ Video backgrounds (full library)',
        '✔ Priority audio/video quality',
        '✔ Advanced scheduling',
        '✔ Private chat & file sharing',
      ],
      psychologicalTriggers: ['🚀 For Teams & Schools'],
      buttonText: 'Upgrade',
    },
    enterprise: {
      tierDescription: 'For schools, governments, teams, and professional organizations.',
      tierBulletPoints: [
        '✔ Unlimited meeting duration',
        '✔ Unlimited participants',
        '✔ Unlimited recording quota',
        '✔ Unlimited storage',
        '✔ All premium backgrounds & custom effects',
        '✔ Dedicated onboarding & support',
        '✔ Team management + organization controls',
        '✔ Custom integrations',
      ],
      psychologicalTriggers: ['🏆 For Big Organizations'],
      buttonText: 'Contact Sales',
    },
  },
};

async function initializeSubscriptionPlans() {
  try {
    console.log('🌱 Initializing subscription plans in Firestore...\n');

    const collectionRef = db.collection('subscriptionPlans');

    // Initialize each plan
    for (const [tierKey, plan] of Object.entries(DEFAULT_PLANS)) {
      const planRef = collectionRef.doc(tierKey);
      const existing = await planRef.get();

      if (existing.exists) {
        console.log(`⚠️  Plan "${tierKey}" already exists. Skipping...`);
        continue;
      }

      await planRef.set({
        ...plan,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ Initialized plan: ${plan.displayName} (${tierKey})`);
    }

    // Initialize pricing texts
    const pricingTextsRef = collectionRef.doc('pricingTexts');
    const pricingTextsExists = await pricingTextsRef.get();

    if (!pricingTextsExists.exists) {
      await pricingTextsRef.set({
        ...DEFAULT_PRICING_TEXTS,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('✅ Initialized pricing page texts');
    } else {
      console.log('⚠️  Pricing texts already exist. Skipping...');
    }

    console.log('\n🎉 Subscription plans initialization completed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Review plans in Admin Dashboard → Subscription Settings');
    console.log('   2. Customize pricing, descriptions, and limits as needed');
    console.log('   3. Configure Stripe products and prices');
    console.log('   4. Set up Stripe webhook endpoint');

  } catch (error) {
    console.error('❌ Error initializing subscription plans:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeSubscriptionPlans()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { initializeSubscriptionPlans, DEFAULT_PLANS, DEFAULT_PRICING_TEXTS };






