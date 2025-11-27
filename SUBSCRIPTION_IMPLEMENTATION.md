# Subscription Foundation Implementation

## Overview
A comprehensive subscription system has been implemented for Habs Meet with 4 tiers: Free, Pro, Business, and Enterprise. All limits are configurable and the system is designed to be modular and easy to extend.

## Key Features Implemented

### 1. Data Model & User Fields
- **User Profile Fields Added:**
  - `subscriptionTier`: "free" | "pro" | "business" | "enterprise"
  - `subscriptionStatus`: "active" | "canceled" | "trial" | "inactive"
  - `subscriptionExpiresAt`: Firestore Timestamp | null
  - `stripeCustomerId`: string (for Stripe integration)
  - `usage`: Object containing:
    - `totalMeetingMinutesThisMonth`: number
    - `totalRecordingMinutesThisMonth`: number
    - `storageUsedBytes`: number
    - `meetingsCountThisMonth`: number
    - `usageMonthKey`: string (format: "YYYY-MM")

- **Default Values:**
  - New users automatically get `subscriptionTier: "free"` and `subscriptionStatus: "active"`
  - Usage counters initialize at 0
  - Monthly reset handled automatically via `usageMonthKey`

### 2. Configuration System
**File:** `apps/web/src/lib/subscriptionPlans.ts`

All subscription limits are defined in a central, easily editable configuration file:
- Meeting limits (duration, participants, meetings per month)
- Recording limits (enabled/disabled, minutes per month)
- Storage limits (bytes)
- Feature flags (background effects, chat features, scheduling, etc.)

**Key Functions:**
- `getLimitsForTier(tier)`: Get plan limits for a specific tier
- `getDefaultTier()`: Returns "free"
- `isWithinLimit(value, limit)`: Check if value is within limit (handles Infinity)
- `hasReachedLimit(value, limit)`: Check if limit is reached

### 3. Usage Tracking System
**Files:**
- `apps/functions/src/subscriptionTracking.ts` (Backend)
- `apps/web/src/lib/subscriptionService.ts` (Frontend)

**Host-Based Tracking (Meetings & Recordings):**
- Meeting duration tracked for HOST only when meeting ends
- Recording duration tracked for HOST only when recording ends
- Participants do NOT increase host's usage

**Personal Tracking (Storage):**
- Storage usage tracked per user when files are uploaded
- Storage decremented when files are deleted

**Monthly Reset:**
- Automatic reset via `usageMonthKey` comparison
- Usage resets to 0 at the start of each new month

### 4. Feature Gating (Backend)
**File:** `apps/functions/src/subscriptionChecks.ts`

**Host-Based Checks:**
- `canHostStartMeeting(hostUserId, requestedDurationMinutes)`: Check if host can create/start meeting
- `canParticipantJoin(hostUserId, currentParticipantCount)`: Check participant limit based on host's tier
- `canHostStartRecording(hostUserId)`: Check if host can start recording

**Personal Checks:**
- `canUserUploadMedia(userId, fileSizeBytes, mediaType)`: Check storage and feature limits

**Integration Points:**
- `getMeetingToken`: Checks participant limits before allowing join
- `getRoomGuard`: Checks participant limits
- `createScheduledMeeting`: Checks host limits before creating meeting
- `livekitWebhook`: Tracks meeting and recording duration when events occur

### 5. Feature Gating (Frontend)
**File:** `apps/web/src/hooks/useSubscription.ts`

React hook providing subscription data and feature checks:
```typescript
const {
  subscription,
  plan,
  isActive,
  canStartMeeting,
  canStartRecording,
  canUploadMedia,
  canUsePrivateChat,
  canScheduleMeeting,
  // ... more checks
} = useSubscription();
```

**Integration Points:**
- `HomePage.tsx`: Checks before creating meeting
- `RoomPage.tsx`: Checks before starting recording
- `BackgroundEffectsPanel.tsx`: Checks before uploading files
- `fileStorageService.ts`: Checks storage limits before upload

### 6. Stripe Integration (Stubs)
**File:** `apps/functions/src/billing.ts`

**Endpoints:**
- `POST /api/billing/create-checkout-session`: Create Stripe checkout session
- `POST /api/billing/webhook`: Handle Stripe webhook events

**Webhook Events Handled:**
- `checkout.session.completed`: Update subscription on successful payment
- `customer.subscription.updated`: Handle plan upgrades/downgrades
- `customer.subscription.deleted`: Set user to free tier on cancellation

**Note:** Stripe integration is stubbed. To activate:
1. Install Stripe SDK: `npm install stripe`
2. Configure Stripe secret key in Firebase Functions config
3. Uncomment Stripe code in `billing.ts`
4. Set up webhook endpoint in Stripe dashboard

