/**
 * Subscription Usage Tracking Service (Backend)
 * 
 * Tracks usage for meetings, recordings, and storage.
 * IMPORTANT: Meeting and recording usage is HOST-BASED.
 * Storage usage is PERSONAL.
 */

import * as admin from 'firebase-admin';

// Initialize db lazily to avoid initialization order issues
function getDb() {
  return admin.firestore();
}


/**
 * Initialize usage object for new billing period
 */
function initializeUsage(): any {
  return {
    totalMeetingMinutesThisMonth: 0,
    totalRecordingMinutesThisMonth: 0,
    storageUsedBytes: 0,
    meetingsCountThisMonth: 0,
  };
}

export interface UsageUpdate {
  totalMeetingMinutesThisMonth?: number;
  totalRecordingMinutesThisMonth?: number;
  storageUsedBytes?: number;
  meetingsCountThisMonth?: number;
}

/**
 * Check if billing period has ended
 */
function shouldResetUsage(billingPeriodEndAt: admin.firestore.Timestamp | null | undefined): boolean {
  if (!billingPeriodEndAt) return true;
  const endDate = billingPeriodEndAt.toDate();
  return new Date() > endDate;
}

/**
 * Calculate next billing period dates
 */
function calculateNextBillingPeriod(): { startAt: Date; endAt: Date } {
  const now = new Date();
  const startAt = new Date(now);
  const endAt = new Date(now);
  endAt.setMonth(endAt.getMonth() + 1);
  return { startAt, endAt };
}

/**
 * Calculate next billing period from an existing end date
 */
function calculateNextBillingPeriodFromEnd(previousEndAt: Date): { startAt: Date; endAt: Date } {
  const startAt = new Date(previousEndAt);
  const endAt = new Date(previousEndAt);
  endAt.setMonth(endAt.getMonth() + 1);
  return { startAt, endAt };
}

/**
 * Get or initialize usage for a user
 * Handles billing period rollover automatically
 */
export async function getUserUsage(userId: string): Promise<any> {
  const userRef = getDb().collection('users').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    throw new Error('User not found');
  }
  
  const userData = userDoc.data();
  let usage = userData?.usage;
  let billingPeriodStartAt = userData?.billingPeriodStartAt || null;
  let billingPeriodEndAt = userData?.billingPeriodEndAt || null;
  
  // Check if billing period has ended and needs rollover
  if (shouldResetUsage(billingPeriodEndAt)) {
    // Roll over to new billing period
    if (billingPeriodEndAt) {
      const previousEnd = billingPeriodEndAt.toDate();
      const nextPeriod = calculateNextBillingPeriodFromEnd(previousEnd);
      billingPeriodStartAt = admin.firestore.Timestamp.fromDate(nextPeriod.startAt);
      billingPeriodEndAt = admin.firestore.Timestamp.fromDate(nextPeriod.endAt);
    } else {
      // No previous period - start new one from now
      const nextPeriod = calculateNextBillingPeriod();
      billingPeriodStartAt = admin.firestore.Timestamp.fromDate(nextPeriod.startAt);
      billingPeriodEndAt = admin.firestore.Timestamp.fromDate(nextPeriod.endAt);
    }
    
    // Reset usage counters for new billing period
    usage = {
      totalMeetingMinutesThisMonth: 0,
      totalRecordingMinutesThisMonth: 0,
      storageUsedBytes: usage?.storageUsedBytes || 0, // Keep storage (doesn't reset)
      meetingsCountThisMonth: 0,
    };
    
    // Update user document with new billing period and reset usage
    await userRef.update({
      usage,
      billingPeriodStartAt,
      billingPeriodEndAt,
    });
  } else if (!usage) {
    // Initialize if missing
    usage = initializeUsage();
    
    // Initialize billing period if missing
    if (!billingPeriodStartAt || !billingPeriodEndAt) {
      const nextPeriod = calculateNextBillingPeriod();
      billingPeriodStartAt = admin.firestore.Timestamp.fromDate(nextPeriod.startAt);
      billingPeriodEndAt = admin.firestore.Timestamp.fromDate(nextPeriod.endAt);
    }
    
    await userRef.update({
      usage,
      billingPeriodStartAt,
      billingPeriodEndAt,
    });
  }
  
  return usage;
}

