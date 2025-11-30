# Stripe Setup Guide for Both Projects

This guide will help you configure Stripe for both **habs-meet-dev** (development) and **habs-meet-prod** (production) projects.

## ✅ Step 1: Stripe Installation (COMPLETED)

Stripe SDK has been installed in `apps/functions` and the code has been fully implemented. The same code works for both dev and prod projects.

## 🔴 Step 2: Create Stripe Account & Products

### 2.1 Create Stripe Account

1. Go to https://stripe.com
2. Sign up for an account (or log in if you already have one)
3. **Important:** You'll use **Test Mode** for dev and **Live Mode** for prod

### 2.2 Create Products in Stripe Dashboard

1. Go to Stripe Dashboard → **Products**
2. Click **"Add product"** and create these 3 products:

   **Product 1: Pro Plan**
   - Name: `Habs Meet Pro`
   - Description: `Best for professionals, creators, educators, and small teams`
   - Pricing: 
     - Type: **Recurring**
     - Price: `€9.99` (or your currency)
     - Billing period: **Monthly**
   - Click **"Save product"**
   - **Copy the Price ID** (starts with `price_`)

   **Product 2: Business Plan**
   - Name: `Habs Meet Business`
   - Description: `Ideal for organizations, online classes, and daily meeting workflows`
   - Pricing:
     - Type: **Recurring**
     - Price: `€19.99`
     - Billing period: **Monthly**
   - Click **"Save product"**
   - **Copy the Price ID**

   **Product 3: Enterprise Plan**
   - Name: `Habs Meet Enterprise`
   - Description: `For schools, governments, teams, and professional organizations`
   - Pricing:
     - Type: **Recurring**
     - Price: `€49.99` (or "Contact Sales" if custom pricing)
     - Billing period: **Monthly**
   - Click **"Save product"**
   - **Copy the Price ID**

### 2.3 Update Price ID Mapping

Edit `apps/functions/src/billing.ts` and update the `STRIPE_PLAN_MAPPING`:

```typescript
const STRIPE_PLAN_MAPPING: Record<string, 'free' | 'pro' | 'business' | 'enterprise'> = {
  'price_YOUR_PRO_PRICE_ID': 'pro',           // Replace with your Pro price ID
  'price_YOUR_BUSINESS_PRICE_ID': 'business', // Replace with your Business price ID
  'price_YOUR_ENTERPRISE_PRICE_ID': 'enterprise', // Replace with your Enterprise price ID
};
```

**Note:** You'll need separate products/prices for Test Mode (dev) and Live Mode (prod), or use the same products for both.

---

## 🔴 Step 3: Configure Firebase Functions for DEV Project

### 3.1 Get Stripe API Keys (Test Mode)

1. In Stripe Dashboard, make sure you're in **Test Mode** (toggle in top right)
2. Go to **Developers** → **API keys**
3. Copy the **Secret key** (starts with `sk_test_`)
4. Keep this page open - you'll need the webhook secret later

### 3.2 Configure Dev Project

```bash
# Switch to dev project
firebase use habs-meet-dev

# Set Stripe secret key (Test Mode)
firebase functions:config:set stripe.secret_key="sk_test_YOUR_SECRET_KEY"

# Note: Webhook secret will be set after creating webhook endpoint (Step 4)
```

---

## 🔴 Step 4: Set Up Webhook Endpoint for DEV Project

### 4.1 Get Webhook URL

Your webhook URL for dev project will be:
```
https://us-central1-habs-meet-dev.cloudfunctions.net/billingWebhook
```

**Note:** Replace `us-central1` with your actual region if different.

### 4.2 Create Webhook in Stripe (Test Mode)

1. In Stripe Dashboard (Test Mode), go to **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Enter endpoint URL: `https://us-central1-habs-meet-dev.cloudfunctions.net/billingWebhook`
4. Select events to listen to:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. **Copy the Signing secret** (starts with `whsec_`)

### 4.3 Configure Webhook Secret for Dev

```bash
firebase use habs-meet-dev
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"
```

---

## 🔴 Step 5: Configure Firebase Functions for PROD Project

### 5.1 Get Stripe API Keys (Live Mode)

1. In Stripe Dashboard, switch to **Live Mode** (toggle in top right)
2. Go to **Developers** → **API keys**
3. Copy the **Secret key** (starts with `sk_live_`)
4. **Important:** Complete business verification if required for Live Mode

### 5.2 Configure Prod Project

