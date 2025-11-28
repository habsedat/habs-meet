# ✅ Stripe Installation Complete

Stripe has been successfully installed and integrated into your subscription system. The code is now ready to work with **both** your development (`habs-meet-dev`) and production (`habs-meet-prod`) projects.

## What Was Done

### ✅ 1. Stripe SDK Installed
- Installed `stripe@20.0.0` in `apps/functions`
- Package added to dependencies

### ✅ 2. Code Fully Implemented
- **File:** `apps/functions/src/billing.ts`
- All Stripe integration code has been uncommented and implemented
- Works automatically with both dev and prod projects via Firebase Functions config
- Handles:
  - Creating checkout sessions
  - Processing webhook events
  - Updating user subscriptions
  - Setting billing periods from Stripe data
  - Creating Stripe customers automatically

### ✅ 3. TypeScript Compilation
- All code compiles successfully
- No errors or warnings

## What You Need to Do Next

### 🔴 Step 1: Configure Stripe for DEV Project

1. **Get Stripe Test Mode Keys:**
   - Go to https://stripe.com (Test Mode)
   - Developers → API keys
   - Copy Secret key (`sk_test_...`)

2. **Configure Firebase Functions:**
   ```bash
   firebase use habs-meet-dev
   firebase functions:config:set stripe.secret_key="sk_test_YOUR_KEY"
   ```

3. **Create Webhook Endpoint:**
   - In Stripe Dashboard (Test Mode) → Developers → Webhooks
   - Add endpoint: `https://us-central1-habs-meet-dev.cloudfunctions.net/billingWebhook`
   - Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy webhook secret (`whsec_...`)

4. **Configure Webhook Secret:**
   ```bash
   firebase use habs-meet-dev
   firebase functions:config:set stripe.webhook_secret="whsec_YOUR_SECRET"
   ```

### 🔴 Step 2: Configure Stripe for PROD Project

1. **Get Stripe Live Mode Keys:**
   - Go to https://stripe.com (Live Mode)
   - Developers → API keys
   - Copy Secret key (`sk_live_...`)

2. **Configure Firebase Functions:**
   ```bash
   firebase use habs-meet-prod
   firebase functions:config:set stripe.secret_key="sk_live_YOUR_KEY"
   ```

3. **Create Webhook Endpoint:**
   - In Stripe Dashboard (Live Mode) → Developers → Webhooks
   - Add endpoint: `https://us-central1-habs-meet-prod.cloudfunctions.net/billingWebhook`
   - Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy webhook secret (`whsec_...`)

4. **Configure Webhook Secret:**
   ```bash
   firebase use habs-meet-prod
   firebase functions:config:set stripe.webhook_secret="whsec_YOUR_SECRET"
   ```

### 🔴 Step 3: Create Products in Stripe

Create 3 products in Stripe Dashboard (both Test and Live modes):

1. **Pro Plan** - €9.99/month
2. **Business Plan** - €19.99/month
3. **Enterprise Plan** - €49.99/month

**Important:** Copy the Price IDs and update them in `apps/functions/src/billing.ts`:

```typescript
const STRIPE_PLAN_MAPPING: Record<string, 'free' | 'pro' | 'business' | 'enterprise'> = {
  'price_YOUR_PRO_PRICE_ID': 'pro',
  'price_YOUR_BUSINESS_PRICE_ID': 'business',
  'price_YOUR_ENTERPRISE_PRICE_ID': 'enterprise',
};
```

### 🔴 Step 4: Deploy Functions

```bash
# Deploy to dev
firebase use habs-meet-dev
firebase deploy --only functions

# Deploy to prod
firebase use habs-meet-prod
firebase deploy --only functions
```

## How It Works

The same code automatically uses the correct Stripe keys based on which Firebase project is active:

- **Dev project** → Uses Test Mode Stripe keys
- **Prod project** → Uses Live Mode Stripe keys

The code reads from `functions.config().stripe.secret_key` and `functions.config().stripe.webhook_secret`, which are set separately for each project.

## Documentation

- **Full Setup Guide:** See `STRIPE_SETUP_GUIDE.md` for detailed step-by-step instructions
- **Activation Checklist:** See `SUBSCRIPTION_ACTIVATION_CHECKLIST.md` for complete activation steps

## Next Steps

1. ✅ Stripe installed (DONE)
2. ✅ Code implemented (DONE)
3. 🔴 Configure Stripe keys for dev project
4. 🔴 Configure Stripe keys for prod project
5. 🔴 Create products in Stripe
6. 🔴 Set up webhooks
7. 🔴 Deploy functions
8. 🔴 Test the integration

---

**Status:** Stripe is installed and ready. You just need to configure the API keys and webhooks for both projects!

