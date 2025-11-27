import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ProfileSettingsModal from './ProfileSettingsModal';
import AccountSwitcher from './AccountSwitcher';
import { getSubscriptionFromProfile } from '../lib/subscriptionService';
import { getAllSubscriptionPlanConfigs, getUpgradeButtonTexts } from '../lib/subscriptionPlansService';
import { SubscriptionTier } from '../lib/subscriptionPlans';

interface HeaderProps {
  title?: string;
  showUserMenu?: boolean;
  onLeave?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, showUserMenu = true, onLeave }) => {
  const { user, userProfile, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [upgradeLabel, setUpgradeLabel] = useState<string>('Upgrade');
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('free');

  // Load unread inbox count from all rooms
  useEffect(() => {
    if (!user) return;

    const roomUnreadCounts = new Map<string, number>();

    const updateTotalUnread = () => {
      const total = Array.from(roomUnreadCounts.values()).reduce((sum, count) => sum + count, 0);
      setUnreadInboxCount(total);
    };

    const loadUnreadCount = async () => {
      try {
        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        const unsubscribes: Array<() => void> = [];
        
        // Check each room to see if user is a participant before subscribing
        for (const roomDoc of roomsSnapshot.docs) {
          const roomId = roomDoc.id;
          
          // Check if user is a participant in this room
          try {
            const participantDoc = await getDoc(doc(db, 'rooms', roomId, 'participants', user.uid));
            if (!participantDoc.exists()) {
              // User is not a participant, skip this room
              continue;
            }
          } catch (error) {
            // If we can't check participant status, skip this room
            continue;
          }
          
          // User is a participant, subscribe to messages
          const messagesRef = collection(db, 'rooms', roomId, 'privateMessages');
          const unsubscribe = onSnapshot(
            messagesRef,
            (snapshot) => {
              const unreadCount = snapshot.docs
                .map(doc => doc.data())
                .filter((msg: any) => msg.receiverId === user.uid && !msg.read).length;
              
              roomUnreadCounts.set(roomId, unreadCount);
              updateTotalUnread();
            },
            (error) => {
              // Silently handle permission errors - user might not have access to this room
              if (error.code !== 'permission-denied') {
                console.error(`Error loading unread count for room ${roomId}:`, error);
              }
            }
          );
          
          unsubscribes.push(unsubscribe);
        }
        
        return () => {
          unsubscribes.forEach(unsub => unsub());
        };
      } catch (error) {
        console.error('Error loading unread count:', error);
      }
    };

    const cleanup = loadUnreadCount();
    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, [user]);

  // Load subscription data to show upgrade button with pricing
  useEffect(() => {
    const loadUpgradeInfo = async () => {
      if (!userProfile) return;
      
      try {
        const subscription = getSubscriptionFromProfile(userProfile);
        const tier = subscription.subscriptionTier || 'free';
        setCurrentTier(tier);
        
        // If already on highest tier, don't show upgrade label
        if (tier === 'enterprise') {
          setUpgradeLabel('Upgrade');
          return;
        }
        
        // Try to get editable upgrade button text from Firestore first
        try {
          const buttonTexts = await getUpgradeButtonTexts();
          if (buttonTexts && buttonTexts[tier]) {
            setUpgradeLabel(buttonTexts[tier]);
            return;
          }
        } catch (error) {
          console.log('[Header] No custom upgrade button text found, using default');
        }
        
        // Fallback: Get all plans to find next tier
        const plans = await getAllSubscriptionPlanConfigs();
        const sortedPlans = plans.sort((a, b) => a.sortOrder - b.sortOrder);
        
        // Find current tier index and get next tier
        const currentIndex = sortedPlans.findIndex(p => p.tierKey === tier);
        if (currentIndex >= 0 && currentIndex < sortedPlans.length - 1) {
          const nextPlan = sortedPlans[currentIndex + 1];
          setUpgradeLabel(`${nextPlan.displayName} from ${nextPlan.displayPrice}`);
        } else {
          setUpgradeLabel('Upgrade');
        }
      } catch (error) {
        console.error('[Header] Error loading upgrade info:', error);
        setUpgradeLabel('Upgrade');
      }
    };
    
    loadUpgradeInfo();
  }, [userProfile]);

  return (
    <header className="bg-midnight border-b border-gray-800 px-3 sm:px-4 lg:px-6 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Brand logo */}
          <img 
            src="/logo.png" 
            alt="Habs Meet Logo" 
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
          />
          {title && (
            <h1 className="text-base sm:text-lg font-semibold text-cloud">{title}</h1>
          )}
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {onLeave && (
            <button
              onClick={onLeave}
              className="btn btn-danger"
            >
              Leave
            </button>
          )}

          {showUserMenu && user && (
            <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3">
              {/* Inbox Link */}
              <button
                onClick={() => navigate('/inbox')}
                className="btn btn-ghost text-xs px-1.5 sm:px-2 md:px-3 relative"
                title="Inbox"
              >
                <svg className="w-4 h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="hidden sm:inline">Inbox</span>
                {unreadInboxCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-4.5 px-1 flex items-center justify-center">
                    {unreadInboxCount > 99 ? '99+' : unreadInboxCount}
                  </span>
                )}
              </button>
              
              {/* Admin Link - only show for admins */}
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="btn btn-ghost text-xs px-1.5 sm:px-2 md:px-3"
                  title="Admin Panel"
                >
                  <svg className="w-4 h-4 sm:mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}
              
              {/* Upgrade Button - Pill style with yellow background */}
              {currentTier !== 'enterprise' && (
                <button
                  onClick={() => navigate('/pricing')}
                  className="bg-goldBright text-midnight font-bold px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm hover:bg-yellow-400 transition-colors shadow-md hover:shadow-lg flex items-center gap-1 sm:gap-2 whitespace-nowrap"
                  title="Upgrade Plan"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  <span className="hidden md:inline">{upgradeLabel}</span>
                  <span className="hidden sm:inline md:hidden">Upgrade</span>
                  <span className="sm:hidden">Upgrade</span>
                </button>
              )}
              
              {/* User info - hidden on mobile, shown in dropdown instead */}
              <div className="text-right hidden lg:block">
                <p className="text-xs font-medium text-cloud">
                  {userProfile?.displayName || user.email}
                </p>
                <p className="text-xs text-gray-400">
                  {userProfile?.displayName ? user.email : 'Host'}
                </p>
              </div>
              
              {/* Account Switcher - Shows avatar and allows switching between accounts, profile settings, and sign out */}
              <AccountSwitcher 
                onProfileClick={() => setShowProfileModal(true)}
                onSignOut={logout}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Profile Settings Modal */}
      {showUserMenu && user && (
        <ProfileSettingsModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </header>
  );
};

export default Header;


