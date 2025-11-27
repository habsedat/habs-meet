/**
 * Subscription Settings Tab Component
 * 
 * Admin-only UI for editing subscription plans, pricing, and upgrade modal texts.
 */

import React, { useState, useEffect } from 'react';
import {
  getAllSubscriptionPlanConfigs,
  saveSubscriptionPlanConfig,
  getPricingPageTexts,
  savePricingPageTexts,
  getUpgradeModalTexts,
  saveUpgradeModalTexts,
  getUpgradeButtonTexts,
  saveUpgradeButtonTexts,
  type SubscriptionPlanConfig,
  type PricingPageTexts,
  type UpgradeModalTexts,
  type UpgradeButtonTexts,
} from '../lib/subscriptionPlansService';
import { SubscriptionTier } from '../lib/subscriptionPlans';
import toast from '../lib/toast';

const SubscriptionSettingsTab: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlanConfig[]>([]);
  const [pricingTexts, setPricingTexts] = useState<PricingPageTexts | null>(null);
  const [upgradeModalTexts, setUpgradeModalTexts] = useState<UpgradeModalTexts | null>(null);
  const [upgradeButtonTexts, setUpgradeButtonTexts] = useState<UpgradeButtonTexts>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'plans' | 'pricing' | 'upgrade' | 'button'>('plans');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plansData, pricingData, upgradeData, buttonTexts] = await Promise.all([
        getAllSubscriptionPlanConfigs(),
        getPricingPageTexts(),
        getUpgradeModalTexts(),
        getUpgradeButtonTexts(),
      ]);
      setPlans(plansData);
      setPricingTexts(pricingData);
      setUpgradeModalTexts(upgradeData);
      setUpgradeButtonTexts(buttonTexts || {});
    } catch (error) {
      console.error('Error loading subscription settings:', error);
      toast.error('Failed to load subscription settings');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = (tier: SubscriptionTier, field: string, value: any) => {
    setPlans(prev => prev.map(plan => {
      if (plan.tierKey === tier) {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          const parentKey = parent as keyof typeof plan.limits;
          const parentValue = plan.limits[parentKey];
          if (typeof parentValue === 'object' && parentValue !== null) {
            return {
              ...plan,
              limits: {
                ...plan.limits,
                [parent]: {
                  ...parentValue,
                  [child]: value,
                },
              },
            };
          }
          return plan;
        } else if (field === 'limits') {
          return { ...plan, limits: { ...plan.limits, ...value } };
        } else {
          return { ...plan, [field]: value };
        }
      }
      return plan;
    }));
  };

  const handleSavePlans = async () => {
    setSaving(true);
    try {
      await Promise.all(plans.map(plan => saveSubscriptionPlanConfig(plan)));
      toast.success('Subscription plans saved successfully');
    } catch (error: any) {
      console.error('Error saving plans:', error);
      toast.error('Failed to save subscription plans: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePricingTexts = async () => {
    if (!pricingTexts) return;
    setSaving(true);
    try {
      await savePricingPageTexts(pricingTexts);
      toast.success('Pricing page texts saved successfully');
    } catch (error: any) {
      console.error('Error saving pricing texts:', error);
      toast.error('Failed to save pricing texts: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUpgradeTexts = async () => {
    if (!upgradeModalTexts) return;
    setSaving(true);
    try {
      await saveUpgradeModalTexts(upgradeModalTexts);
      toast.success('Upgrade modal texts saved successfully');
    } catch (error: any) {
      console.error('Error saving upgrade texts:', error);
      toast.error('Failed to save upgrade texts: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveButtonTexts = async () => {
    setSaving(true);
    try {
      await saveUpgradeButtonTexts(upgradeButtonTexts);
      toast.success('Upgrade button texts saved successfully');
    } catch (error: any) {
      console.error('Error saving button texts:', error);
      toast.error('Failed to save button texts: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === Infinity) return 'Unlimited';
    const GB = bytes / (1024 * 1024 * 1024);
    const MB = bytes / (1024 * 1024);
    if (GB >= 1) return `${GB.toFixed(1)} GB`;
    return `${MB.toFixed(0)} MB`;
  };

  const parseBytes = (value: string): number => {
    if (value.toLowerCase().includes('unlimited') || value === 'Infinity') return Infinity;
    const num = parseFloat(value);
    if (value.toLowerCase().includes('gb')) return num * 1024 * 1024 * 1024;
    if (value.toLowerCase().includes('mb')) return num * 1024 * 1024;
    return num;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-goldBright"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Section Tabs */}
      <div className="mb-6 flex gap-4 border-b border-white/10">
        <button
          onClick={() => setActiveSection('plans')}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeSection === 'plans'
              ? 'text-goldBright border-b-2 border-goldBright'
              : 'text-cloud/60 hover:text-cloud'
          }`}
        >
          Plan Settings
        </button>
        <button
          onClick={() => setActiveSection('pricing')}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeSection === 'pricing'
              ? 'text-goldBright border-b-2 border-goldBright'
              : 'text-cloud/60 hover:text-cloud'
          }`}
        >
          Pricing Page Texts
        </button>
        <button
          onClick={() => setActiveSection('upgrade')}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeSection === 'upgrade'
              ? 'text-goldBright border-b-2 border-goldBright'
              : 'text-cloud/60 hover:text-cloud'
          }`}
        >
          Upgrade Modal Texts
        </button>
        <button
          onClick={() => setActiveSection('button')}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeSection === 'button'
              ? 'text-goldBright border-b-2 border-goldBright'
              : 'text-cloud/60 hover:text-cloud'
          }`}
        >
          Upgrade Button Texts
        </button>
      </div>

      {/* Plan Settings */}
      {activeSection === 'plans' && (
        <div className="space-y-6">
          {plans.map((plan) => (
            <div key={plan.tierKey} className="bg-midnight/60 rounded-lg border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-cloud capitalize">{plan.tierKey} Plan</h3>
                {plan.isRecommended && (
                  <span className="px-3 py-1 bg-goldBright/20 text-goldBright rounded-full text-sm font-medium">
                    Recommended
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-cloud/70 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={plan.displayName}
                    onChange={(e) => handlePlanChange(plan.tierKey, 'displayName', e.target.value)}
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cloud/70 mb-1">Tagline</label>
                  <input
                    type="text"
                    value={plan.tagline}
                    onChange={(e) => handlePlanChange(plan.tierKey, 'tagline', e.target.value)}
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cloud/70 mb-1">Display Price</label>
                  <input
                    type="text"
                    value={plan.displayPrice}
                    onChange={(e) => handlePlanChange(plan.tierKey, 'displayPrice', e.target.value)}
                    placeholder="€0 / month"
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cloud/70 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={plan.sortOrder}
                    onChange={(e) => handlePlanChange(plan.tierKey, 'sortOrder', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-cloud/70">
                  <input
                    type="checkbox"
                    checked={plan.isRecommended}
                    onChange={(e) => handlePlanChange(plan.tierKey, 'isRecommended', e.target.checked)}
                    className="w-4 h-4 text-goldBright bg-midnight border-white/20 rounded focus:ring-goldBright"
                  />
                  Mark as Recommended
                </label>
              </div>

              <div className="border-t border-white/10 pt-4 mt-4">
                <h4 className="text-lg font-semibold text-cloud mb-4">Limits</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-cloud/70 mb-1">Max Meeting Duration (minutes)</label>
                    <input
                      type="number"
                      value={plan.limits.maxMeetingDurationMinutes === Infinity ? '' : plan.limits.maxMeetingDurationMinutes}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        maxMeetingDurationMinutes: e.target.value === '' ? Infinity : parseInt(e.target.value) || 0,
                      })}
                      placeholder="Infinity"
                      className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cloud/70 mb-1">Max Participants</label>
                    <input
                      type="number"
                      value={plan.limits.maxParticipantsPerMeeting === Infinity ? '' : plan.limits.maxParticipantsPerMeeting}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        maxParticipantsPerMeeting: e.target.value === '' ? Infinity : parseInt(e.target.value) || 0,
                      })}
                      placeholder="Infinity"
                      className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cloud/70 mb-1">Max Meetings/Month</label>
                    <input
                      type="number"
                      value={plan.limits.maxMeetingsPerMonth === Infinity ? '' : plan.limits.maxMeetingsPerMonth}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        maxMeetingsPerMonth: e.target.value === '' ? Infinity : parseInt(e.target.value) || 0,
                      })}
                      placeholder="Infinity"
                      className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cloud/70 mb-1">Max Recording Minutes/Month</label>
                    <input
                      type="number"
                      value={plan.limits.maxRecordingMinutesPerMonth === Infinity ? '' : plan.limits.maxRecordingMinutesPerMonth}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        maxRecordingMinutesPerMonth: e.target.value === '' ? Infinity : parseInt(e.target.value) || 0,
                      })}
                      placeholder="Infinity"
                      className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cloud/70 mb-1">Max Storage (GB)</label>
                    <input
                      type="text"
                      value={formatBytes(plan.limits.maxStorageBytes)}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        maxStorageBytes: parseBytes(e.target.value),
                      })}
                      placeholder="e.g., 1 GB or Unlimited"
                      className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4 mt-4">
                <h4 className="text-lg font-semibold text-cloud mb-4">Feature Flags</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-cloud/70">
                    <input
                      type="checkbox"
                      checked={plan.limits.recordingEnabled}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        recordingEnabled: e.target.checked,
                      })}
                      className="w-4 h-4 text-goldBright bg-midnight border-white/20 rounded focus:ring-goldBright"
                    />
                    Recording Enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-cloud/70">
                    <input
                      type="checkbox"
                      checked={plan.limits.backgroundEffects.blur}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        backgroundEffects: {
                          ...plan.limits.backgroundEffects,
                          blur: e.target.checked,
                        },
                      })}
                      className="w-4 h-4 text-goldBright bg-midnight border-white/20 rounded focus:ring-goldBright"
                    />
                    Background Blur
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-cloud/70">
                    <input
                      type="checkbox"
                      checked={plan.limits.backgroundEffects.videoBackgrounds}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        backgroundEffects: {
                          ...plan.limits.backgroundEffects,
                          videoBackgrounds: e.target.checked,
                        },
                      })}
                      className="w-4 h-4 text-goldBright bg-midnight border-white/20 rounded focus:ring-goldBright"
                    />
                    Video Backgrounds
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-cloud/70">
                    <input
                      type="checkbox"
                      checked={plan.limits.chatFeatures.privateChat}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        chatFeatures: {
                          ...plan.limits.chatFeatures,
                          privateChat: e.target.checked,
                        },
                      })}
                      className="w-4 h-4 text-goldBright bg-midnight border-white/20 rounded focus:ring-goldBright"
                    />
                    Private Chat
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-cloud/70">
                    <input
                      type="checkbox"
                      checked={plan.limits.chatFeatures.fileSharing}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        chatFeatures: {
                          ...plan.limits.chatFeatures,
                          fileSharing: e.target.checked,
                        },
                      })}
                      className="w-4 h-4 text-goldBright bg-midnight border-white/20 rounded focus:ring-goldBright"
                    />
                    File Sharing
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-cloud/70">
                    <input
                      type="checkbox"
                      checked={plan.limits.scheduling.schedule}
                      onChange={(e) => handlePlanChange(plan.tierKey, 'limits', {
                        ...plan.limits,
                        scheduling: {
                          ...plan.limits.scheduling,
                          schedule: e.target.checked,
                        },
                      })}
                      className="w-4 h-4 text-goldBright bg-midnight border-white/20 rounded focus:ring-goldBright"
                    />
                    Schedule Meetings
                  </label>
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <button
              onClick={handleSavePlans}
              disabled={saving}
              className="px-6 py-3 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Plan Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Pricing Page Texts */}
      {activeSection === 'pricing' && pricingTexts && (
        <div className="space-y-6">
          {/* Hero Section */}
          <div className="bg-midnight/60 rounded-lg border border-white/10 p-6">
            <h3 className="text-xl font-bold text-cloud mb-4">Hero Section</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-cloud/70 mb-1">Headline</label>
                <input
                  type="text"
                  value={pricingTexts.hero.headline}
                  onChange={(e) => setPricingTexts({
                    ...pricingTexts,
                    hero: { ...pricingTexts.hero, headline: e.target.value },
                  })}
                  className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-cloud/70 mb-1">Subheadline</label>
                <textarea
                  value={pricingTexts.hero.subheadline}
                  onChange={(e) => setPricingTexts({
                    ...pricingTexts,
                    hero: { ...pricingTexts.hero, subheadline: e.target.value },
                  })}
                  rows={2}
                  className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-cloud/70 mb-1">Key Points (one per line)</label>
                <textarea
                  value={pricingTexts.hero.keyPoints.join('\n')}
                  onChange={(e) => setPricingTexts({
                    ...pricingTexts,
                    hero: {
                      ...pricingTexts.hero,
                      keyPoints: e.target.value.split('\n').filter(Boolean),
                    },
                  })}
                  rows={3}
                  className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  placeholder="Key point 1&#10;Key point 2"
                />
              </div>
            </div>
          </div>

          {/* Tier Content */}
          {(['free', 'pro', 'business', 'enterprise'] as SubscriptionTier[]).map((tier) => (
            <div key={tier} className="bg-midnight/60 rounded-lg border border-white/10 p-6">
              <h3 className="text-xl font-bold text-cloud mb-4 capitalize">{tier} Plan</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-cloud/70 mb-1">Tier Description</label>
                  <textarea
                    value={pricingTexts.tiers[tier].tierDescription}
                    onChange={(e) => setPricingTexts({
                      ...pricingTexts,
                      tiers: {
                        ...pricingTexts.tiers,
                        [tier]: {
                          ...pricingTexts.tiers[tier],
                          tierDescription: e.target.value,
                        },
                      },
                    })}
                    rows={2}
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cloud/70 mb-1">Bullet Points (one per line, use ✔ or ✘ for checkmarks/crosses)</label>
                  <textarea
                    value={pricingTexts.tiers[tier].tierBulletPoints.join('\n')}
                    onChange={(e) => setPricingTexts({
                      ...pricingTexts,
                      tiers: {
                        ...pricingTexts.tiers,
                        [tier]: {
                          ...pricingTexts.tiers[tier],
                          tierBulletPoints: e.target.value.split('\n').filter(Boolean),
                        },
                      },
                    })}
                    rows={10}
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright font-mono text-sm"
                    placeholder="✔ Feature 1&#10;✘ Feature 2&#10;✔ Feature 3"
                  />
                  <p className="text-xs text-cloud/50 mt-1">Tip: Use ✔ for enabled features, ✘ for disabled features</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-cloud/70 mb-1">Psychological Triggers (one per line, optional)</label>
                  <textarea
                    value={(pricingTexts.tiers[tier].psychologicalTriggers || []).join('\n')}
                    onChange={(e) => setPricingTexts({
                      ...pricingTexts,
                      tiers: {
                        ...pricingTexts.tiers,
                        [tier]: {
                          ...pricingTexts.tiers[tier],
                          psychologicalTriggers: e.target.value.split('\n').filter(Boolean),
                        },
                      },
                    })}
                    rows={2}
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    placeholder="🔥 Most Popular&#10;⭐ Best for 1–10 people"
                  />
                  <p className="text-xs text-cloud/50 mt-1">Examples: 🔥 Most Popular, ⭐ Best for 1–10 people, 🚀 For Teams & Schools</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-cloud/70 mb-1">Button Text (optional)</label>
                  <input
                    type="text"
                    value={pricingTexts.tiers[tier].buttonText || ''}
                    onChange={(e) => setPricingTexts({
                      ...pricingTexts,
                      tiers: {
                        ...pricingTexts.tiers,
                        [tier]: {
                          ...pricingTexts.tiers[tier],
                          buttonText: e.target.value || undefined,
                        },
                      },
                    })}
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    placeholder="Upgrade, Contact Sales, etc."
                  />
                </div>
              </div>
            </div>
          ))}

          {/* FAQ Section */}
          <div className="bg-midnight/60 rounded-lg border border-white/10 p-6">
            <h3 className="text-xl font-bold text-cloud mb-4">FAQ Section</h3>
            <div className="space-y-4">
              {(pricingTexts.faq?.questions || []).map((faq, idx) => (
                <div key={idx} className="bg-midnight/40 rounded-lg p-4 border border-white/5">
                  <div className="mb-2">
                    <label className="block text-sm font-medium text-cloud/70 mb-1">Question {idx + 1}</label>
                    <input
                      type="text"
                      value={faq.question}
                      onChange={(e) => {
                        const newQuestions = [...(pricingTexts.faq?.questions || [])];
                        newQuestions[idx] = { ...newQuestions[idx], question: e.target.value };
                        setPricingTexts({
                          ...pricingTexts,
                          faq: {
                            questions: newQuestions,
                          },
                        });
                      }}
                      className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cloud/70 mb-1">Answer {idx + 1}</label>
                    <textarea
                      value={faq.answer}
                      onChange={(e) => {
                        const newQuestions = [...(pricingTexts.faq?.questions || [])];
                        newQuestions[idx] = { ...newQuestions[idx], answer: e.target.value };
                        setPricingTexts({
                          ...pricingTexts,
                          faq: {
                            questions: newQuestions,
                          },
                        });
                      }}
                      rows={2}
                      className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const newQuestions = (pricingTexts.faq?.questions || []).filter((_, i) => i !== idx);
                      setPricingTexts({
                        ...pricingTexts,
                        faq: {
                          questions: newQuestions,
                        },
                      });
                    }}
                    className="mt-2 text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setPricingTexts({
                    ...pricingTexts,
                    faq: {
                      questions: [
                        ...(pricingTexts.faq?.questions || []),
                        { question: '', answer: '' },
                      ],
                    },
                  });
                }}
                className="px-4 py-2 bg-white/10 text-cloud rounded-lg hover:bg-white/20 transition-colors text-sm"
              >
                + Add FAQ Question
              </button>
            </div>
          </div>

          {/* Footer Note */}
          <div className="bg-midnight/60 rounded-lg border border-white/10 p-6">
            <h3 className="text-xl font-bold text-cloud mb-4">Footer Note</h3>
            <textarea
              value={pricingTexts.footerNote || ''}
              onChange={(e) => setPricingTexts({ ...pricingTexts, footerNote: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
              placeholder="Prices exclude VAT depending on your country..."
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSavePricingTexts}
              disabled={saving}
              className="px-6 py-3 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Pricing Texts'}
            </button>
          </div>
        </div>
      )}

      {/* Upgrade Modal Texts */}
      {activeSection === 'upgrade' && upgradeModalTexts && (
        <div className="space-y-6">
          <div className="bg-midnight/60 rounded-lg border border-white/10 p-6">
            <h3 className="text-xl font-bold text-cloud mb-4">Default Upgrade Modal Texts</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-cloud/70 mb-1">Default Title</label>
                <input
                  type="text"
                  value={upgradeModalTexts.defaultTitle}
                  onChange={(e) => setUpgradeModalTexts({ ...upgradeModalTexts, defaultTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-cloud/70 mb-1">Default Message</label>
                <textarea
                  value={upgradeModalTexts.defaultMessage}
                  onChange={(e) => setUpgradeModalTexts({ ...upgradeModalTexts, defaultMessage: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                />
              </div>
            </div>
          </div>

          <div className="bg-midnight/60 rounded-lg border border-white/10 p-6">
            <h3 className="text-xl font-bold text-cloud mb-4">Per-Reason Overrides</h3>
            <div className="space-y-4">
              {Object.entries(upgradeModalTexts.reasons || {}).map(([reasonCode, reason]) => (
                <div key={reasonCode} className="border border-white/10 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-cloud mb-3 capitalize">{reasonCode.replace(/_/g, ' ')}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-cloud/70 mb-1">Title (Optional)</label>
                      <input
                        type="text"
                        value={reason.title || ''}
                        onChange={(e) => setUpgradeModalTexts({
                          ...upgradeModalTexts,
                          reasons: {
                            ...upgradeModalTexts.reasons,
                            [reasonCode]: {
                              ...reason,
                              title: e.target.value,
                            },
                          },
                        })}
                        className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-cloud/70 mb-1">Message (Optional)</label>
                      <textarea
                        value={reason.message || ''}
                        onChange={(e) => setUpgradeModalTexts({
                          ...upgradeModalTexts,
                          reasons: {
                            ...upgradeModalTexts.reasons,
                            [reasonCode]: {
                              ...reason,
                              message: e.target.value,
                            },
                          },
                        })}
                        rows={2}
                        className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveUpgradeTexts}
              disabled={saving}
              className="px-6 py-3 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Upgrade Modal Texts'}
            </button>
          </div>
        </div>
      )}

      {/* Upgrade Button Texts */}
      {activeSection === 'button' && (
        <div className="space-y-6">
          <div className="bg-midnight/60 rounded-lg border border-white/10 p-6">
            <h3 className="text-xl font-bold text-cloud mb-4">Navigation Bar Upgrade Button Texts</h3>
            <p className="text-sm text-cloud/70 mb-6">
              Customize the text shown on the upgrade button in the top navigation bar for each tier.
              This text appears next to the lightning bolt icon. Leave empty to use default (next tier pricing).
            </p>
            
            <div className="space-y-4">
              {(['free', 'pro', 'business'] as SubscriptionTier[]).map((tier) => (
                <div key={tier} className="bg-midnight/40 rounded-lg p-4 border border-white/5">
                  <label className="block text-sm font-medium text-cloud/70 mb-2 capitalize">
                    {tier} Tier Button Text
                  </label>
                  <input
                    type="text"
                    value={upgradeButtonTexts[tier] || ''}
                    onChange={(e) => setUpgradeButtonTexts({
                      ...upgradeButtonTexts,
                      [tier]: e.target.value,
                    })}
                    placeholder={`e.g., "Pro from €9.99" or "Upgrade to Pro"`}
                    className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  />
                  <p className="text-xs text-cloud/50 mt-1">
                    Example: "Pro from €9.99", "Business from €19.99", or "Upgrade Now"
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveButtonTexts}
              disabled={saving}
              className="px-6 py-3 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Upgrade Button Texts'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionSettingsTab;

