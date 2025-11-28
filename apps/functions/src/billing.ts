/**
 * Billing & Stripe Integration
 * 
 * Full Stripe integration for subscription management.
 * Prices are managed in Stripe, not hard-coded here.
 * Works with both dev and prod projects via Firebase Functions config.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import cors from 'cors';
import Stripe from 'stripe';

const corsHandler = cors({ origin: true });

// Initialize db lazily to avoid initialization order issues
function getDb() {
  return admin.firestore();
}

// Initialize Stripe lazily (works for both dev and prod via config)
function getStripe(): Stripe {
  const secretKey = functions.config().stripe?.secret_key;
  if (!secretKey) {
    throw new Error('Stripe secret key not configured. Set stripe.secret_key in Firebase Functions config.');
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover',
  });
}

// Helper to verify auth
const verifyAuth = async (req: any): Promise<admin.auth.DecodedIdToken> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing or invalid authorization header');
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid token');
  }
};

// Stripe plan mapping - environment-aware
// Detects Test Mode vs Live Mode based on secret key prefix
function getStripePlanMapping(): Record<string, 'free' | 'pro' | 'business' | 'enterprise'> {
  const secretKey = functions.config().stripe?.secret_key || '';
  
  // Try to get from config first (allows per-project customization)
  const configMapping = functions.config().stripe?.plan_mapping;
  if (configMapping) {
    try {
      return JSON.parse(configMapping);
    } catch (e) {
      console.warn('[Billing] Error parsing plan_mapping from config, using defaults');
    }
  }
  
  // Detect environment by secret key prefix and use appropriate mapping
  if (secretKey.startsWith('sk_test_')) {
    // Test Mode mapping (dev project)
    // TODO: Replace with your actual TEST price IDs
    return {
      'price_YOUR_TEST_PRO_PRICE_ID': 'pro',
      'price_YOUR_TEST_BUSINESS_PRICE_ID': 'business',
      'price_YOUR_TEST_ENTERPRISE_PRICE_ID': 'enterprise',
    };
  } else if (secretKey.startsWith('sk_live_')) {
    // Live Mode mapping (prod project)
    // TODO: Replace with your actual LIVE price IDs
    return {
      'price_YOUR_LIVE_PRO_PRICE_ID': 'pro',
      'price_YOUR_LIVE_BUSINESS_PRICE_ID': 'business',
      'price_YOUR_LIVE_ENTERPRISE_PRICE_ID': 'enterprise',
    };
  }
  
  // Fallback (should not happen if configured correctly)
  console.warn('[Billing] Could not determine Stripe environment, using empty mapping');
  return {};
}

/**
 * POST /api/billing/create-checkout-session
 * Create Stripe checkout session
 */
export const createCheckoutSession = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { priceId, successUrl, cancelUrl, userId, isAdminInitiated } = req.body;

      if (!priceId || !successUrl || !cancelUrl) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // If admin-initiated, verify admin and get target user's stripeCustomerId
      let targetCustomerId: string | undefined;
      let targetUserId: string | undefined;
      let targetUserEmail: string | undefined;

      if (isAdminInitiated && userId) {
        // Verify admin
        const adminUser = await verifyAuth(req);
        const adminDoc = await getDb().collection('users').doc(adminUser.uid).get();
        const adminData = adminDoc.data();
        if (!adminData || (adminData.role !== 'admin' && adminData.role !== 'superadmin')) {
          return res.status(403).json({ error: 'Only admins can initiate checkout for other users' });
        }

        // Get target user's stripeCustomerId
        const targetUserDoc = await getDb().collection('users').doc(userId).get();
        if (!targetUserDoc.exists) {
          return res.status(404).json({ error: 'Target user not found' });
        }
        const targetUserData = targetUserDoc.data();
        targetCustomerId = targetUserData?.stripeCustomerId;
        targetUserId = userId;
        targetUserEmail = targetUserData?.email;

        // Log admin-initiated checkout
        console.log(`[Billing] Admin ${adminUser.uid} initiated checkout for user ${userId}, tier: ${priceId}`);
      } else {
        // Regular user checkout - verify auth and use their own customer ID
        const user = await verifyAuth(req);
        const userDoc = await getDb().collection('users').doc(user.uid).get();
        const userData = userDoc.data();
        targetCustomerId = userData?.stripeCustomerId;
        targetUserId = user.uid;
        targetUserEmail = userData?.email || user.email;
      }

      // Initialize Stripe
      const stripe = getStripe();

      // Create or retrieve Stripe customer
      let customerId = targetCustomerId;
      if (!customerId && targetUserEmail) {
        const customer = await stripe.customers.create({
          email: targetUserEmail,
          metadata: { userId: targetUserId || '' },
        });
        customerId = customer.id;

        // Update user with customer ID
        if (targetUserId) {
          await getDb().collection('users').doc(targetUserId).update({
            stripeCustomerId: customerId,
          });
        }
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: targetUserId || '',
          isAdminInitiated: isAdminInitiated ? 'true' : 'false',
        },
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * POST /api/billing/webhook
 * Handle Stripe webhook events
 */
