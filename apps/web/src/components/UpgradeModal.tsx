/**
 * Upgrade Modal Component
 * 
 * Shows upgrade prompt when user hits subscription limits.
 * Uses editable texts from Firestore with fallback to defaults.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUpgradeModalTexts, getAllSubscriptionPlanConfigs, type UpgradeModalTexts, type SubscriptionPlanConfig } from '../lib/subscriptionPlansService';
import { SubscriptionTier } from '../lib/subscriptionPlans';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  reasonCode?: string; // e.g., 'limit_meeting_duration', 'limit_participants', etc.
  feature?: string;
  currentTier?: 'free' | 'pro' | 'business' | 'enterprise';
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  title: propTitle,
  message: propMessage,
  reasonCode,
  feature,
  currentTier = 'free',
}) => {
  const navigate = useNavigate();
  const [modalTexts, setModalTexts] = useState<UpgradeModalTexts | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadModalData();
    }
  }, [isOpen]);

  const loadModalData = async () => {
    setLoading(true);
    try {
      const [texts, plansData] = await Promise.all([
        getUpgradeModalTexts(),
        getAllSubscriptionPlanConfigs(),
      ]);
      setModalTexts(texts);
      // Sort plans by sortOrder
      const sortedPlans = plansData.sort((a, b) => a.sortOrder - b.sortOrder);
      setPlans(sortedPlans);
      // Auto-select next tier if current tier is free
      if (currentTier === 'free' && sortedPlans.length > 1) {
        setSelectedTier('pro');
      } else if (currentTier === 'pro' && sortedPlans.length > 2) {
        setSelectedTier('business');
      } else if (currentTier === 'business' && sortedPlans.length > 3) {
        setSelectedTier('enterprise');
      }
    } catch (error) {
      console.error('[UpgradeModal] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Determine title and message
  const getTitle = (): string => {
    if (propTitle) return propTitle;
    if (modalTexts && reasonCode && modalTexts.reasons?.[reasonCode]?.title) {
      return modalTexts.reasons[reasonCode].title!;
    }
    return modalTexts?.defaultTitle || "You've reached your plan limit";
  };

  const getMessage = (): string => {
    if (propMessage) return propMessage;
    if (modalTexts && reasonCode && modalTexts.reasons?.[reasonCode]?.message) {
      return modalTexts.reasons[reasonCode].message!;
    }
    return modalTexts?.defaultMessage || 'Upgrade to unlock this feature and more.';
  };

  if (!isOpen) return null;

  const title = loading ? "You've reached your plan limit" : getTitle();
  const message = loading ? 'Upgrade to unlock this feature and more.' : getMessage();

  const handleUpgrade = (tier?: SubscriptionTier) => {
    const targetTier = tier || selectedTier;
    if (!targetTier) {
      onClose();
      return;
    }
    // Navigate to pricing page
    onClose();
    navigate(`/pricing?tier=${targetTier}`);
  };

  const formatDuration = (minutes: number): string => {
    if (minutes === Infinity) return 'Unlimited';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} hr`;
    return `${hours} hr ${mins} min`;
  };

  const formatStorage = (bytes: number): string => {
    if (bytes === Infinity) return 'Unlimited';
    const GB = bytes / (1024 * 1024 * 1024);
    const MB = bytes / (1024 * 1024);
    if (GB >= 1) return `${GB.toFixed(1)} GB`;
    return `${MB.toFixed(0)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl w-full max-w-6xl my-8">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-goldBright/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-goldBright" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-cloud">{title}</h2>
                {feature && (
                  <p className="text-cloud/70 text-sm mt-1">Feature: {feature}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-cloud/60 hover:text-cloud transition-colors p-2 hover:bg-white/10 rounded-lg"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-cloud/80 mb-6">{message}</p>

          {/* Current Tier Badge */}
          <div className="mb-6 p-4 bg-midnight/60 rounded-lg border border-white/10 inline-block">
            <p className="text-cloud/70 text-sm mb-1">Current Plan</p>
            <p className="text-cloud font-semibold capitalize">{currentTier}</p>
          </div>

          {/* All Subscription Tiers */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-goldBright"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {plans.map((plan) => {
                const isCurrentTier = plan.tierKey === currentTier;
                const isSelected = plan.tierKey === selectedTier;
                const isUpgrade = ['pro', 'business', 'enterprise'].includes(plan.tierKey) && 
                                 ['free', 'pro', 'business'].includes(currentTier) &&
                                 (plan.tierKey === 'pro' && currentTier === 'free' ||
                                  plan.tierKey === 'business' && ['free', 'pro'].includes(currentTier) ||
                                  plan.tierKey === 'enterprise');
                
                return (
                  <div
                    key={plan.tierKey}
                    onClick={() => !isCurrentTier && setSelectedTier(plan.tierKey)}
                    className={`relative p-6 rounded-xl border-2 transition-all cursor-pointer ${
                      isCurrentTier
                        ? 'bg-midnight/80 border-goldBright/50'
                        : isSelected
                        ? 'bg-techBlue/20 border-techBlue'
                        : 'bg-midnight/40 border-white/10 hover:border-white/30'
                    }`}
                  >
                    {/* Recommended Badge */}
                    {plan.isRecommended && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-goldBright text-midnight text-xs font-bold px-3 py-1 rounded-full">
                          Recommended
                        </span>
                      </div>
                    )}

                    {/* Current Badge */}
                    {isCurrentTier && (
                      <div className="absolute -top-3 right-3">
                        <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
                          Current
                        </span>
                      </div>
                    )}

                    {/* Plan Header */}
                    <div className="text-center mb-4">
                      <h3 className="text-xl font-bold text-cloud mb-1">{plan.displayName}</h3>
                      <p className="text-cloud/60 text-xs mb-2">{plan.tagline}</p>
                      <div className="text-2xl font-bold text-goldBright mb-1">
                        {plan.displayPrice}
                        {plan.tierKey !== 'free' && (
                          <span className="text-sm font-normal text-cloud/60">/month</span>
                        )}
                      </div>
                      {plan.tierKey === 'enterprise' && (
                        <p className="text-cloud/50 text-xs">or Contact Sales</p>
                      )}
                    </div>

                    {/* Plan Features */}
                    <div className="space-y-2 mb-4">
                      <div className="text-cloud/80 text-xs">
                        <span className="font-semibold">Duration:</span>{' '}
                        {formatDuration(plan.limits.maxMeetingDurationMinutes)}
                      </div>
                      <div className="text-cloud/80 text-xs">
                        <span className="font-semibold">Participants:</span>{' '}
                        {plan.limits.maxParticipantsPerMeeting === Infinity 
                          ? 'Unlimited' 
                          : plan.limits.maxParticipantsPerMeeting}
                      </div>
                      <div className="text-cloud/80 text-xs">
                        <span className="font-semibold">Recording:</span>{' '}
                        {plan.limits.recordingEnabled ? 'Enabled' : 'Disabled'}
                      </div>
                      {plan.limits.recordingEnabled && (
                        <div className="text-cloud/80 text-xs">
                          <span className="font-semibold">Recording:</span>{' '}
                          {formatDuration(plan.limits.maxRecordingMinutesPerMonth)}/month
                        </div>
                      )}
                      <div className="text-cloud/80 text-xs">
                        <span className="font-semibold">Storage:</span>{' '}
                        {formatStorage(plan.limits.maxStorageBytes)}
                      </div>
                      <div className="text-cloud/80 text-xs">
                        <span className="font-semibold">Video Backgrounds:</span>{' '}
                        {plan.limits.backgroundEffects.videoBackgrounds ? 'Yes' : 'No'}
                      </div>
                      {/* Additional Features */}
                      {plan.tierKey === 'pro' && (
                        <div className="text-cloud/80 text-xs mt-2 pt-2 border-t border-white/10">
                          <span className="font-semibold">✓</span> Private chat & file sharing
                        </div>
                      )}
                      {plan.tierKey === 'business' && (
                        <div className="text-cloud/80 text-xs mt-2 pt-2 border-t border-white/10">
                          <span className="font-semibold">✓</span> Advanced scheduling
                        </div>
                      )}
                      {plan.tierKey === 'enterprise' && (
                        <div className="text-cloud/80 text-xs mt-2 pt-2 border-t border-white/10">
                          <span className="font-semibold">✓</span> Dedicated support & custom onboarding
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    {isCurrentTier ? (
                      <button
                        disabled
                        className="w-full py-2 px-4 bg-white/5 text-cloud/50 rounded-lg text-sm font-medium cursor-not-allowed"
                      >
                        Current Plan
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpgrade(plan.tierKey);
                        }}
                        className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition-colors ${
                          isSelected
                            ? 'bg-goldBright text-midnight hover:bg-yellow-400'
                            : 'bg-white/10 text-cloud hover:bg-white/20'
                        }`}
                      >
                        {isUpgrade ? 'Upgrade' : 'Select'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white/5 text-cloud rounded-lg hover:bg-white/10 transition-colors font-medium"
          >
            Maybe Later
          </button>
          {selectedTier && selectedTier !== currentTier && (
            <button
              onClick={() => handleUpgrade()}
              className="flex-1 px-4 py-3 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold"
            >
              Upgrade to {plans.find(p => p.tierKey === selectedTier)?.displayName || selectedTier}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;

