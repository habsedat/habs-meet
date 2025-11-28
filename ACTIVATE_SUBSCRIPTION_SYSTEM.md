# 🔥 Complete Subscription System Activation Guide

This guide will help you activate the subscription system in **both** Firebase projects with proper Stripe configuration.

---

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- [ ] Stripe account created (https://stripe.com)
- [ ] Access to both Firebase projects (`habs-meet-dev` and `habs-meet-prod`)
- [ ] Firebase CLI installed and authenticated
- [ ] Admin access to both projects

---

## 🔵 PART 1: Development Project (habs-meet-dev) - TEST MODE

### Step 1.1: Get Stripe Test Mode Keys

1. Go to https://dashboard.stripe.com
2. **Toggle to TEST MODE** (switch in top right)
3. Navigate to **Developers** → **API keys**
4. Copy:
   - **Secret key** (starts with `sk_test_`)
   - Keep this page open for webhook setup

### Step 1.2: Configure Firebase Functions (Dev)

```bash
# Switch to dev project
firebase use habs-meet-dev

# Set Stripe Test Mode secret key
firebase functions:config:set stripe.secret_key="sk_test_YOUR_TEST_SECRET_KEY"

# Note: Webhook secret will be set after creating webhook endpoint
```

### Step 1.3: Create Test Products in Stripe

1. In Stripe Dashboard (TEST MODE), go to **Products**
2. Create 3 products:

   **Product 1: Pro Plan (Test)**
   - Name: `Habs Meet Pro`
   - Description: `Best for professionals, creators, educators, and small teams`
   - Pricing: Recurring, €9.99/month
   - **Copy the Price ID** (starts with `price_`)

   **Product 2: Business Plan (Test)**
   - Name: `Habs Meet Business`
   - Description: `Ideal for organizations, online classes, and daily meeting workflows`
   - Pricing: Recurring, €19.99/month
   - **Copy the Price ID**

   **Product 3: Enterprise Plan (Test)**
   - Name: `Habs Meet Enterprise`
   - Description: `For schools, governments, teams, and professional organizations`
   - Pricing: Recurring, €49.99/month
   - **Copy the Price ID**

### Step 1.4: Update Price ID Mapping (Dev)

Edit `apps/functions/src/billing.ts` and update the `STRIPE_PLAN_MAPPING` with your TEST price IDs:

```typescript
const STRIPE_PLAN_MAPPING: Record<string, 'free' | 'pro' | 'business' | 'enterprise'> = {
  'price_YOUR_TEST_PRO_PRICE_ID': 'pro',
  'price_YOUR_TEST_BUSINESS_PRICE_ID': 'business',
  'price_YOUR_TEST_ENTERPRISE_PRICE_ID': 'enterprise',
};
```

**Important:** You'll need separate mappings for dev and prod. We'll handle this in the code.

### Step 1.5: Set Up Test Webhook Endpoint

1. In Stripe Dashboard (TEST MODE), go to **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Endpoint URL: `https://us-central1-habs-meet-dev.cloudfunctions.net/billingWebhook`
   - **Note:** Replace `us-central1` with your actual region if different
4. Select events:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. **Copy the Signing secret** (starts with `whsec_`)

### Step 1.6: Configure Webhook Secret (Dev)

```bash
firebase use habs-meet-dev
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_TEST_WEBHOOK_SECRET"
```

### Step 1.7: Initialize Firestore Plans (Dev)

Run the initialization script:

```bash
# Make sure you're authenticated with Firebase
firebase use habs-meet-dev

# Run the initialization script
node scripts/initialize-subscription-plans.js
```

Or manually via Admin Dashboard:
1. Log in to https://habs-meet-dev.web.app as admin
2. Go to **Admin Dashboard** → **Subscription Settings**
3. Configure each tier (Free, Pro, Business, Enterprise)
4. Save each tier

### Step 1.8: Deploy Functions (Dev)

```bash
firebase use habs-meet-dev
firebase deploy --only functions
```

### Step 1.9: Test Subscription Flow (Dev)

1. Use Stripe test card: `4242 4242 4242 4242`
2. Any future expiry date (e.g., `12/34`)
3. Any CVC (e.g., `123`)
4. Any ZIP code
5. Try creating a checkout session
6. Complete test payment
7. Verify webhook events are received
8. Check Firebase Functions logs: `firebase functions:log --only billingWebhook`

---

## 🔴 PART 2: Production Project (habs-meet-prod) - LIVE MODE

### Step 2.1: Get Stripe Live Mode Keys

1. Go to https://dashboard.stripe.com
2. **Toggle to LIVE MODE** (switch in top right)
3. **Important:** Complete business verification if required
4. Navigate to **Developers** → **API keys**
5. Copy:
   - **Secret key** (starts with `sk_live_`)
   - Keep this page open for webhook setup

### Step 2.2: Configure Firebase Functions (Prod)

```bash
# Switch to prod project
firebase use habs-meet-prod

# Set Stripe Live Mode secret key
firebase functions:config:set stripe.secret_key="sk_live_YOUR_LIVE_SECRET_KEY"

# Note: Webhook secret will be set after creating webhook endpoint
```

### Step 2.3: Create Live Products in Stripe

1. In Stripe Dashboard (LIVE MODE), go to **Products**
2. Create 3 products (same as test, but in Live Mode):

   **Product 1: Pro Plan (Live)**
   - Name: `Habs Meet Pro`
   - Description: `Best for professionals, creators, educators, and small teams`
   - Pricing: Recurring, €9.99/month
   - **Copy the Price ID** (starts with `price_`)

   **Product 2: Business Plan (Live)**
   - Name: `Habs Meet Business`
   - Description: `Ideal for organizations, online classes, and daily meeting workflows`
   - Pricing: Recurring, €19.99/month
   - **Copy the Price ID**

   **Product 3: Enterprise Plan (Live)**
   - Name: `Habs Meet Enterprise`
   - Description: `For schools, governments, teams, and professional organizations`
   - Pricing: Recurring, €49.99/month
   - **Copy the Price ID**

### Step 2.4: Update Price ID Mapping (Prod)

**Important:** We need to handle different price IDs for dev and prod. The code will need to be updated to use environment-specific mappings.

For now, update `apps/functions/src/billing.ts` with your LIVE price IDs (we'll make this environment-aware):

```typescript
// This will be updated to support both environments
const STRIPE_PLAN_MAPPING: Record<string, 'free' | 'pro' | 'business' | 'enterprise'> = {
  'price_YOUR_LIVE_PRO_PRICE_ID': 'pro',
  'price_YOUR_LIVE_BUSINESS_PRICE_ID': 'business',
  'price_YOUR_LIVE_ENTERPRISE_PRICE_ID': 'enterprise',
};
```

### Step 2.5: Set Up Live Webhook Endpoint

1. In Stripe Dashboard (LIVE MODE), go to **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Endpoint URL: `https://us-central1-habs-meet-prod.cloudfunctions.net/billingWebhook`
   - **Note:** Replace `us-central1` with your actual region if different
4. Select events:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. **Copy the Signing secret** (starts with `whsec_`)

### Step 2.6: Configure Webhook Secret (Prod)

```bash
firebase use habs-meet-prod
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_LIVE_WEBHOOK_SECRET"
```

### Step 2.7: Initialize Firestore Plans (Prod)

Run the initialization script:

```bash
# Switch to prod project
firebase use habs-meet-prod

# Run the initialization script
node scripts/initialize-subscription-plans.js
```

Or manually via Admin Dashboard:
1. Log in to https://habs-meet-prod.web.app as admin
2. Go to **Admin Dashboard** → **Subscription Settings**
3. Configure each tier (Free, Pro, Business, Enterprise)
4. Save each tier

### Step 2.8: Deploy Functions (Prod)

```bash
firebase use habs-meet-prod
firebase deploy --only functions
```

### Step 2.9: Verify Production Setup

1. Check pricing page displays correctly
2. Verify subscription plans are loaded from Firestore
3. Test with a small real payment (if possible)
4. Monitor webhook events in Stripe Dashboard
5. Check Firebase Functions logs

---

## 🟡 PART 3: Code Updates for Environment-Aware Price Mapping

Since dev and prod use different Stripe price IDs, we need to make the code environment-aware.

### Option A: Use Firebase Functions Config (Recommended)

Update `apps/functions/src/billing.ts` to read price mappings from config:

```typescript
// Get price mapping from config or use defaults
function getStripePlanMapping(): Record<string, 'free' | 'pro' | 'business' | 'enterprise'> {
  const config = functions.config().stripe;
  
  // Try to get from config first
  if (config?.plan_mapping) {
    try {
      return JSON.parse(config.plan_mapping);
    } catch (e) {
      console.error('[Billing] Error parsing plan mapping from config:', e);
    }
  }
  
  // Fallback to default mapping
  return {
    'price_free': 'free',
    'price_pro': 'pro',
    'price_business': 'business',
    'price_enterprise': 'enterprise',
  };
}
```

Then configure separately for each project:

```bash
# Dev project
firebase use habs-meet-dev
firebase functions:config:set stripe.plan_mapping='{"price_TEST_PRO":"pro","price_TEST_BUSINESS":"business","price_TEST_ENTERPRISE":"enterprise"}'

# Prod project
firebase use habs-meet-prod
firebase functions:config:set stripe.plan_mapping='{"price_LIVE_PRO":"pro","price_LIVE_BUSINESS":"business","price_LIVE_ENTERPRISE":"enterprise"}'
```

### Option B: Hardcode Both Mappings (Simpler)

Keep both mappings in code and detect environment:

```typescript
const STRIPE_PLAN_MAPPING_TEST: Record<string, 'free' | 'pro' | 'business' | 'enterprise'> = {
  'price_YOUR_TEST_PRO': 'pro',
  'price_YOUR_TEST_BUSINESS': 'business',
  'price_YOUR_TEST_ENTERPRISE': 'enterprise',
};

const STRIPE_PLAN_MAPPING_LIVE: Record<string, 'free' | 'pro' | 'business' | 'enterprise'> = {
  'price_YOUR_LIVE_PRO': 'pro',
  'price_YOUR_LIVE_BUSINESS': 'business',
  'price_YOUR_LIVE_ENTERPRISE': 'enterprise',
};

function getStripePlanMapping(): Record<string, 'free' | 'pro' | 'business' | 'enterprise'> {
  const secretKey = functions.config().stripe?.secret_key || '';
  // Detect environment by secret key prefix
  if (secretKey.startsWith('sk_test_')) {
    return STRIPE_PLAN_MAPPING_TEST;
  } else if (secretKey.startsWith('sk_live_')) {
    return STRIPE_PLAN_MAPPING_LIVE;
  }
  // Fallback
  return STRIPE_PLAN_MAPPING_TEST;
}
```

---

## ✅ Verification Checklist

### Development (Test Mode)
- [ ] Stripe Test Mode keys configured
- [ ] Test products created in Stripe
- [ ] Test webhook endpoint configured
- [ ] Firestore plans initialized
- [ ] Functions deployed
- [ ] Test payment successful
- [ ] Webhook events received
- [ ] User subscription updated in Firestore
- [ ] Pricing page displays correctly
- [ ] Upgrade flow works end-to-end

### Production (Live Mode)
- [ ] Stripe Live Mode keys configured
- [ ] Live products created in Stripe
- [ ] Live webhook endpoint configured
- [ ] Firestore plans initialized
- [ ] Functions deployed
- [ ] Pricing page displays correctly
- [ ] Real payment successful (test with small amount)
- [ ] Webhook events received
- [ ] User subscription updated in Firestore

---

## 🚨 Important Notes

1. **Never mix Test and Live keys** - Each project must use its own mode
2. **Separate products required** - Test and Live products are separate in Stripe
3. **Separate webhooks required** - Each environment needs its own webhook endpoint
4. **Firestore is separate** - Each project has its own Firestore database
5. **Test thoroughly in dev** - Always test in dev before deploying to prod

---

## 🆘 Troubleshooting

### Issue: "Stripe secret key not configured"
**Solution:** Make sure you've set `stripe.secret_key` in Firebase Functions config for the active project.

### Issue: Webhook not receiving events
**Solution:**
- Verify webhook URL is correct
- Check webhook secret matches
- Verify events are selected in Stripe dashboard
- Check Firebase Functions logs

### Issue: Wrong price ID mapping
**Solution:** Update the price mapping in `billing.ts` or use environment-aware configuration.

### Issue: Plans not showing on pricing page
**Solution:** Initialize Firestore plans using the script or Admin Dashboard.

---

## 📝 Quick Reference Commands

```bash
# Dev Project
firebase use habs-meet-dev
firebase functions:config:set stripe.secret_key="sk_test_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."
node scripts/initialize-subscription-plans.js
firebase deploy --only functions

# Prod Project
firebase use habs-meet-prod
firebase functions:config:set stripe.secret_key="sk_live_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."
node scripts/initialize-subscription-plans.js
firebase deploy --only functions

# Verify Config
firebase functions:config:get
```

---

**Next Steps:** Follow this guide step-by-step for both projects. The system will be fully activated once all steps are completed.

