/**
 * Subscription Enforcement Configuration (Firebase Functions)
 * 
 * This file controls whether subscription limits are enforced or disabled in backend functions.
 * 
 * IMPORTANT: This must match the web config (apps/web/src/lib/subscriptionConfig.ts)
 * 
 * When SUBSCRIPTIONS_ENFORCED = false:
 * - All subscription checks allow actions instead of blocking
 * - No participant limits enforced
 * - No meeting start restrictions
 * - Platform operates as fully free for all users
 * 
 * When SUBSCRIPTIONS_ENFORCED = true:
 * - All subscription limits are enforced as designed
 * - Participant limits apply
 * - Meeting start restrictions apply
 * 
 * To activate subscription enforcement:
 * 1. Set SUBSCRIPTIONS_ENFORCED = true in both web and functions
 * 2. Ensure Stripe is configured (see SUBSCRIPTION_ACTIVATION_GUIDE.md)
 * 3. Ensure Firestore plans are initialized
 * 4. Test in development environment first
 */

/**
 * Global flag to control subscription enforcement
 * 
 * Default: false (platform is fully free, no limits enforced)
 * Set to true to enable subscription limits and restrictions
 */
export const SUBSCRIPTIONS_ENFORCED = false;

/**
 * Helper function to check if subscription enforcement is enabled
 * Use this in all subscription check functions
 */
export function isSubscriptionEnforcementEnabled(): boolean {
  return SUBSCRIPTIONS_ENFORCED;
}


