/**
 * useSubscription Hook
 * 
 * Provides subscription data and feature checks for components.
 */

import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getSubscriptionFromProfile,
  isSubscriptionActive,
  getUserPlanSync,
  canStartMeeting,
  canStartRecording,
  canUploadMedia,
  canUsePrivateChat,
  canScheduleMeeting,
  canUseRecurringMeetings,
  canUseViewMode,
  canUseBackgroundEffect,
  type UserSubscription,
} from '../lib/subscriptionService';
import type { SubscriptionPlan } from '../lib/subscriptionPlans';

export interface UseSubscriptionReturn {
  subscription: UserSubscription | null;
  plan: SubscriptionPlan | null;
  isActive: boolean;
  // Feature checks
  canStartMeeting: (requestedDurationMinutes?: number) => { allowed: boolean; reason?: string; upgradeRequired?: boolean };
  canJoinParticipant: (hostUserId: string, currentParticipantCount: number) => Promise<{ allowed: boolean; reason?: string; upgradeRequired?: boolean }>;
  canStartRecording: () => { allowed: boolean; reason?: string; upgradeRequired?: boolean };
  canUploadMedia: (fileSizeBytes: number, mediaType: 'backgroundImage' | 'backgroundVideo' | 'chatFile' | 'other') => { allowed: boolean; reason?: string; upgradeRequired?: boolean };
  canUsePrivateChat: () => boolean;
  canScheduleMeeting: () => boolean;
  canUseRecurringMeetings: () => boolean;
  canUseViewMode: (viewMode: string) => boolean;
  canUseBackgroundEffect: (effectType: 'blur' | 'image' | 'video') => boolean;
  // Usage data
  usage: UserSubscription['usage'] | null;
}

/**
 * Hook to access subscription data and feature checks
 */
export function useSubscription(): UseSubscriptionReturn {
  const { userProfile } = useAuth();

  const subscription = useMemo(() => {
    if (!userProfile) return null;
    return getSubscriptionFromProfile(userProfile);
  }, [userProfile]);

  const plan = useMemo(() => {
    if (!subscription) return null;
    return getUserPlanSync(subscription);
  }, [subscription]);

  const isActive = useMemo(() => {
    if (!subscription) return false;
    return isSubscriptionActive(subscription);
  }, [subscription]);

  // Feature check functions
  const featureChecks = useMemo(() => {
    if (!subscription) {
      // Return no-op functions if no subscription
      return {
        canStartMeeting: () => ({ allowed: false, reason: 'Not authenticated' }),
        canStartRecording: () => ({ allowed: false, reason: 'Not authenticated' }),
        canUploadMedia: () => ({ allowed: false, reason: 'Not authenticated' }),
        canUsePrivateChat: (): boolean => false,
        canScheduleMeeting: (): boolean => false,
        canUseRecurringMeetings: (): boolean => false,
        canUseViewMode: () => false,
        canUseBackgroundEffect: () => false,
      };
    }

    return {
      canStartMeeting: (requestedDurationMinutes?: number) => 
        canStartMeeting(subscription, requestedDurationMinutes || 0),
      canStartRecording: () => 
        canStartRecording(subscription),
      canUploadMedia: (fileSizeBytes: number, mediaType: 'backgroundImage' | 'backgroundVideo' | 'chatFile' | 'other') =>
        canUploadMedia(subscription, fileSizeBytes, mediaType),
      canUsePrivateChat: (): boolean => canUsePrivateChat(subscription),
      canScheduleMeeting: (): boolean => canScheduleMeeting(subscription),
      canUseRecurringMeetings: (): boolean => canUseRecurringMeetings(subscription),
      canUseViewMode: (viewMode: string): boolean => canUseViewMode(subscription, viewMode),
      canUseBackgroundEffect: (effectType: 'blur' | 'image' | 'video'): boolean =>
        canUseBackgroundEffect(subscription, effectType),
    };
  }, [subscription]);

  // Note: canJoinParticipant requires host data, so it's async and handled differently
  const canJoinParticipantCheck = async (_hostUserId: string, _currentParticipantCount: number) => {
    // This would need to fetch host subscription from backend
    // For now, return a stub that would be implemented with API call
    return { allowed: true };
  };

  return {
    subscription,
    plan: plan as SubscriptionPlan | null, // plan is async but we use sync version
    isActive,
    ...featureChecks,
    canJoinParticipant: canJoinParticipantCheck,
    usage: subscription?.usage || null,
  };
}

