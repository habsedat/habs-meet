# Subscription System Activation Checklist

This document outlines everything needed to make the subscription system fully functional and active.

## ✅ Prerequisites (Already Complete)

- [x] Subscription system code implemented
- [x] Frontend components (UpgradeModal, PricingPage, Header upgrade button)
- [x] Backend functions (billing.ts, subscriptionChecks.ts, subscriptionTracking.ts)
- [x] Admin dashboard UI (SubscriptionSettingsTab, UserSubscriptionManagement)
- [x] Firestore security rules for subscriptionPlans collection
- [x] Billing period tracking (billingPeriodStartAt, billingPeriodEndAt)
- [x] Usage tracking system

---

## 🔴 CRITICAL: Stripe Integration Setup

### Step 1: Create Stripe Account & Get API Keys

1. **Sign up for Stripe Account** (if not already done)
   - Go to https://stripe.com
   - Create account (use Test Mode for dev, Live Mode for prod)
   - Complete business verification for Live Mode

2. **Get API Keys**
   - Navigate to: Developers → API keys
   - Copy **Secret Key** (starts with `sk_`)
   - Copy **Publishable Key** (starts with `pk_`) - *Not needed for backend, but useful for frontend if you add direct Stripe.js integration*

### Step 2: Install Stripe SDK in Functions

```bash
cd apps/functions
npm install stripe
```

### Step 3: Configure Stripe in Firebase Functions

**For Dev Project:**
```bash
firebase use dev
firebase functions:config:set stripe.secret_key="sk_test_YOUR_SECRET_KEY"
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"
```

**For Prod Project:**
```bash
firebase use prod
firebase functions:config:set stripe.secret_key="sk_live_YOUR_SECRET_KEY"
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"
```

> **Note:** Get webhook secret from Step 5 (after creating webhook endpoint)

### Step 4: Create Products & Prices in Stripe Dashboard

