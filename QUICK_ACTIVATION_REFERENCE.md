# 🚀 Quick Activation Reference

Quick commands to activate subscription system in both projects.

---

## 🔵 DEV PROJECT (Test Mode)

```bash
# 1. Switch to dev project
firebase use habs-meet-dev

# 2. Configure Stripe Test Mode keys
firebase functions:config:set stripe.secret_key="sk_test_YOUR_KEY"
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_SECRET"

# 3. Initialize Firestore plans
node scripts/initialize-subscription-plans.js

# 4. Update price IDs in apps/functions/src/billing.ts
# Replace YOUR_TEST_PRO_PRICE_ID, YOUR_TEST_BUSINESS_PRICE_ID, YOUR_TEST_ENTERPRISE_PRICE_ID

# 5. Deploy
firebase deploy --only functions

# 6. Verify
node scripts/verify-subscription-setup.js
```

**Stripe Webhook URL (Test Mode):**
```
https://us-central1-habs-meet-dev.cloudfunctions.net/billingWebhook
```

---

## 🔴 PROD PROJECT (Live Mode)

```bash
# 1. Switch to prod project
firebase use habs-meet-prod

# 2. Configure Stripe Live Mode keys
firebase functions:config:set stripe.secret_key="sk_live_YOUR_KEY"
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_SECRET"

# 3. Initialize Firestore plans
node scripts/initialize-subscription-plans.js

# 4. Update price IDs in apps/functions/src/billing.ts
# Replace YOUR_LIVE_PRO_PRICE_ID, YOUR_LIVE_BUSINESS_PRICE_ID, YOUR_LIVE_ENTERPRISE_PRICE_ID

# 5. Deploy
firebase deploy --only functions

# 6. Verify
node scripts/verify-subscription-setup.js
```

**Stripe Webhook URL (Live Mode):**
```
https://us-central1-habs-meet-prod.cloudfunctions.net/billingWebhook
```

---

## 📝 Price ID Mapping

The code automatically detects Test vs Live mode based on the secret key prefix:
- `sk_test_` → Uses Test Mode price IDs
- `sk_live_` → Uses Live Mode price IDs

Update `apps/functions/src/billing.ts` function `getStripePlanMapping()` with your actual price IDs.

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Stripe keys configured (check with `firebase functions:config:get`)
- [ ] Firestore plans initialized (check in Firebase Console)
- [ ] Price IDs updated in billing.ts
- [ ] Webhook endpoints created in Stripe Dashboard
- [ ] Functions deployed successfully
- [ ] Test payment works (dev only)
- [ ] Webhook events received

---

## 🆘 Quick Troubleshooting

**"Stripe secret key not configured"**
→ Run: `firebase functions:config:set stripe.secret_key="sk_..."`

**"Webhook secret not configured"**
→ Run: `firebase functions:config:set stripe.webhook_secret="whsec_..."`

**"Plans not showing"**
→ Run: `node scripts/verify-subscription-setup.js` to check Firestore

**"Wrong price ID"**
→ Update `getStripePlanMapping()` in `apps/functions/src/billing.ts`

---

For detailed instructions, see: **ACTIVATE_SUBSCRIPTION_SYSTEM.md**