### 7. Admin Dashboard Separation
- **Platform Owner Admin:** Completely separate from subscription system
- Admin access remains role-based (`role: 'admin' | 'superadmin'`)
- No subscription checks for admin features
- Future org dashboards (Business/Enterprise) will be a separate system

## Important Design Decisions

### Host-Based vs Personal Limits
- **Host-Based (Meetings/Recordings):**
  - Only the host's subscription tier matters
  - Participants don't need subscriptions to join
  - Host's plan covers all participants
  - Usage tracked for host only

- **Personal (Storage/Features):**
  - Each user's own tier applies
  - Background uploads, storage, chat features are personal
  - Users can have different tiers in the same meeting

### Fail-Open Strategy
- Backend subscription checks use "fail-open" approach
- If subscription check fails (error), action is allowed
- This prevents blocking users due to system errors
- Logs errors for debugging
- Frontend shows errors but doesn't block (backend is source of truth)

### Monthly Reset
- Usage automatically resets via `usageMonthKey` comparison
- Format: "YYYY-MM" (e.g., "2024-01")
- Reset happens when `usageMonthKey` doesn't match current month
- No manual intervention required

## Configuration Examples

### Free Tier Limits
```typescript
{
  maxMeetingDurationMinutes: 20,
  maxParticipantsPerMeeting: 6,
  maxMeetingsPerMonth: 20,
  recordingEnabled: false,
  maxStorageBytes: 100 * MB, // 100MB
  backgroundEffects: {
    blur: true,
    defaultImages: 'basic',
    userUploads: false,
    videoBackgrounds: false,
  }
}
```

### Pro Tier Limits
```typescript
{
  maxMeetingDurationMinutes: 120,
  maxParticipantsPerMeeting: 25,
  maxMeetingsPerMonth: 100,
  recordingEnabled: true,
  maxRecordingMinutesPerMonth: 120,
  maxStorageBytes: 1 * GB, // 1GB
  backgroundEffects: {
    blur: true,
    defaultImages: 'standard',
    userUploads: 'limited',
    videoBackgrounds: false,
  }
}
```

## Usage Examples

### Check if User Can Start Meeting
```typescript
import { useSubscription } from '../hooks/useSubscription';

const { canStartMeeting } = useSubscription();
const check = canStartMeeting(60); // 60 minutes requested
if (!check.allowed) {
  toast.error(check.reason);
  // Show upgrade modal if check.upgradeRequired
}
```

### Check if User Can Upload File
```typescript
import { canUploadMedia, getSubscriptionFromProfile } from '../lib/subscriptionService';

const subscription = getSubscriptionFromProfile(userProfile);
const check = canUploadMedia(subscription, file.size, 'backgroundImage');
if (!check.allowed) {
  throw new Error(check.reason);
}
```

### Track Meeting Duration (Backend)
```typescript
import { trackMeetingDuration } from './subscriptionTracking';

// When meeting ends
await trackMeetingDuration(hostUserId, durationMinutes);
```

## Next Steps

1. **Complete Stripe Integration:**
   - Install Stripe SDK
   - Configure Stripe keys
   - Uncomment Stripe code in `billing.ts`
   - Set up webhook endpoint

2. **Add Storage Tracking:**
   - Add Cloud Function trigger for Firebase Storage uploads
   - Call `trackStorageUsage` when files are uploaded
   - Call `removeStorageUsage` when files are deleted

3. **Create Upgrade UI:**
   - Build subscription/billing page
   - Show plan comparison
   - Integrate with Stripe checkout
   - Show usage statistics

4. **Add Usage Dashboard:**
   - Display current usage vs limits
   - Show monthly reset countdown
   - Visual progress indicators

5. **Testing:**
   - Test all subscription checks
   - Verify usage tracking accuracy
   - Test monthly reset
   - Test edge cases (Infinity limits, expired subscriptions)

## Files Modified/Created

### Created:
- `apps/web/src/lib/subscriptionPlans.ts`
- `apps/web/src/lib/subscriptionService.ts`
- `apps/web/src/hooks/useSubscription.ts`
- `apps/web/src/components/UpgradeModal.tsx`
- `apps/functions/src/subscriptionTracking.ts`
- `apps/functions/src/subscriptionChecks.ts`
- `apps/functions/src/billing.ts`

### Modified:
- `apps/web/src/contexts/AuthContext.tsx` (added subscription fields)
- `apps/web/src/pages/HomePage.tsx` (added meeting creation check)
- `apps/web/src/pages/RoomPage.tsx` (added recording check)
- `apps/web/src/components/BackgroundEffectsPanel.tsx` (added upload check)
- `apps/web/src/lib/fileStorageService.ts` (added upload check)
- `apps/functions/src/index.ts` (added subscription checks and tracking)

## Notes

- All prices are managed in Stripe, not hard-coded
- Admin dashboard remains completely separate
- System is designed to be easily extensible
- Monthly reset is automatic
- Host-based limits ensure participants don't need subscriptions