/**
 * Update usage for a user (atomic increment)
 * Note: getUserUsage already handles billing period rollover, so we can safely increment
 */
export async function updateUsage(
  userId: string,
  updates: UsageUpdate
): Promise<void> {
  // Ensure billing period is up to date (handles rollover if needed)
  await getUserUsage(userId);
  
  // Atomic increment for usage
  const userRef = getDb().collection('users').doc(userId);
  const updateData: any = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      updateData[`usage.${key}`] = admin.firestore.FieldValue.increment(value || 0);
    }
  }
  await userRef.update(updateData);
}

/**
 * Track meeting duration for HOST (HOST-BASED)
 * Call this when a meeting ends
 */
export async function trackMeetingDuration(
  hostUserId: string,
  durationMinutes: number
): Promise<void> {
  if (durationMinutes <= 0) return;
  
  await updateUsage(hostUserId, {
    totalMeetingMinutesThisMonth: durationMinutes,
    meetingsCountThisMonth: 1,
  });
  
  console.log(`[Subscription] Tracked ${durationMinutes} meeting minutes for host ${hostUserId}`);
}

/**
 * Track recording duration for HOST (HOST-BASED)
 * Call this when a recording ends
 */
export async function trackRecordingDuration(
  hostUserId: string,
  durationMinutes: number
): Promise<void> {
  if (durationMinutes <= 0) return;
  
  await updateUsage(hostUserId, {
    totalRecordingMinutesThisMonth: durationMinutes,
  });
  
  console.log(`[Subscription] Tracked ${durationMinutes} recording minutes for host ${hostUserId}`);
}

/**
 * Track storage usage for USER (PERSONAL)
 * Call this when a user uploads a file
 */
export async function trackStorageUsage(
  userId: string,
  fileSizeBytes: number
): Promise<void> {
  if (fileSizeBytes <= 0) return;
  
  await updateUsage(userId, {
    storageUsedBytes: fileSizeBytes,
  });
  
  console.log(`[Subscription] Tracked ${fileSizeBytes} bytes storage for user ${userId}`);
}

/**
 * Remove storage usage when file is deleted (PERSONAL)
 */
export async function removeStorageUsage(
  userId: string,
  fileSizeBytes: number
): Promise<void> {
  if (fileSizeBytes <= 0) return;
  
  await updateUsage(userId, {
    storageUsedBytes: -fileSizeBytes, // Negative increment
  });
  
  console.log(`[Subscription] Removed ${fileSizeBytes} bytes storage for user ${userId}`);
}

/**
 * Get user subscription data
 */
export async function getUserSubscription(userId: string): Promise<{
  subscriptionTier: string;
  subscriptionStatus: string;
  subscriptionExpiresAt: admin.firestore.Timestamp | null;
  usage: any;
}> {
  const userRef = getDb().collection('users').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    throw new Error('User not found');
  }
  
  const userData = userDoc.data();
  const usage = await getUserUsage(userId);
  
  return {
    subscriptionTier: userData?.subscriptionTier || 'free',
    subscriptionStatus: userData?.subscriptionStatus || 'active',
    subscriptionExpiresAt: userData?.subscriptionExpiresAt || null,
    usage,
  };
}

/**
 * Initialize subscription for new user
 * Sets up billing period starting from now
 */
export async function initializeUserSubscription(userId: string): Promise<void> {
  const userRef = getDb().collection('users').doc(userId);
  const usage = initializeUsage();
  const billingPeriod = calculateNextBillingPeriod();
  
  await userRef.set({
    subscriptionTier: 'free',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: null,
    billingPeriodStartAt: admin.firestore.Timestamp.fromDate(billingPeriod.startAt),
    billingPeriodEndAt: admin.firestore.Timestamp.fromDate(billingPeriod.endAt),
    usage,
  }, { merge: true });
  
  console.log(`[Subscription] Initialized free subscription for user ${userId} with billing period starting ${billingPeriod.startAt.toISOString()}`);
}

