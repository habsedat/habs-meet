/**
 * Billing & Stripe Integration (Stubs)
 * 
 * Basic structure for Stripe integration.
 * Prices are managed in Stripe, not hard-coded here.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import cors from 'cors';

const corsHandler = cors({ origin: true });

// Initialize db lazily to avoid initialization order issues
function getDb() {
  return admin.firestore();
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

// Stripe plan mapping (configure in Stripe dashboard)
const STRIPE_PLAN_MAPPING: Record<string, 'free' | 'pro' | 'business' | 'enterprise'> = {
  'price_free': 'free',
  'price_pro': 'pro',
  'price_business': 'business',
  'price_enterprise': 'enterprise',
};

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

        // Log admin-initiated checkout
        console.log(`[Billing] Admin ${adminUser.uid} initiated checkout for user ${userId}, tier: ${priceId}`);
      } else {
        // Regular user checkout - verify auth and use their own customer ID
        const user = await verifyAuth(req);
        targetCustomerId = user.stripeCustomerId;
      }

      // TODO: Initialize Stripe
      // const stripe = require('stripe')(functions.config().stripe?.secret_key);
      
      // TODO: Create checkout session
      // const session = await stripe.checkout.sessions.create({
      //   customer: user.stripeCustomerId,
      //   mode: 'subscription',
      //   payment_method_types: ['card'],
      //   line_items: [{ price: priceId, quantity: 1 }],
      //   success_url: successUrl,
      //   cancel_url: cancelUrl,
      // });

      // For now, return stub response
      // TODO: When Stripe is configured, uncomment the code above and use:
      // return res.json({ url: session.url, sessionId: session.id });
      return res.json({
        sessionId: 'stub_session_id',
        url: isAdminInitiated && userId
          ? `#admin-checkout-${userId}-${priceId}` 
          : '#',
        message: 'Stripe integration pending. Configure Stripe secret key in Firebase Functions config.',
      });
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
      // TODO: Verify webhook signature
      // const stripe = require('stripe')(functions.config().stripe?.secret_key);
      // const sig = req.headers['stripe-signature'];
      // const event = stripe.webhooks.constructEvent(req.body, sig, functions.config().stripe?.webhook_secret);

      const event = req.body; // Stub - use actual Stripe event in production

      // Handle subscription events
      switch (event.type) {
        case 'checkout.session.completed': {
          // Subscription created/updated
          const session = event.data.object;
          const customerId = session.customer;
          const subscriptionId = session.subscription;

          // TODO: Get subscription details from Stripe
          // const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          // const priceId = subscription.items.data[0].price.id;
          // const tier = STRIPE_PLAN_MAPPING[priceId] || 'free';

          // Find user by stripeCustomerId
          const usersSnapshot = await getDb().collection('users')
            .where('stripeCustomerId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            const userDoc = usersSnapshot.docs[0];
            const userId = userDoc.id;

            // TODO: Update user subscription with billing period from Stripe
            // await userDoc.ref.update({
            //   subscriptionTier: tier,
            //   subscriptionStatus: 'active',
            //   subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(
            //     new Date(subscription.current_period_end * 1000)
            //   ),
            //   billingPeriodStartAt: admin.firestore.Timestamp.fromDate(
            //     new Date(subscription.current_period_start * 1000)
            //   ),
            //   billingPeriodEndAt: admin.firestore.Timestamp.fromDate(
            //     new Date(subscription.current_period_end * 1000)
            //   ),
            // });

            console.log(`[Billing] Updated subscription for user ${userId}`);
          }

          break;
        }

        case 'customer.subscription.updated': {
          // Subscription updated (upgrade/downgrade)
          const subscription = event.data.object;
          const customerId = subscription.customer;

          // TODO: Get subscription details from Stripe
          // const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          // const priceId = subscription.items.data[0].price.id;
          // const tier = STRIPE_PLAN_MAPPING[priceId] || 'free';

          // Find user and update subscription with billing period
          const usersSnapshot = await getDb().collection('users')
            .where('stripeCustomerId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            const userDoc = usersSnapshot.docs[0];
            // TODO: Update user subscription with billing period from Stripe
            // await userDoc.ref.update({
            //   subscriptionTier: tier,
            //   subscriptionStatus: subscription.status === 'active' ? 'active' : 'canceled',
            //   subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(
            //     new Date(subscription.current_period_end * 1000)
            //   ),
            //   billingPeriodStartAt: admin.firestore.Timestamp.fromDate(
            //     new Date(subscription.current_period_start * 1000)
            //   ),
            //   billingPeriodEndAt: admin.firestore.Timestamp.fromDate(
            //     new Date(subscription.current_period_end * 1000)
            //   ),
            // });
            console.log(`[Billing] Subscription updated for customer ${customerId}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          // Subscription canceled
          const subscription = event.data.object;
          const customerId = subscription.customer;

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
            });

            console.log(`[Billing] Subscription canceled for user ${userDoc.id}`);
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
    // TODO: Initialize Stripe
    // const stripe = require('stripe')(functions.config().stripe?.secret_key);
    
    // TODO: Create customer
    // const customer = await stripe.customers.create({
    //   email,
    //   metadata: { userId },
    // });

    // Update user with customer ID
    // await getDb().collection('users').doc(userId).update({
    //   stripeCustomerId: customer.id,
    // });

    // For now, return null (stub)
    return null;
  } catch (error) {
    console.error('[Billing] Error initializing Stripe customer:', error);
    return null;
  }
}