export const billingWebhook = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Verify webhook signature
      const stripe = getStripe();
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = functions.config().stripe?.webhook_secret;

      if (!webhookSecret) {
        console.error('[Billing] Webhook secret not configured');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error('[Billing] Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }

      // Handle subscription events
      switch (event.type) {
        case 'checkout.session.completed': {
          // Subscription created/updated
          const session = event.data.object as Stripe.Checkout.Session;
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
          const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

          if (!subscriptionId || !customerId) {
            console.error('[Billing] Missing customer or subscription ID in checkout.session.completed');
            break;
          }

          // Get subscription details from Stripe
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id;
          const planMapping = getStripePlanMapping();
          const tier = priceId ? (planMapping[priceId] || 'free') : 'free';

          // Find user by stripeCustomerId
          const usersSnapshot = await getDb().collection('users')
            .where('stripeCustomerId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            const userDoc = usersSnapshot.docs[0];
            const userId = userDoc.id;

            // Update user subscription with billing period from Stripe
            // Type assertion needed due to Stripe SDK typing
            const sub = subscription as any;
            const periodEnd = sub.current_period_end as number;
            const periodStart = sub.current_period_start as number;
            
            await userDoc.ref.update({
              subscriptionTier: tier,
              subscriptionStatus: 'active',
              subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(
                new Date(periodEnd * 1000)
              ),
              billingPeriodStartAt: admin.firestore.Timestamp.fromDate(
                new Date(periodStart * 1000)
              ),
              billingPeriodEndAt: admin.firestore.Timestamp.fromDate(
                new Date(periodEnd * 1000)
              ),
            });

            console.log(`[Billing] Updated subscription for user ${userId} to tier ${tier}`);
          } else {
            console.warn(`[Billing] User not found for customer ${customerId}`);
          }

          break;
        }

        case 'customer.subscription.updated': {
          // Subscription updated (upgrade/downgrade)
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

          if (!customerId) {
            console.error('[Billing] Missing customer ID in customer.subscription.updated');
            break;
          }

          // Get subscription details
          const priceId = subscription.items.data[0]?.price.id;
          const planMapping = getStripePlanMapping();
          const tier = priceId ? (planMapping[priceId] || 'free') : 'free';

          // Find user and update subscription with billing period
          const usersSnapshot = await getDb().collection('users')
            .where('stripeCustomerId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            const userDoc = usersSnapshot.docs[0];
            // Update user subscription with billing period from Stripe
            // Type assertion needed due to Stripe SDK typing
            const sub = subscription as any;
            const periodEnd = sub.current_period_end as number;
            const periodStart = sub.current_period_start as number;
            
            await userDoc.ref.update({
              subscriptionTier: tier,
              subscriptionStatus: subscription.status === 'active' ? 'active' : 'canceled',
              subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(
                new Date(periodEnd * 1000)
              ),
              billingPeriodStartAt: admin.firestore.Timestamp.fromDate(
                new Date(periodStart * 1000)
              ),
              billingPeriodEndAt: admin.firestore.Timestamp.fromDate(
                new Date(periodEnd * 1000)
              ),
            });
            console.log(`[Billing] Subscription updated for customer ${customerId} to tier ${tier}, status: ${subscription.status}`);
          } else {
            console.warn(`[Billing] User not found for customer ${customerId}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          // Subscription canceled
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

          if (!customerId) {
            console.error('[Billing] Missing customer ID in customer.subscription.deleted');
            break;
          }

          // Find user and set to free tier
          const usersSnapshot = await getDb().collection('users')
            .where('stripeCustomerId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            const userDoc = usersSnapshot.docs[0];
            await userDoc.ref.update({
              subscriptionTier: 'free',
              subscriptionStatus: 'canceled',
              subscriptionExpiresAt: null,
              billingPeriodStartAt: null,
              billingPeriodEndAt: null,
            });

            console.log(`[Billing] Subscription canceled for user ${userDoc.id}`);
          } else {
            console.warn(`[Billing] User not found for customer ${customerId}`);
          }

          break;
        }

        default:
          console.log(`[Billing] Unhandled event type: ${event.type}`);
      }

      return res.json({ received: true });
    } catch (error: any) {
      console.error('Error handling billing webhook:', error);
      return res.status(400).json({ error: `Webhook Error: ${error.message}` });
    }
  });
});

/**
 * Initialize Stripe customer for new user
 */
export async function initializeStripeCustomer(userId: string, email: string): Promise<string | null> {
  try {
    const stripe = getStripe();
    
    // Create customer
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    });

    // Update user with customer ID
    await getDb().collection('users').doc(userId).update({
      stripeCustomerId: customer.id,
    });

    console.log(`[Billing] Initialized Stripe customer ${customer.id} for user ${userId}`);
    return customer.id;
  } catch (error) {
    console.error('[Billing] Error initializing Stripe customer:', error);
    return null;
  }
}

