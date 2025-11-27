/**
 * Subscription Feature Gates (Backend)
 * 
 * Backend checks for subscription limits.
 * IMPORTANT: Meeting/recording limits are HOST-BASED.
 */

import * as admin from 'firebase-admin';

// Initialize db lazily to avoid initialization order issues
function getDb() {
  return admin.firestore();
}

// Subscription plan limits (must match web app config)
type SubscriptionTier = 'free' | 'pro' | 'business' | 'enterprise';
type SubscriptionStatus = 'active' | 'canceled' | 'trial' | 'inactive';

const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, {
  maxMeetingDurationMinutes: number;
  maxParticipantsPerMeeting: number;
  maxMeetingsPerMonth: number;
  recordingEnabled: boolean;
  maxRecordingMinutesPerMonth: number;
  maxStorageBytes: number;
  backgroundEffects: {
    userUploads: false | 'limited' | 'extended' | 'unlimited';
    videoBackgrounds: boolean;
  };
  chatFeatures: {
    maxFileSizeMB?: number;
  };
}> = {
  free: {
    maxMeetingDurationMinutes: 20,
    maxParticipantsPerMeeting: 6,
    maxMeetingsPerMonth: 20,
    recordingEnabled: false,
    maxRecordingMinutesPerMonth: 0,
    maxStorageBytes: 100 * 1024 * 1024, // 100MB
    backgroundEffects: { userUploads: false, videoBackgrounds: false },
    chatFeatures: {},
  },
  pro: {
    maxMeetingDurationMinutes: 120,
    maxParticipantsPerMeeting: 25,
    maxMeetingsPerMonth: 100,
    recordingEnabled: true,
    maxRecordingMinutesPerMonth: 120,
    maxStorageBytes: 1 * 1024 * 1024 * 1024, // 1GB
    backgroundEffects: { userUploads: 'limited', videoBackgrounds: false },
    chatFeatures: { maxFileSizeMB: 10 },
  },
  business: {
    maxMeetingDurationMinutes: 480,
    maxParticipantsPerMeeting: 100,
    maxMeetingsPerMonth: Infinity,
    recordingEnabled: true,
    maxRecordingMinutesPerMonth: 1200,
    maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10GB
    backgroundEffects: { userUploads: 'extended', videoBackgrounds: true },
    chatFeatures: { maxFileSizeMB: 50 },
  },
  enterprise: {
    maxMeetingDurationMinutes: Infinity,
    maxParticipantsPerMeeting: Infinity,
    maxMeetingsPerMonth: Infinity,
    recordingEnabled: true,
    maxRecordingMinutesPerMonth: Infinity,
    maxStorageBytes: Infinity,
    backgroundEffects: { userUploads: 'unlimited', videoBackgrounds: true },
    chatFeatures: { maxFileSizeMB: 100 },
  },
};

function getLimitsForTier(tier: SubscriptionTier) {
  return SUBSCRIPTION_LIMITS[tier] || SUBSCRIPTION_LIMITS.free;
}

function isWithinLimit(value: number, limit: number): boolean {
  if (limit === Infinity) return true;
  return value < limit;
}

function hasReachedLimit(value: number, limit: number): boolean {
  if (limit === Infinity) return false;
  return value >= limit;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export interface SubscriptionCheckResult {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
}

/**
 * Get user subscription data from Firestore
 */
export async function getUserSubscriptionData(userId: string): Promise<{
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: admin.firestore.Timestamp | null;
  usage: {
    totalMeetingMinutesThisMonth: number;
    totalRecordingMinutesThisMonth: number;
    storageUsedBytes: number;
    meetingsCountThisMonth: number;
  };
}> {
  const userRef = getDb().collection('users').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    throw new Error('User not found');
  }
  
  const userData = userDoc.data()!;
  const tier = (userData.subscriptionTier || 'free') as SubscriptionTier;
  const status = (userData.subscriptionStatus || 'active') as SubscriptionStatus;
  const expiresAt = userData.subscriptionExpiresAt || null;
  
  // Get or initialize usage (handles billing period rollover automatically)
  const { getUserUsage } = await import('./subscriptionTracking');
  const usage = await getUserUsage(userId);
  
  // Check if subscription is active
  const isActive = status === 'active' || status === 'trial';
  const isExpired = expiresAt && expiresAt.toDate() < new Date();
  
  return {
    subscriptionTier: tier,
    subscriptionStatus: isActive && !isExpired ? status : 'inactive',
    subscriptionExpiresAt: expiresAt,
    usage,
  };
}

/**
 * Check if subscription is active
 */
function isSubscriptionActive(
  status: SubscriptionStatus,
  expiresAt: admin.firestore.Timestamp | null
): boolean {
  if (status !== 'active' && status !== 'trial') {
    return false;
  }
  
  if (expiresAt && expiresAt.toDate() < new Date()) {
    return false;
  }
  
  return true;
}

/**
 * Check if host can start/create meeting
 */
