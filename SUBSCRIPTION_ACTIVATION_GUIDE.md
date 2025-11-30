# Subscription System Activation Guide

This guide explains how to activate the subscription system when you're ready to enforce subscription limits and enable payments.

## Current State

**The platform is currently in FREE MODE:**
- All subscription enforcement is **DISABLED** (`SUBSCRIPTIONS_ENFORCED = false`)
- All users have full access to all features
- No meeting duration limits
- No recording restrictions
- No participant limits
- No feature access restrictions

## Overview

The subscription system is fully implemented and ready to activate. All subscription logic, admin tools, and plan structures are in place. You just need to:

1. Configure Stripe (test + live)
2. Initialize Firestore plan documents
3. Enable subscription enforcement
4. Test thoroughly

---

## Step 1: Stripe Setup

### 1.1 Create Stripe Account

1. Go to [https://stripe.com](https://stripe.com)
2. Create an account (or use existing)
3. Complete business verification if needed

### 1.2 Create Products and Prices

#### For Development (Test Mode)

1. In Stripe Dashboard, switch to **Test Mode** (toggle in top right)
2. Go to **Products** → **Add Product**
3. Create products for each tier:

**Pro Plan:**
- Name: "Pro Plan"
- Description: "Pro subscription for Habs Meet"
- Pricing: Recurring, Monthly
- Price: €9.99 (or your desired amount)
- Save the **Price ID** (starts with `price_`)

**Business Plan:**
- Name: "Business Plan"
- Description: "Business subscription for Habs Meet"
- Pricing: Recurring, Monthly
- Price: €19.99 (or your desired amount)
- Save the **Price ID**

**Enterprise Plan:**
- Name: "Enterprise Plan"
- Description: "Enterprise subscription for Habs Meet"
- Pricing: Recurring, Monthly
- Price: €49.99 (or your desired amount)
- Save the **Price ID**

#### For Production (Live Mode)

1. Switch to **Live Mode** in Stripe Dashboard
2. Repeat the same product creation process
3. Save the **Live Price IDs** (they will be different from test IDs)

### 1.3 Get API Keys

#### Development (Test Mode)
1. In Stripe Dashboard (Test Mode), go to **Developers** → **API keys**
2. Copy:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_`)

#### Production (Live Mode)
1. Switch to **Live Mode**
2. Go to **Developers** → **API keys**
3. Copy:
   - **Publishable key** (starts with `pk_live_`)
   - **Secret key** (starts with `sk_live_`)

### 1.4 Configure Webhooks

#### Development Webhook
1. In Stripe Dashboard (Test Mode), go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. URL: `https://[YOUR-DEV-PROJECT].cloudfunctions.net/billingWebhook`
   - Example: `https://habs-meet-dev.cloudfunctions.net/billingWebhook`
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`)

#### Production Webhook
1. Switch to **Live Mode**
2. Repeat the same process
3. URL: `https://[YOUR-PROD-PROJECT].cloudfunctions.net/billingWebhook`
4. Copy the **Live Signing secret**

### 1.5 Set Firebase Functions Config

#### Development Project
```bash
firebase use dev
firebase functions:config:set stripe.test_publishable_key="pk_test_..."
firebase functions:config:set stripe.test_secret_key="sk_test_..."
firebase functions:config:set stripe.test_webhook_secret="whsec_..."
```

#### Production Project
```bash
firebase use prod
firebase functions:config:set stripe.live_publishable_key="pk_live_..."
firebase functions:config:set stripe.live_secret_key="sk_live_..."
firebase functions:config:set stripe.live_webhook_secret="whsec_..."
```

---

## Step 2: Initialize Firestore Plan Documents

### 2.1 Plan Document Structure

Each plan document should be stored in the `subscriptionPlans` collection with the tier key as the document ID:

- `subscriptionPlans/free`
- `subscriptionPlans/pro`
- `subscriptionPlans/business`
- `subscriptionPlans/enterprise`

### 2.2 Plan Document Fields

```typescript
{
  tierKey: "pro" | "business" | "enterprise",
  displayName: "Pro" | "Business" | "Enterprise",
  tagline: "Description of the plan",
  displayPrice: "€9.99/month",
  currency: "EUR",
  sortOrder: 1, // 1 = first, 2 = second, etc.
  isRecommended: false,
  stripePriceId: "price_xxxxx", // From Step 1.2
  limits: {
    maxMeetingDurationMinutes: 120,
    maxParticipantsPerMeeting: 25,
    maxMeetingsPerMonth: 100,
    recordingEnabled: true,
    maxRecordingMinutesPerMonth: 120,
    maxStorageBytes: 1073741824, // 1GB in bytes
    backgroundEffects: {
      blur: true,
      defaultImages: "standard",
      userUploads: "limited",
      videoBackgrounds: false
    },
    chatFeatures: {
      publicChat: true,
      privateChat: true,
      fileSharing: true,
      maxFileSizeMB: 10
    },
    scheduling: {
      instant: true,
      schedule: true,
      recurring: "basic"
    }
  }
}
```

### 2.3 Initialize Plans via Admin UI

1. Go to your app's Admin page (`/admin`)
2. Navigate to **Subscription Settings** tab
3. For each plan (Pro, Business, Enterprise):
   - Enter plan details
   - Set Stripe Price ID (from Step 1.2)
   - Configure limits
   - Save

### 2.4 Initialize Plans via Firestore Console

Alternatively, you can create the documents directly in Firestore Console:

1. Go to Firebase Console → Firestore Database
2. Create collection: `subscriptionPlans`
3. Create documents with tier keys as IDs
4. Add all required fields as shown in Step 2.2

---

## Step 3: Enable Subscription Enforcement

### 3.1 Update Web Config

Edit `apps/web/src/lib/subscriptionConfig.ts`:

```typescript
export const SUBSCRIPTIONS_ENFORCED = true; // Change from false to true
```

### 3.2 Update Functions Config

Edit `apps/functions/src/subscriptionConfig.ts`:

```typescript
export const SUBSCRIPTIONS_ENFORCED = true; // Change from false to true
```

### 3.3 Rebuild and Deploy

```bash
# Development
pnpm deploy:dev

# Production (after testing)
pnpm deploy:prod
```

---

## Step 4: Testing

### 4.1 Test in Development First

**Before enabling in production, test everything in development:**

1. **Free Plan Limits:**
   - Create a free account
   - Try to start a meeting (should work)
   - Try to record (should be blocked with upgrade message)
   - Try to exceed participant limit (should be blocked)
   - Try to exceed meeting duration (should auto-end at 20 minutes)

2. **Upgrade Flow:**
   - Click "Upgrade" button
   - Complete Stripe test checkout (use test card: `4242 4242 4242 4242`)
   - Verify subscription status updates in user profile
   - Verify features unlock after upgrade

3. **Webhook Testing:**
   - Use Stripe CLI to test webhooks locally:
     ```bash
     stripe listen --forward-to localhost:5001/habs-meet-dev/us-central1/billingWebhook
     ```
   - Trigger test events and verify Firestore updates

4. **Admin Tools:**
   - Test manual plan changes via Admin UI
   - Verify limits update correctly

### 4.2 Test in Production

After successful development testing:

1. Enable enforcement in production configs
2. Deploy to production
3. Test with real Stripe account (small test payment)
4. Monitor webhook logs
5. Verify subscription status updates

---

## Step 5: Monitoring

### 5.1 Stripe Dashboard

- Monitor subscriptions, payments, and webhooks
- Check for failed payments
- Review customer activity

### 5.2 Firebase Functions Logs

```bash
firebase functions:log --only billingWebhook
```

### 5.3 Firestore

- Monitor user subscription status
- Check usage tracking
- Verify plan documents

---

## Important Notes

### ⚠️ Before Going Live

1. **Test thoroughly in development first**
2. **Ensure Stripe webhooks are configured correctly**
3. **Verify all plan documents exist in Firestore**
4. **Test upgrade/downgrade flows**
5. **Test payment failures and retries**
6. **Test subscription expiration handling**

### 🔄 Rollback Plan

If you need to disable enforcement temporarily:

1. Set `SUBSCRIPTIONS_ENFORCED = false` in both config files
2. Rebuild and deploy
3. Platform returns to free mode

### 📝 Plan Limits Reference

**Free Plan:**
- Meeting duration: 20 minutes
- Participants: 6
- Meetings/month: 20
- Recording: Disabled
- Storage: 100MB

**Pro Plan:**
- Meeting duration: 120 minutes
- Participants: 25
- Meetings/month: 100
- Recording: 120 minutes/month
- Storage: 1GB

**Business Plan:**
- Meeting duration: 480 minutes
- Participants: 100
- Meetings/month: Unlimited
- Recording: 1200 minutes/month
- Storage: 10GB

**Enterprise Plan:**
- Meeting duration: Unlimited
- Participants: Unlimited
- Meetings/month: Unlimited
- Recording: Unlimited
- Storage: Unlimited

---

## Support

If you encounter issues during activation:

1. Check Firebase Functions logs
2. Check Stripe webhook logs
3. Verify Firestore plan documents
4. Verify Stripe API keys are correct
5. Ensure webhook URLs are accessible

---

## Summary Checklist

- [ ] Stripe account created
- [ ] Products and prices created (test + live)
- [ ] API keys obtained (test + live)
- [ ] Webhooks configured (test + live)
- [ ] Firebase Functions config set
- [ ] Firestore plan documents initialized
- [ ] `SUBSCRIPTIONS_ENFORCED = true` in web config
- [ ] `SUBSCRIPTIONS_ENFORCED = true` in functions config
- [ ] Tested in development environment
- [ ] Deployed to production
- [ ] Tested in production
- [ ] Monitoring set up

---

**Last Updated:** [Current Date]
**Status:** Ready for activation when needed


