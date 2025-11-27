/**
 * Pricing Page Component
 * 
 * Displays all subscription plans with editable content from Firestore.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { getAllSubscriptionPlanConfigs, getPricingPageTexts, type SubscriptionPlanConfig, type PricingPageTexts } from '../lib/subscriptionPlansService';
import { SubscriptionTier } from '../lib/subscriptionPlans';
import { useAuth } from '../contexts/AuthContext';
import { getSubscriptionFromProfile } from '../lib/subscriptionService';

const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userProfile } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlanConfig[]>([]);
  const [pricingTexts, setPricingTexts] = useState<PricingPageTexts | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('free');
  const [highlightTier, setHighlightTier] = useState<SubscriptionTier | null>(null);

  useEffect(() => {
    loadData();
  }, [userProfile]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plansData, textsData] = await Promise.all([
        getAllSubscriptionPlanConfigs(),
        getPricingPageTexts(),
      ]);
      
      // Sort plans by sortOrder
      const sortedPlans = plansData.sort((a, b) => a.sortOrder - b.sortOrder);
      setPlans(sortedPlans);
      setPricingTexts(textsData);
      
      // Get current user's tier
      if (userProfile) {
        const subscription = getSubscriptionFromProfile(userProfile);
        setCurrentTier(subscription.subscriptionTier || 'free');
      }
      
      // Check for tier parameter in URL (from upgrade modal)
      const tierParam = searchParams.get('tier');
      if (tierParam && ['free', 'pro', 'business', 'enterprise'].includes(tierParam)) {
        setHighlightTier(tierParam as SubscriptionTier);
        // Scroll to highlighted tier after a short delay
        setTimeout(() => {
          const element = document.getElementById(`plan-${tierParam}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
      }
    } catch (error) {
      console.error('[PricingPage] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleUpgrade = (tier: SubscriptionTier) => {
    if (tier === 'enterprise') {
      // TODO: Open contact sales form or email
      window.location.href = 'mailto:sales@habsmeet.com?subject=Enterprise Plan Inquiry';
      return;
    }
    
    // TODO: Navigate to Stripe checkout when implemented
    console.log(`[PricingPage] Upgrade to ${tier}`);
    // For now, navigate back to home
    navigate('/home');
  };

  if (loading || !pricingTexts) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-goldBright"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight">
      <Header title="Pricing" />
      
      <main className="container mx-auto px-6 py-12 max-w-7xl">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-cloud mb-4">
            {pricingTexts.hero.headline}
          </h1>
          <p className="text-xl text-cloud/80 mb-6 max-w-3xl mx-auto">
            {pricingTexts.hero.subheadline}
          </p>
          <div className="flex flex-col items-center gap-2 text-cloud/70">
            {pricingTexts.hero.keyPoints.map((point, idx) => (
              <p key={idx} className="text-sm">{point}</p>
            ))}
          </div>
        </section>

        {/* Plans Grid */}
        <section className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => {
              const isCurrentTier = plan.tierKey === currentTier;
              const isHighlighted = plan.tierKey === highlightTier;
              const tierContent = pricingTexts.tiers[plan.tierKey];
              
              return (
                <div
                  id={`plan-${plan.tierKey}`}
                  key={plan.tierKey}
                  className={`relative p-6 rounded-xl border-2 transition-all ${
                    isCurrentTier
                      ? 'bg-midnight/80 border-goldBright/50'
                      : isHighlighted
                      ? 'bg-goldBright/20 border-goldBright shadow-lg animate-pulse'
                      : plan.isRecommended
                      ? 'bg-techBlue/10 border-techBlue shadow-lg'
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

                  {/* Psychological Triggers */}
                  {tierContent.psychologicalTriggers && tierContent.psychologicalTriggers.length > 0 && (
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      {tierContent.psychologicalTriggers.map((trigger, idx) => (
                        <span
                          key={idx}
                          className="bg-goldBright/20 text-goldBright text-xs font-semibold px-2 py-1 rounded"
                        >
                          {trigger}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-cloud mb-2">{plan.displayName}</h3>
                    <div className="text-3xl font-bold text-goldBright mb-2">
                      {plan.displayPrice}
                      {plan.tierKey !== 'free' && (
                        <span className="text-lg font-normal text-cloud/60">/month</span>
                      )}
                    </div>
                    {plan.tierKey === 'enterprise' && (
                      <p className="text-cloud/50 text-xs mb-2">or Contact Sales</p>
                    )}
                    <p className="text-cloud/70 text-sm">{tierContent.tierDescription}</p>
                  </div>

                  {/* Plan Features */}
                  <div className="space-y-2 mb-6 min-h-[300px]">
                    {tierContent.tierBulletPoints.map((point, idx) => {
                      const isCheck = point.startsWith('✔');
                      const isCross = point.startsWith('✘');
                      const text = point.replace(/^[✔✘]\s*/, '');
                      
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 text-sm ${
                            isCheck ? 'text-cloud/90' : isCross ? 'text-cloud/50' : 'text-cloud/80'
                          }`}
                        >
                          <span className="text-lg mt-0.5">
                            {isCheck ? '✔' : isCross ? '✘' : '•'}
                          </span>
                          <span>{text}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => handleUpgrade(plan.tierKey)}
                    disabled={isCurrentTier}
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                      isCurrentTier
                        ? 'bg-white/5 text-cloud/50 cursor-not-allowed'
                        : plan.isRecommended
                        ? 'bg-goldBright text-midnight hover:bg-yellow-400'
                        : 'bg-techBlue text-cloud hover:bg-techBlue/80'
                    }`}
                  >
                    {isCurrentTier
                      ? 'Current Plan'
                      : tierContent.buttonText || 'Upgrade'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* FAQ Section */}
        {pricingTexts.faq && pricingTexts.faq.questions.length > 0 && (
          <section className="mb-16">
            <h2 className="text-3xl font-bold text-cloud mb-8 text-center">Frequently Asked Questions</h2>
            <div className="max-w-3xl mx-auto space-y-6">
              {pricingTexts.faq.questions.map((faq, idx) => (
                <div
                  key={idx}
                  className="bg-midnight/60 border border-white/10 rounded-lg p-6"
                >
                  <h3 className="text-xl font-semibold text-cloud mb-2">{faq.question}</h3>
                  <p className="text-cloud/80">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer Note */}
        {pricingTexts.footerNote && (
          <section className="text-center">
            <p className="text-cloud/60 text-sm max-w-4xl mx-auto">
              {pricingTexts.footerNote}
            </p>
          </section>
        )}
      </main>
    </div>
  );
};

export default PricingPage;