1. Go to Stripe Dashboard → Products
2. Create 3 products (Free tier doesn't need a Stripe product):

   **Product 1: Pro Plan**
   - Name: "Habs Meet Pro"
   - Description: "Best for professionals, creators, educators, and small teams"
   - Pricing: Recurring, €9.99/month (or your currency)
   - Note the **Price ID** (starts with `price_`)

   **Product 2: Business Plan**
   - Name: "Habs Meet Business"
   - Description: "Ideal for organizations, online classes, and daily meeting workflows"
   - Pricing: Recurring, €19.99/month
   - Note the **Price ID**

   **Product 3: Enterprise Plan**
   - Name: "Habs Meet Enterprise"
   - Description: "For schools, governments, teams, and professional organizations"
   - Pricing: Recurring, €49.99/month (or "Contact Sales" if custom pricing)
   - Note the **Price ID**

3. **Update Price ID Mapping in Code**
   - Edit `apps/functions/src/billing.ts`
   - Update `STRIPE_PLAN_MAPPING`:
   ```typescript
   const STRIPE_PLAN_MAPPING: Record<string, 'free' | 'pro' | 'business' | 'enterprise'> = {
     'price_YOUR_PRO_PRICE_ID': 'pro',
     'price_YOUR_BUSINESS_PRICE_ID': 'business',
     'price_YOUR_ENTERPRISE_PRICE_ID': 'enterprise',
   };
   ```

### Step 5: Set Up Stripe Webhook

1. **Create Webhook Endpoint in Stripe Dashboard**
   - Go to: Developers → Webhooks
   - Click "Add endpoint"
   - Endpoint URL: `https://us-central1-habs-meet-dev.cloudfunctions.net/billingWebhook`
   - (For prod: `https://us-central1-habs-meet-prod.cloudfunctions.net/billingWebhook`)
   - Select events to listen to:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Click "Add endpoint"
   - **Copy the Signing Secret** (starts with `whsec_`) - use this in Step 3

2. **Uncomment Stripe Code in billing.ts**
   - Open `apps/functions/src/billing.ts`
   - Uncomment all `// TODO:` sections related to Stripe
   - Remove stub responses
   - Ensure webhook signature verification is enabled

### Step 6: Deploy Functions After Stripe Setup

```bash
# For dev
firebase use dev
firebase deploy --only functions

# For prod (after testing)
firebase use prod
firebase deploy --only functions
```

---

## 🟡 IMPORTANT: Firestore Data Initialization

### Step 1: Initialize Subscription Plans in Firestore

The system will work with hardcoded defaults, but for full admin control, initialize Firestore data:

**Option A: Via Admin Dashboard (Recommended)**
1. Log in as admin
2. Go to Admin Dashboard → Subscription Settings tab
3. Configure each tier (Free, Pro, Business, Enterprise):
   - Display name, tagline, price
   - All limits (duration, participants, recording, storage, etc.)
   - Save each tier

**Option B: Via Script (For Bulk Setup)**
Create a script to initialize default plans (see example below).

### Step 2: Initialize Pricing Page Content

1. Go to Admin Dashboard → Subscription Settings tab
2. Scroll to "Pricing Page Content"
3. Fill in:
   - Hero section (headline, subheadline, key points)
   - FAQ questions and answers
   - Footer note
   - Tier-specific descriptions and bullet points
   - Psychological triggers (optional)
   - Upgrade button texts (optional)

### Step 3: Verify Firestore Collections

Ensure these collections exist and have proper security rules:
- ✅ `subscriptionPlans/{tierKey}` - Plan configurations
- ✅ `subscriptionPlans/pricingTexts` - Pricing page content
- ✅ `subscriptionPlans/upgradeModalTexts` - Upgrade modal content
- ✅ `subscriptionPlans/upgradeButtonTexts` - Header button texts

---

## 🟢 OPTIONAL: Enhanced Features

### 1. Automatic Stripe Customer Creation

Currently, `stripeCustomerId` is created on-demand. To auto-create on user signup:

1. Edit `apps/web/src/contexts/AuthContext.tsx`
2. In `handleSignup`, after creating user profile, call:
   ```typescript
   // This would require a Cloud Function to create Stripe customer
   // For now, customer is created when first checkout session is created
   ```

### 2. Storage Tracking Integration

Currently, storage tracking is implemented but needs to be called when files are uploaded/deleted:

1. In `apps/web/src/lib/fileStorageService.ts`
2. Ensure `trackStorageUsage` and `removeStorageUsage` are called
3. Verify Cloud Function triggers if using Firebase Storage triggers

### 3. Usage Dashboard

Create a usage dashboard component showing:
- Current usage vs limits
- Billing period countdown
- Visual progress bars
- Upgrade prompts when near limits

---

## 📋 Testing Checklist

### Test 1: Subscription Checks (Backend)
- [ ] Create meeting with free tier (should allow up to 20 min, 6 participants)
- [ ] Try to create meeting > 20 min (should be blocked)
- [ ] Try to join meeting with > 6 participants (should be blocked)
- [ ] Try to start recording on free tier (should be blocked)
- [ ] Test with Pro tier (should allow 2hr, 25 participants, recording)

### Test 2: Usage Tracking
- [ ] Start and end a meeting (verify `totalMeetingMinutesThisMonth` updates)
- [ ] Start and stop recording (verify `totalRecordingMinutesThisMonth` updates)
- [ ] Upload a file (verify `storageUsedBytes` updates)
- [ ] Delete a file (verify `storageUsedBytes` decreases)
- [ ] Wait for billing period to end (verify usage resets)

### Test 3: Stripe Integration
- [ ] Create checkout session (verify URL is returned)
- [ ] Complete test payment in Stripe test mode
- [ ] Verify webhook updates user subscription
- [ ] Verify `billingPeriodStartAt` and `billingPeriodEndAt` are set correctly
- [ ] Test subscription upgrade (change plan in Stripe)
- [ ] Test subscription cancellation (cancel in Stripe, verify user set to free)

### Test 4: Admin Overrides
- [ ] Admin upgrades user to Pro (complimentary)
- [ ] Verify `adminLastModified` log is created
- [ ] Admin generates checkout link for user
- [ ] User completes payment
- [ ] Verify subscription is active

### Test 5: Frontend UI
- [ ] Upgrade button appears in header
- [ ] Upgrade modal shows when limit reached
- [ ] Pricing page displays all tiers correctly
- [ ] Profile shows current subscription status
- [ ] Admin dashboard subscription settings work

---

## 🚨 Common Issues & Solutions

### Issue: "Stripe integration pending" message
**Solution:** Complete Step 1-6 of Stripe Integration Setup above.

### Issue: Webhook not receiving events
**Solution:** 
- Verify webhook URL is correct in Stripe dashboard
- Check webhook secret is configured correctly
- Verify webhook events are selected in Stripe dashboard
- Check Firebase Functions logs for errors

### Issue: Subscription checks not working
**Solution:**
- Verify user has `subscriptionTier` field in Firestore
- Check `subscriptionStatus` is "active"
- Verify billing period dates are set correctly
- Check Firebase Functions logs for errors

### Issue: Usage not tracking
**Solution:**
- Verify `livekitWebhook` function is deployed
- Check webhook is configured in LiveKit dashboard
- Verify user has `usage` object in Firestore
- Check billing period dates are set

### Issue: Admin can't edit subscription plans
**Solution:**
- Verify user has `role: 'admin'` or `role: 'superadmin'`
- Check Firestore security rules allow admin writes to `subscriptionPlans`
- Verify admin dashboard is accessible

---

## 📝 Quick Start Commands

```bash
# 1. Install Stripe SDK
cd apps/functions && npm install stripe && cd ../..

# 2. Configure Stripe (Dev)
firebase use dev
firebase functions:config:set stripe.secret_key="sk_test_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."

# 3. Configure Stripe (Prod)
firebase use prod
firebase functions:config:set stripe.secret_key="sk_live_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."

# 4. Uncomment Stripe code in apps/functions/src/billing.ts

# 5. Deploy functions
firebase use dev
firebase deploy --only functions

# 6. Initialize subscription plans via Admin Dashboard
# (Log in as admin → Admin Dashboard → Subscription Settings)

# 7. Test subscription flow
# (Create test user → Try to upgrade → Complete Stripe checkout)
```

---

## ✅ Final Verification

Before going live, verify:

- [ ] Stripe API keys configured (both dev and prod)
- [ ] Stripe products and prices created
- [ ] Webhook endpoint configured and tested
- [ ] All Stripe code uncommented in `billing.ts`
- [ ] Functions deployed with Stripe integration
- [ ] Subscription plans initialized in Firestore
- [ ] Pricing page content configured
- [ ] Admin dashboard subscription settings working
- [ ] Test payment completed successfully
- [ ] Webhook events updating user subscriptions correctly
- [ ] Usage tracking working
- [ ] Subscription checks blocking/allowing correctly
- [ ] Upgrade flow end-to-end tested

---

## 🎯 Summary

**Minimum Required for Basic Functionality:**
1. ✅ Code already implemented
2. 🔴 Stripe account + API keys + products
3. 🔴 Uncomment Stripe code in `billing.ts`
4. 🔴 Configure Firebase Functions with Stripe keys
5. 🟡 Initialize subscription plans in Firestore (or use defaults)

**For Full Production Readiness:**
- All of the above, plus:
- 🟢 Complete testing checklist
- 🟢 Webhook monitoring and error handling
- 🟢 Usage dashboard for users
- 🟢 Email notifications for subscription events
- 🟢 Analytics and reporting

---

**Need Help?** Check the implementation files:
- `apps/functions/src/billing.ts` - Stripe integration
- `apps/functions/src/subscriptionChecks.ts` - Feature gating
- `apps/functions/src/subscriptionTracking.ts` - Usage tracking
- `apps/web/src/lib/subscriptionService.ts` - Frontend subscription logic
- `SUBSCRIPTION_IMPLEMENTATION.md` - Full implementation details