export async function canHostStartMeeting(
  hostUserId: string,
  requestedDurationMinutes: number = 0
): Promise<SubscriptionCheckResult> {
  try {
    const subscription = await getUserSubscriptionData(hostUserId);
    
    if (!isSubscriptionActive(subscription.subscriptionStatus, subscription.subscriptionExpiresAt)) {
      return {
        allowed: false,
        reason: 'Your subscription is not active. Please renew your subscription.',
        upgradeRequired: false,
      };
    }
    
    const plan = getLimitsForTier(subscription.subscriptionTier);
    
    // Check meeting duration limit
    if (requestedDurationMinutes > 0 && !isWithinLimit(requestedDurationMinutes, plan.maxMeetingDurationMinutes)) {
      return {
        allowed: false,
        reason: `Meeting duration exceeds your plan limit of ${plan.maxMeetingDurationMinutes} minutes.`,
        upgradeRequired: true,
      };
    }
    
    // Check meetings per month limit
    if (hasReachedLimit(subscription.usage.meetingsCountThisMonth, plan.maxMeetingsPerMonth)) {
      return {
        allowed: false,
        reason: `You have reached your monthly meeting limit of ${plan.maxMeetingsPerMonth} meetings.`,
        upgradeRequired: true,
      };
    }
    
    return { allowed: true };
  } catch (error: any) {
    console.error('[Subscription] Error checking canHostStartMeeting:', error);
    // Fail open for now (allow meeting if check fails)
    return { allowed: true };
  }
}

/**
 * Check if participant can join (based on host's tier)
 */
export async function canParticipantJoin(
  hostUserId: string,
  currentParticipantCount: number
): Promise<SubscriptionCheckResult> {
  try {
    const hostSubscription = await getUserSubscriptionData(hostUserId);
    
    if (!isSubscriptionActive(hostSubscription.subscriptionStatus, hostSubscription.subscriptionExpiresAt)) {
      return {
        allowed: false,
        reason: 'The host\'s subscription is not active.',
        upgradeRequired: false,
      };
    }
    
    const plan = getLimitsForTier(hostSubscription.subscriptionTier);
    
    // Check participant limit
    if (hasReachedLimit(currentParticipantCount, plan.maxParticipantsPerMeeting)) {
      return {
        allowed: false,
        reason: `This meeting has reached the maximum number of participants (${plan.maxParticipantsPerMeeting}) for the host's plan.`,
        upgradeRequired: true,
      };
    }
    
    return { allowed: true };
  } catch (error: any) {
    console.error('[Subscription] Error checking canParticipantJoin:', error);
    // Fail open for now
    return { allowed: true };
  }
}

/**
 * Check if host can start recording
 */
export async function canHostStartRecording(
  hostUserId: string
): Promise<SubscriptionCheckResult> {
  try {
    const subscription = await getUserSubscriptionData(hostUserId);
    
    if (!isSubscriptionActive(subscription.subscriptionStatus, subscription.subscriptionExpiresAt)) {
      return {
        allowed: false,
        reason: 'Your subscription is not active.',
        upgradeRequired: false,
      };
    }
    
    const plan = getLimitsForTier(subscription.subscriptionTier);
    
    // Check if recording is enabled
    if (!plan.recordingEnabled) {
      return {
        allowed: false,
        reason: 'Recording is not available on your current plan.',
        upgradeRequired: true,
      };
    }
    
    // Check recording minutes limit
    if (hasReachedLimit(subscription.usage.totalRecordingMinutesThisMonth, plan.maxRecordingMinutesPerMonth)) {
      return {
        allowed: false,
        reason: `You have reached your monthly recording limit of ${plan.maxRecordingMinutesPerMonth} minutes.`,
        upgradeRequired: true,
      };
    }
    
    return { allowed: true };
  } catch (error: any) {
    console.error('[Subscription] Error checking canHostStartRecording:', error);
    // Fail open for now
    return { allowed: true };
  }
}

/**
 * Check if user can upload media (PERSONAL)
 */
export async function canUserUploadMedia(
  userId: string,
  fileSizeBytes: number,
  mediaType: 'backgroundImage' | 'backgroundVideo' | 'chatFile' | 'other'
): Promise<SubscriptionCheckResult> {
  try {
    const subscription = await getUserSubscriptionData(userId);
    
    if (!isSubscriptionActive(subscription.subscriptionStatus, subscription.subscriptionExpiresAt)) {
      return {
        allowed: false,
        reason: 'Your subscription is not active.',
        upgradeRequired: false,
      };
    }
    
    const plan = getLimitsForTier(subscription.subscriptionTier);
    
    // Check storage limit
    const newTotalStorage = subscription.usage.storageUsedBytes + fileSizeBytes;
    if (!isWithinLimit(newTotalStorage, plan.maxStorageBytes)) {
      return {
        allowed: false,
        reason: 'Upload would exceed your storage limit.',
        upgradeRequired: true,
      };
    }
    
    // Check background effects permissions
    if (mediaType === 'backgroundImage' || mediaType === 'backgroundVideo') {
      if (plan.backgroundEffects.userUploads === false) {
        return {
          allowed: false,
          reason: 'Background uploads are not available on your current plan.',
          upgradeRequired: true,
        };
      }
      
      if (mediaType === 'backgroundVideo' && !plan.backgroundEffects.videoBackgrounds) {
        return {
          allowed: false,
          reason: 'Video backgrounds are not available on your current plan.',
          upgradeRequired: true,
        };
      }
    }
    
    // Check file size limit for chat files
    if (mediaType === 'chatFile' && plan.chatFeatures.maxFileSizeMB) {
      const maxBytes = plan.chatFeatures.maxFileSizeMB * 1024 * 1024;
      if (fileSizeBytes > maxBytes) {
        return {
          allowed: false,
          reason: `File size exceeds the limit of ${plan.chatFeatures.maxFileSizeMB}MB for your plan.`,
          upgradeRequired: true,
        };
      }
    }
    
    return { allowed: true };
  } catch (error: any) {
    console.error('[Subscription] Error checking canUserUploadMedia:', error);
    // Fail open for now
    return { allowed: true };
  }
}