```bash
# Switch to prod project
firebase use habs-meet-prod

# Set Stripe secret key (Live Mode)
firebase functions:config:set stripe.secret_key="sk_live_YOUR_SECRET_KEY"

# Note: Webhook secret will be set after creating webhook endpoint (Step 6)
```

---

## 🔴 Step 6: Set Up Webhook Endpoint for PROD Project

### 6.1 Get Webhook URL

Your webhook URL for prod project will be:
```
https://us-central1-habs-meet-prod.cloudfunctions.net/billingWebhook
```

**Note:** Replace `us-central1` with your actual region if different.

### 6.2 Create Webhook in Stripe (Live Mode)

1. In Stripe Dashboard (Live Mode), go to **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Enter endpoint URL: `https://us-central1-habs-meet-prod.cloudfunctions.net/billingWebhook`
4. Select events to listen to:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. **Copy the Signing secret** (starts with `whsec_`)

### 6.3 Configure Webhook Secret for Prod

```bash
firebase use habs-meet-prod
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"
```

---

## ✅ Step 7: Deploy Functions to Both Projects

### 7.1 Deploy to Dev

```bash
firebase use habs-meet-dev
firebase deploy --only functions
```

### 7.2 Deploy to Prod

```bash
firebase use habs-meet-prod
firebase deploy --only functions
```

---

## 🧪 Step 8: Test the Integration

### 8.1 Test in Dev (Test Mode)

1. Use Stripe test card: `4242 4242 4242 4242`
2. Any future expiry date
3. Any CVC
4. Any ZIP code
5. Try creating a checkout session and completing payment
6. Verify webhook events are received
7. Check Firebase Functions logs: `firebase functions:log --only billingWebhook`

### 8.2 Test in Prod (Live Mode)

1. Use a real card (small amount recommended)
2. Complete checkout
3. Verify subscription is created in Stripe
4. Verify user subscription is updated in Firestore
5. Check billing period dates are set correctly

---

## 📋 Configuration Summary

### Dev Project (habs-meet-dev)
- **Stripe Mode:** Test Mode
- **Secret Key:** `sk_test_...`
- **Webhook Secret:** `whsec_...`
- **Webhook URL:** `https://us-central1-habs-meet-dev.cloudfunctions.net/billingWebhook`

### Prod Project (habs-meet-prod)
- **Stripe Mode:** Live Mode
- **Secret Key:** `sk_live_...`
- **Webhook Secret:** `whsec_...`
- **Webhook URL:** `https://us-central1-habs-meet-prod.cloudfunctions.net/billingWebhook`

---

## 🔍 Verify Configuration

To verify your configuration is correct:

```bash
# Check dev config
firebase use habs-meet-dev
firebase functions:config:get

# Check prod config
firebase use habs-meet-prod
firebase functions:config:get
```

You should see:
```
stripe:
  secret_key: sk_test_... (or sk_live_...)
  webhook_secret: whsec_...
```

---

## 🚨 Important Notes

1. **Never commit Stripe keys to Git** - They're stored in Firebase Functions config
2. **Use Test Mode for dev** - Prevents accidental charges
3. **Complete business verification for Live Mode** - Required for production
4. **Webhook secrets are different** - Each webhook endpoint has its own secret
5. **Same code, different configs** - The code automatically uses the correct keys based on the Firebase project

---

## 🆘 Troubleshooting

### Issue: "Stripe secret key not configured"
**Solution:** Make sure you've set `stripe.secret_key` in Firebase Functions config for the active project.

### Issue: Webhook not receiving events
**Solution:**
- Verify webhook URL is correct in Stripe dashboard
- Check webhook secret is configured correctly
- Verify events are selected in Stripe dashboard
- Check Firebase Functions logs for errors

### Issue: "Webhook signature verification failed"
**Solution:** Make sure the webhook secret in Firebase config matches the one in Stripe dashboard.

---

## ✅ Checklist

- [ ] Stripe account created
- [ ] Products created in Stripe (Pro, Business, Enterprise)
- [ ] Price IDs updated in `billing.ts`
- [ ] Dev project configured with Test Mode keys
- [ ] Dev webhook endpoint created and configured
- [ ] Prod project configured with Live Mode keys
- [ ] Prod webhook endpoint created and configured
- [ ] Functions deployed to dev
- [ ] Functions deployed to prod
- [ ] Test payment completed in dev
- [ ] Verified webhook events are received
- [ ] Verified user subscriptions are updated in Firestore

---

**Need Help?** Check the implementation in `apps/functions/src/billing.ts` or see `SUBSCRIPTION_ACTIVATION_CHECKLIST.md` for more details.




