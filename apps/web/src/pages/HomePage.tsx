import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MeetingService } from '../lib/meetingService';
import toast from '../lib/toast';
import Header from '../components/Header';
import CalendarInterface from '../components/CalendarInterface';
import ScheduleMeetingForm from '../components/ScheduleMeetingForm';
import FeedbackPopup, { FeedbackData } from '../components/FeedbackPopup';
import UpgradeModal from '../components/UpgradeModal';
import {
  canShowFeedbackPopup,
  updateLastFeedbackPopupShown,
  saveFeedback,
  calculateMeetingDuration,
  isMeetingDurationEligible,
  getParticipantData,
  getRoomData,
} from '../lib/feedbackService';
import { collection, query, getDocs, orderBy, limit, getDoc, doc, setDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

const HomePage: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [inviteLink, setInviteLink] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'schedule'>('calendar');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<{
    meetingId: string;
    hostLink: string;
    participantLink: string;
    icsData: string;
    passcode?: string;
  } | null>(null);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [recentMeetingsWithMessages, setRecentMeetingsWithMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isMessageSystemOpen, setIsMessageSystemOpen] = useState(false);
  // Track which meetings are expanded (collapsible functionality)
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  // Track which meetings have been opened (to hide message counts)
  const [openedMeetings, setOpenedMeetings] = useState<Set<string>>(new Set());
  // Track last seen message count per meeting (to detect new messages)
  const [lastSeenMessageCounts, setLastSeenMessageCounts] = useState<Record<string, number>>({});
  // Track deleted messages per user (per-user deletion)
  const [_deletedMessages, setDeletedMessages] = useState<Record<string, Set<string>>>({});
  // Track if persisted data has been loaded
  const [persistedDataLoaded, setPersistedDataLoaded] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Date | undefined>(undefined);
  
  // Feedback popup state
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [feedbackMeetingId, setFeedbackMeetingId] = useState<string | null>(null);
  const [feedbackMeetingDuration, setFeedbackMeetingDuration] = useState<number>(0);
  const [isCheckingFeedback, setIsCheckingFeedback] = useState(false);
  
  // Upgrade modal state
  const [upgradeModalProps, setUpgradeModalProps] = useState<{
    isOpen: boolean;
    title?: string;
    message?: string;
    feature?: string;
    currentTier?: 'free' | 'pro' | 'business' | 'enterprise';
    reasonCode?: string;
  }>({
    isOpen: false,
  });

  const handleCreateRoom = async () => {
    if (!user || !userProfile) return;

    // ✅ SUBSCRIPTION CHECK: Verify host can start meeting
    try {
      const { canStartMeeting, getSubscriptionFromProfile } = await import('../lib/subscriptionService');
      const subscription = getSubscriptionFromProfile(userProfile);
      const check = canStartMeeting(subscription, 0); // 0 = instant meeting, duration unknown
      
      if (!check.allowed) {
        setUpgradeModalProps({
          isOpen: true,
          title: check.reason || 'Cannot create meeting',
          message: 'Upgrade your plan to host meetings or extend your meeting limits.',
          feature: 'Instant Meeting',
          currentTier: subscription.subscriptionTier,
          reasonCode: check.reasonCode,
        });
        return;
      }
    } catch (error) {
      console.error('[Subscription] Error checking meeting creation:', error);
      // Continue anyway (fail open)
    }

    setIsCreatingRoom(true);
    try {
      const roomId = await MeetingService.createMeeting(
        `${userProfile.displayName || user.email?.split('@')[0]}'s Habs Meet`,
        user.uid,
        userProfile.displayName || user.email?.split('@')[0] || 'User',
        'Premium meeting room with video and audio capabilities'
      );

      toast.success('Meeting created successfully! Redirecting...');
      
      // Store room ID in session storage for security
      sessionStorage.setItem('currentRoomId', roomId);
      
      // Small delay to show the success message
      setTimeout(() => {
        navigate('/pre-meeting');
      }, 1000);
      
    } catch (error: any) {
      console.error('Error creating meeting:', error);
      // Check if error is subscription-related
      if (error.message?.includes('subscription') || error.message?.includes('limit') || error.message?.includes('plan')) {
        toast.error(error.message);
        // TODO: Show upgrade modal
      } else {
        toast.error('Failed to create meeting: ' + error.message);
      }
    } finally {
      setIsCreatingRoom(false);
    }
  };


  const handleJoinWithInvite = () => {
    if (!inviteLink.trim()) {
      toast.error('Please enter an invite link');
      return;
    }

    try {
      // Extract room ID from URL
      const url = new URL(inviteLink);
      const pathParts = url.pathname.split('/');
      
      // Check if it's a /join/:roomId link
      if (pathParts[pathParts.length - 2] === 'join') {
        const roomId = pathParts[pathParts.length - 1];
        if (roomId) {
          // Navigate directly to join page
          window.location.href = `/join/${roomId}`;
          return;
        }
      }
      
      // Otherwise, check for old invite format
      const inviteId = pathParts[pathParts.length - 1];
      if (!inviteId) {
        toast.error('Invalid invite link format');
        return;
      }

      // Store invite info in session storage
      sessionStorage.setItem('pendingInvite', JSON.stringify({
        inviteId,
        token: url.searchParams.get('token')
      }));

      navigate('/pre-meeting');
    } catch (error) {
      toast.error('Invalid invite link format');
    }
  };

  const handleTabClick = (tab: 'calendar' | 'schedule') => {
    if (activeTab === tab && isMobilePanelOpen) {
      // If clicking the same tab and panel is open, close it
      setIsMobilePanelOpen(false);
    } else {
      // If clicking a different tab or panel is closed, open it
      setActiveTab(tab);
      setIsMobilePanelOpen(true);
    }
  };

  // ✅ Load recent meetings with chat messages
  useEffect(() => {
    if (!user) return;

    const loadRecentMeetingsWithMessages = async () => {
      setIsLoadingMessages(true);
      try {
        // Get all rooms where user is a participant
        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        const rooms: any[] = [];

        for (const roomDoc of roomsSnapshot.docs) {
          const roomData = roomDoc.data();
          const roomId = roomDoc.id;

          // Check if user is a participant in this room
          const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
          const participantSnap = await getDoc(participantRef);

          if (participantSnap.exists()) {
            // Get chat messages for this room
            const chatRef = collection(db, 'rooms', roomId, 'chat');
            const chatQuery = query(chatRef, orderBy('createdAt', 'desc'), limit(10));
            const chatSnapshot = await getDocs(chatQuery);
            
            const messages = chatSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })).reverse(); // Reverse to show oldest first

            if (messages.length > 0) {
              // Load user's deleted messages for this room
              const deletedMessagesRef = doc(db, 'users', user.uid, 'deletedMessages', roomId);
              const deletedMessagesSnap = await getDoc(deletedMessagesRef);
              const messageIds = deletedMessagesSnap.exists() 
                ? (deletedMessagesSnap.data().messageIds || [])
                : [];
              const userDeletedMessageIds = new Set<string>(messageIds);
              
              // Filter out deleted messages for this user
              const visibleMessages = messages.filter((msg: any) => !userDeletedMessageIds.has(msg.id));
              
              // Store deleted messages in state for quick access
              setDeletedMessages(prev => {
                const newState = { ...prev };
                newState[roomId] = userDeletedMessageIds;
                return newState;
              });
              
              // Only show meetings that have visible messages for this user
              if (visibleMessages.length > 0) {
                rooms.push({
                  roomId,
                  title: roomData.title || 'Untitled Meeting',
                  createdAt: roomData.createdAt,
                  endedAt: roomData.endedAt,
                  status: roomData.status || 'open',
                  messages: visibleMessages, // Only show non-deleted messages
                  allMessages: messages, // Keep all messages for total count calculation
                  participantData: participantSnap.data(),
                  totalMessageCount: messages.length
                });
              }
            }
          }
        }

        // Sort by most recent message or meeting date
        rooms.sort((a, b) => {
          const aTime = a.messages[a.messages.length - 1]?.createdAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const bTime = b.messages[b.messages.length - 1]?.createdAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

        // Limit to 10 most recent meetings
        setRecentMeetingsWithMessages(rooms.slice(0, 10));
      } catch (error: any) {
        console.error('[HomePage] Error loading meetings with messages:', error);
        toast.error('Failed to load recent meetings');
      } finally {
        setIsLoadingMessages(false);
      }
    };

    if (user) {
      loadPersistedMeetingViews();
      loadRecentMeetingsWithMessages();
    }
  }, [user]);

  // Check for feedback popup conditions when page loads
  useEffect(() => {
    const checkFeedbackConditions = async () => {
      if (!user || isCheckingFeedback) {
        console.log('[HomePage] Skipping feedback check: user=', !!user, 'isCheckingFeedback=', isCheckingFeedback);
        return;
      }

      // Check if there's a pending feedback check in sessionStorage
      const pendingFeedback = sessionStorage.getItem('pendingFeedbackCheck');
      if (!pendingFeedback) {
        console.log('[HomePage] No pendingFeedbackCheck found in sessionStorage');
        return;
      }

      console.log('[HomePage] Found pendingFeedbackCheck:', pendingFeedback);

      try {
        setIsCheckingFeedback(true);
        const { roomId } = JSON.parse(pendingFeedback);
        
        if (!roomId) {
          console.error('[HomePage] Invalid pendingFeedbackCheck: missing roomId');
          sessionStorage.removeItem('pendingFeedbackCheck');
          return;
        }

        console.log('[HomePage] Checking feedback conditions for room:', roomId);

        // Check 24-hour cooldown
        const canShow = await canShowFeedbackPopup(user.uid);
        if (!canShow) {
          console.log('[HomePage] Feedback popup skipped: 24-hour cooldown active');
          sessionStorage.removeItem('pendingFeedbackCheck');
          return;
        }

        // Get participant data to calculate meeting duration
        const participantData = await getParticipantData(roomId, user.uid);
        if (!participantData) {
          console.log('[HomePage] Feedback popup skipped: No participant data found');
          sessionStorage.removeItem('pendingFeedbackCheck');
          return;
        }

        console.log('[HomePage] Participant data:', {
          joinedAt: participantData.joinedAt?.toDate?.()?.toISOString(),
          leftAt: participantData.leftAt?.toDate?.()?.toISOString()
        });

        // Get room data for end time
        const roomData = await getRoomData(roomId);
        console.log('[HomePage] Room data:', {
          createdBy: roomData?.createdBy,
          endedAt: roomData?.endedAt?.toDate?.()?.toISOString()
        });
        
        // Calculate meeting duration
        const duration = calculateMeetingDuration(
          participantData.joinedAt,
          participantData.leftAt,
          roomData?.endedAt || null
        );

        console.log('[HomePage] Calculated meeting duration:', duration, 'minutes');

        // Check if duration meets minimum requirement
        if (!isMeetingDurationEligible(duration)) {
          console.log('[HomePage] Feedback popup skipped: Meeting duration less than 5 minutes');
          sessionStorage.removeItem('pendingFeedbackCheck');
          return;
        }

        // All conditions met - show popup
        console.log('[HomePage] ✅ All conditions met - showing feedback popup');
        
        // Clear the pending check BEFORE showing popup to prevent duplicate checks
        sessionStorage.removeItem('pendingFeedbackCheck');
        
        // Update last popup shown timestamp immediately to prevent duplicate shows
        await updateLastFeedbackPopupShown(user.uid);
        
        setFeedbackMeetingId(roomId);
        setFeedbackMeetingDuration(duration || 0);
        setShowFeedbackPopup(true);
      } catch (error) {
        console.error('[HomePage] Error checking feedback conditions:', error);
        // Clear pending check on error to prevent retry loops
        sessionStorage.removeItem('pendingFeedbackCheck');
        // Fail silently - don't show popup on error
      } finally {
        setIsCheckingFeedback(false);
      }
    };

    // Small delay to ensure page is fully loaded and sessionStorage is accessible
    const timer = setTimeout(() => {
      checkFeedbackConditions();
    }, 800);

    return () => clearTimeout(timer);
  }, [user, isCheckingFeedback]);

  // Load persisted meeting views (opened meetings and last seen counts)
  const loadPersistedMeetingViews = async () => {
    if (!user) return;
    
    try {
      const meetingViewsRef = collection(db, 'users', user.uid, 'meetingViews');
      const meetingViewsSnapshot = await getDocs(meetingViewsRef);
      
      const loadedOpenedMeetings = new Set<string>();
      const loadedLastSeenCounts: Record<string, number> = {};
      
      meetingViewsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const roomId = doc.id;
        if (data.openedAt) {
          loadedOpenedMeetings.add(roomId);
        }
        if (data.lastSeenMessageCount !== undefined) {
          loadedLastSeenCounts[roomId] = data.lastSeenMessageCount;
        }
      });
      
      setOpenedMeetings(loadedOpenedMeetings);
      setLastSeenMessageCounts(loadedLastSeenCounts);
      setPersistedDataLoaded(true);
    } catch (error: any) {
      console.error('Error loading persisted meeting views:', error);
      setPersistedDataLoaded(true); // Still mark as loaded to continue
    }
  };

  // Handle meeting header click - toggle expand/collapse
  const handleMeetingToggle = (roomId: string) => {
    setExpandedMeetings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roomId)) {
        newSet.delete(roomId);
      } else {
        newSet.add(roomId);
        // Mark as opened when user expands it
        handleMeetingOpened(roomId);
      }
      return newSet;
    });
  };

  // Mark meeting as opened (hide message count) - persist to Firestore
  const handleMeetingOpened = async (roomId: string) => {
    if (!user) return;
    
    setOpenedMeetings(prev => new Set(prev).add(roomId));
    
    // Store the current TOTAL message count as last seen (all messages, not just visible)
    const meeting = recentMeetingsWithMessages.find(m => m.roomId === roomId);
    if (meeting) {
      // Use totalMessageCount (total in Firestore) or allMessages.length, not just visible messages.length
      const currentTotalCount = meeting.totalMessageCount || (meeting.allMessages?.length || meeting.messages.length);
      setLastSeenMessageCounts(prev => ({
        ...prev,
        [roomId]: currentTotalCount
      }));
      
      // Persist to Firestore
      try {
        const meetingViewRef = doc(db, 'users', user.uid, 'meetingViews', roomId);
        await setDoc(meetingViewRef, {
          roomId,
          openedAt: serverTimestamp(),
          lastSeenMessageCount: currentTotalCount,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (error: any) {
        console.error('Error persisting meeting view:', error);
      }
    }
  };

  // Calculate unread message count for a meeting (based on visible messages)
  const getUnreadCount = (meeting: any): number => {
    // Only show unread count if persisted data has been loaded
    if (!persistedDataLoaded) {
      return 0; // Don't show counts until we know what was previously seen
    }
    
    const hasBeenOpened = openedMeetings.has(meeting.roomId);
    const visibleCount = meeting.messages.length;
    
    if (!hasBeenOpened) {
      // Not opened yet - show all visible messages as unread
      return visibleCount;
    }
    
    // Has been opened - only show count if there are NEW messages since last seen
    const lastSeenCount = lastSeenMessageCounts[meeting.roomId] || 0;
    const currentTotalCount = meeting.totalMessageCount || visibleCount;
    const newMessages = Math.max(0, currentTotalCount - lastSeenCount);
    return newMessages;
  };

  // Get total unread count across all meetings
  const getTotalUnreadCount = (): number => {
    return recentMeetingsWithMessages.reduce((sum, meeting) => {
      return sum + getUnreadCount(meeting);
    }, 0);
  };

  // Delete a single message (per-user deletion - only hides for this user)
  const handleDeleteMessage = async (roomId: string, messageId: string) => {
    if (!user) return;
    
    try {
      // Add message ID to user's deleted messages for this room
      const deletedMessagesRef = doc(db, 'users', user.uid, 'deletedMessages', roomId);
      const deletedMessagesSnap = await getDoc(deletedMessagesRef);
      
      if (deletedMessagesSnap.exists()) {
        // Update existing document
        await updateDoc(deletedMessagesRef, {
          messageIds: arrayUnion(messageId)
        });
      } else {
        // Create new document
        await setDoc(deletedMessagesRef, {
          messageIds: [messageId],
          roomId,
          updatedAt: new Date()
        });
      }
      
      // Update local state - remove from visible messages
      setRecentMeetingsWithMessages(prev => 
        prev.map(meeting => {
          if (meeting.roomId === roomId) {
            return {
              ...meeting,
              messages: meeting.messages.filter((msg: any) => msg.id !== messageId)
            };
          }
          return meeting;
        }).filter(meeting => meeting.messages.length > 0 || meeting.totalMessageCount > 0)
      );
      
      // Update deleted messages state
      setDeletedMessages(prev => {
        const roomDeleted = prev[roomId] || new Set<string>();
        roomDeleted.add(messageId);
        return {
          ...prev,
          [roomId]: roomDeleted
        };
      });
      
      toast.success('Message deleted for you');
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message: ' + error.message);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight via-techBlue to-violetDeep">
      <Header showUserMenu={!!user} />
      
      <main className="container mx-auto px-2 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
        <div className="max-w-7xl mx-auto">
          {/* Tab Navigation */}
          <div className="flex justify-center mb-4 sm:mb-6 lg:mb-8">
            <div className="bg-cloud rounded-lg p-1 flex gap-1 sm:gap-2">
              <button
                onClick={() => handleTabClick('calendar')}
                className={`px-3 sm:px-6 py-2 sm:py-3 rounded-md font-medium transition-colors text-sm sm:text-base ${
                  activeTab === 'calendar' && isMobilePanelOpen
                    ? 'bg-techBlue text-cloud'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => handleTabClick('schedule')}
                className={`px-3 sm:px-6 py-2 sm:py-3 rounded-md font-medium transition-colors text-sm sm:text-base ${
                  activeTab === 'schedule' && isMobilePanelOpen
                    ? 'bg-techBlue text-cloud'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Schedule Meet
              </button>
            </div>
          </div>

          {/* Mobile & Tablet Sliding Panel */}
          {isMobilePanelOpen && (
            <div className="lg:hidden mb-4">
              <div className="bg-cloud rounded-2xl shadow-2xl overflow-hidden">
                {activeTab === 'calendar' && (
                  <CalendarInterface 
                    onScheduleMeeting={(selectedDate) => {
                      setSelectedScheduleDate(selectedDate);
                      setActiveTab('schedule');
                      setIsMobilePanelOpen(true);
                    }}
                    refreshKey={calendarRefreshKey}
                  />
                )}
                {activeTab === 'schedule' && (
                  <div className="p-4 sm:p-6 lg:p-8">
                    <div className="text-center mb-6 sm:mb-8">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-goldBright rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-midnight" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-midnight mb-2 sm:mb-4">Schedule a Meeting</h2>
                      <p className="text-gray-600 mb-6 sm:mb-8 text-sm sm:text-base">
                        Create and schedule meetings with your team or clients
                      </p>
                    </div>
                    <div className="max-w-md mx-auto">
                      <ScheduleMeetingForm
                        initialDate={selectedScheduleDate}
                        onSuccess={(meetingId, hostLink, participantLink, icsData, passcode) => {
                          setCreatedMeeting({ meetingId, hostLink, participantLink, icsData, passcode });
                          setShowSuccessDialog(true);
                          setCalendarRefreshKey(prev => prev + 1); // Refresh calendar
                          setActiveTab('calendar'); // Switch back to calendar to see the new meeting
                          setIsMobilePanelOpen(true);
                          setSelectedScheduleDate(undefined); // Clear selected date
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content - Hidden on mobile/tablet when panel is open */}
          <div className={`hidden lg:grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 lg:gap-8`}>
            {/* Main Content Area */}
            <div className="xl:col-span-2 order-2 xl:order-1">
              {activeTab === 'calendar' && (
                <CalendarInterface 
                  onScheduleMeeting={(selectedDate) => {
                    setSelectedScheduleDate(selectedDate);
                    setActiveTab('schedule');
                  }}
                  refreshKey={calendarRefreshKey}
                />
              )}
              
              {activeTab === 'schedule' && (
                <div className="bg-cloud rounded-2xl shadow-2xl p-4 sm:p-6 lg:p-8">
                  <div className="text-center mb-6 sm:mb-8">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-goldBright rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                      <svg className="w-6 h-6 sm:w-8 sm:h-8 text-midnight" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-midnight mb-2 sm:mb-4">Schedule a Meeting</h2>
                    <p className="text-gray-600 mb-6 sm:mb-8 text-sm sm:text-base">
                      Create and schedule meetings with your team or clients
                    </p>
                  </div>

                  <div className="max-w-md mx-auto">
                    <ScheduleMeetingForm
                      initialDate={selectedScheduleDate}
                      onSuccess={(meetingId, hostLink, participantLink, icsData, passcode) => {
                        setCreatedMeeting({ meetingId, hostLink, participantLink, icsData, passcode });
                        setShowSuccessDialog(true);
                        setCalendarRefreshKey(prev => prev + 1); // Refresh calendar
                        setActiveTab('calendar'); // Switch back to calendar to see the new meeting
                        setSelectedScheduleDate(undefined); // Clear selected date
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4 sm:space-y-6 order-1 xl:order-2">
              {/* Quick Actions Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">

                {/* Create Meeting Card */}
                <div className="bg-gradient-to-b from-purple-500 to-blue-600 rounded-lg p-3 text-white">
                  <div className="text-center">
                    {/* Icon */}
                    <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    
                    {/* Title */}
                    <h3 className="text-base font-bold mb-1">Create Meeting</h3>
                    
                    {/* Description */}
                    <p className="text-xs text-white/90 mb-3">
                  Start a new meeting and invite participants with secure links.
                </p>
                    
                    {/* Button */}
                <button
                  onClick={handleCreateRoom}
                  disabled={isCreatingRoom}
                      className="w-full bg-yellow-400 text-black py-2 px-3 rounded-lg text-sm font-medium hover:bg-yellow-300 transition-colors disabled:opacity-50"
                >
                  {isCreatingRoom ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </div>

            {/* Join Meeting Card */}
                <div className="bg-gradient-to-b from-purple-500 to-blue-600 rounded-lg p-3 text-white">
              <div className="text-center">
                    {/* Icon */}
                    <div className="w-10 h-10 bg-purple-400 rounded-full flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                    
                    {/* Title */}
                    <h3 className="text-base font-bold mb-1">Join Meeting</h3>
                    
                    {/* Description */}
                    <p className="text-xs text-white/90 mb-3">
                  Enter an invite link to join an existing meeting.
                </p>
                    
                    {/* Input Field */}
                  <input
                    type="url"
                    placeholder="Paste invite link here..."
                    value={inviteLink}
                    onChange={(e) => setInviteLink(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900 placeholder-gray-500 mb-3"
                      style={{color: '#111827', backgroundColor: 'white'}}
                  />
                    
                    {/* Button */}
                  <button
                    onClick={handleJoinWithInvite}
                      className="w-full bg-purple-400 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-purple-300 transition-colors"
                  >
                    Join Meeting
                  </button>
              </div>
            </div>
          </div>

              {/* Recent Meetings with Messages - Collapsible */}
              <div className="bg-cloud rounded-lg overflow-hidden">
                {/* ✅ Clickable Button Header */}
                <button
                  onClick={() => setIsMessageSystemOpen(!isMessageSystemOpen)}
                  className="w-full p-4 sm:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-techBlue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                                         <h3 className="text-lg font-semibold text-midnight">Message System</h3>
                     {(() => {
                       const totalUnread = getTotalUnreadCount();
                       return totalUnread > 0 ? (
                         <span className="bg-techBlue text-white text-xs font-bold rounded-full px-2 py-0.5">
                           {totalUnread}
                         </span>
                       ) : null;
                     })()}
                   </div>
                   <svg 
                     className={`w-5 h-5 text-gray-600 transition-transform ${isMessageSystemOpen ? 'rotate-180' : ''}`}
                     fill="none" 
                     stroke="currentColor" 
                     viewBox="0 0 24 24"
                   >
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                   </svg>
                 </button>
                 
                 {/* ✅ Collapsible Content */}
                 {isMessageSystemOpen && (
                   <div className="px-4 sm:px-6 pb-4 sm:pb-6 max-h-[600px] overflow-y-auto bg-gradient-to-br from-techBlue to-violetDeep/20">
                     {isLoadingMessages ? (
                       <div className="text-center py-8">
                         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-techBlue mx-auto mb-2"></div>
                         <p className="text-sm text-gray-500">Loading messages...</p>
                       </div>
                     ) : recentMeetingsWithMessages.length === 0 ? (
                       <div className="text-sm text-gray-500 text-center py-8">
                         <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                         </svg>
                         <p>No messages yet</p>
                         <p className="text-xs mt-1">Chat messages from your meetings will appear here</p>
                       </div>
                     ) : (
                       <div className="space-y-4">
                         {recentMeetingsWithMessages.map((meeting) => (
                           <div key={meeting.roomId} className="border border-gray-200 rounded-lg p-3 bg-white">
                                                        {/* Meeting Header */}
                            <div 
                              className="flex items-start justify-between mb-2 cursor-pointer hover:bg-gray-50 p-2 rounded -mx-2"
                              onClick={() => handleMeetingToggle(meeting.roomId)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-midnight text-sm truncate">{meeting.title}</h4>
                                  {expandedMeetings.has(meeting.roomId) ? (
                                    <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {formatDate(meeting.createdAt)}
                                  {(() => {
                                    const unreadCount = getUnreadCount(meeting);
                                    return unreadCount > 0 ? (
                                      <span className="ml-2 bg-techBlue text-white px-2 py-0.5 rounded-full text-xs font-semibold">
                                        {unreadCount} new
                                      </span>
                                    ) : null;
                                  })()}
                                </p>
                              </div>
                                {meeting.status === 'ended' && (
                                  <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded ml-2">Ended</span>
                                )}
                                                           </div>

                                                          {/* Messages Preview - WhatsApp Style */}
                             {expandedMeetings.has(meeting.roomId) && (
                             <div className="space-y-0.5 max-h-96 overflow-y-auto mt-3 border-t border-gray-100 pt-3">
                                                               {meeting.messages.map((message: any) => {
                                   const isOwnMessage = message.uid === user?.uid;
                                   return (
                                     <div
                                       key={message.id}
                                       className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} group`}
                                     >
                                       <div className={`max-w-[95%] ${isOwnMessage ? 'order-2' : 'order-1'} relative`}>
                                         {!isOwnMessage && (
                                           <p className="text-xs sm:text-sm font-semibold text-white/90 mb-0.5 px-1">
                                             {message.displayName || 'Unknown'}
                                           </p>
                                         )}
                                         <div
                                           className={`rounded-lg px-3 py-2 relative ${  
                                             isOwnMessage
                                               ? 'bg-gradient-to-br from-techBlue to-techBlue/90 text-white'
                                               : 'bg-white/95 text-gray-800'
                                           }`}
                                         >
                                           <p className="text-sm sm:text-base break-words">{message.text}</p>
                                           <div className="flex items-center justify-end gap-2 mt-1">
                                             <p className={`text-xs ${
                                               isOwnMessage ? 'text-white/70' : 'text-gray-500'
                                             }`}>
                                               {formatTime(message.createdAt)}
                                             </p>
                                             {/* Delete button */}
                                             <button
                                               onClick={(e) => {
                                                 e.stopPropagation();
                                                 handleDeleteMessage(meeting.roomId, message.id);
                                               }}
                                               className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity"
                                               title="Delete message for you"
                                             >
                                               <svg className={`w-3.5 h-3.5 ${
                                                 isOwnMessage ? 'text-white/70' : 'text-gray-500'
                                               }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                               </svg>
                                             </button>
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   );
                                 })}
                                {meeting.messages.length > 5 && (
                                  <p className="text-xs text-techBlue text-center pt-1">
                                    +{meeting.messages.length - 5} more messages
                                  </p>
                                )}
                                                        </div>
                             )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
               </div>
             </div>
           </div>

           {/* Mobile & Tablet content when panel is closed */}
           <div className={`lg:hidden ${isMobilePanelOpen ? 'hidden' : 'block'}`}>
             {/* Quick Actions Cards */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
               {/* Create Meeting Card */}
               <div className="bg-gradient-to-b from-purple-500 to-blue-600 rounded-lg p-3 text-white">
                 <div className="text-center">
                   {/* Icon */}
                   <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-2">
                     <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                     </svg>
                   </div>
                   
                   {/* Title */}
                   <h3 className="text-base font-bold mb-1">Create Meeting</h3>
                   
                   {/* Description */}
                   <p className="text-xs text-white/90 mb-3">
                     Start a new meeting and invite participants with secure links.
                   </p>
                   
                   {/* Button */}
                   <button
                     onClick={handleCreateRoom}
                     disabled={isCreatingRoom}
                     className="w-full bg-yellow-400 text-black py-2 px-3 rounded-lg text-sm font-medium hover:bg-yellow-300 transition-colors disabled:opacity-50"
                   >
                     {isCreatingRoom ? 'Creating...' : 'Create Room'}
                   </button>
                 </div>
               </div>

               {/* Join Meeting Card */}
               <div className="bg-gradient-to-b from-purple-500 to-blue-600 rounded-lg p-3 text-white">
                 <div className="text-center">
                   {/* Icon */}
                   <div className="w-10 h-10 bg-purple-400 rounded-full flex items-center justify-center mx-auto mb-2">
                     <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                     </svg>
             </div>

                   {/* Title */}
                   <h3 className="text-base font-bold mb-1">Join Meeting</h3>
                   
                   {/* Description */}
                   <p className="text-xs text-white/90 mb-3">
                     Enter an invite link to join an existing meeting.
                   </p>
                   
                   {/* Input Field */}
                   <input
                     type="url"
                     placeholder="Paste invite link here..."
                     value={inviteLink}
                     onChange={(e) => setInviteLink(e.target.value)}
                     className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900 placeholder-gray-500 mb-3"
                     style={{color: '#111827', backgroundColor: 'white'}}
                   />
                   
                   {/* Button */}
                   <button
                     onClick={handleJoinWithInvite}
                     className="w-full bg-purple-400 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-purple-300 transition-colors"
                   >
                     Join Meeting
                   </button>
                 </div>
               </div>
             </div>

             {/* Recent Meetings with Messages - Collapsible */}
             <div className="bg-cloud rounded-lg overflow-hidden">
               {/* ✅ Clickable Button Header */}
               <button
                 onClick={() => setIsMessageSystemOpen(!isMessageSystemOpen)}
                 className="w-full p-4 sm:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
               >
                 <div className="flex items-center gap-2">
                   <svg className="w-5 h-5 text-techBlue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                   </svg>
                   <h3 className="text-lg font-semibold text-midnight">Message System</h3>
                   {(() => {
                     const totalUnread = getTotalUnreadCount();
                     return totalUnread > 0 ? (
                       <span className="bg-techBlue text-white text-xs font-bold rounded-full px-2 py-0.5">
                         {totalUnread}
                       </span>
                     ) : null;
                   })()}
                 </div>
                 <svg 
                   className={`w-5 h-5 text-gray-600 transition-transform ${isMessageSystemOpen ? 'rotate-180' : ''}`}
                   fill="none" 
                   stroke="currentColor" 
                   viewBox="0 0 24 24"
                 >
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                 </svg>
               </button>
              
              {/* ✅ Collapsible Content */}
              {isMessageSystemOpen && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 max-h-[600px] overflow-y-auto bg-gradient-to-br from-techBlue to-violetDeep/20">
                  {isLoadingMessages ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-techBlue mx-auto mb-2"></div>
                      <p className="text-sm text-gray-500">Loading messages...</p>
                    </div>
                  ) : recentMeetingsWithMessages.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-8">
                      <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <p>No messages yet</p>
                      <p className="text-xs mt-1">Chat messages from your meetings will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recentMeetingsWithMessages.map((meeting) => (
                        <div key={meeting.roomId} className="border border-gray-200 rounded-lg p-3 bg-white">
                                                     {/* Meeting Header */}
                           <div 
                             className="flex items-start justify-between mb-2 cursor-pointer hover:bg-gray-50 p-2 rounded -mx-2"
                             onClick={() => handleMeetingToggle(meeting.roomId)}
                           >
                             <div className="flex-1 min-w-0">
                               <div className="flex items-center gap-2">
                                 <h4 className="font-semibold text-midnight text-sm truncate">{meeting.title}</h4>
                                 {expandedMeetings.has(meeting.roomId) ? (
                                   <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                   </svg>
                                 ) : (
                                   <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                   </svg>
                                 )}
                               </div>
                               <p className="text-xs text-gray-500 mt-0.5">
                                 {formatDate(meeting.createdAt)}
                                 {(() => {
                                   const unreadCount = getUnreadCount(meeting);
                                   return unreadCount > 0 ? (
                                     <span className="ml-2 bg-techBlue text-white px-2 py-0.5 rounded-full text-xs font-semibold">
                                       {unreadCount} new
                                     </span>
                                   ) : null;
                                 })()}
                               </p>
                             </div>
                             {meeting.status === 'ended' && (
                               <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded ml-2">Ended</span>
                             )}
                           </div>

                                                       {/* Messages Preview - WhatsApp Style - Only show when expanded */}
                            {expandedMeetings.has(meeting.roomId) && (
                            <div className="space-y-0.5 max-h-96 overflow-y-auto mt-3 border-t border-gray-100 pt-3">
                                                                {meeting.messages.map((message: any) => {                                                                             
                                   const isOwnMessage = message.uid === user?.uid;
                                   return (
                                     <div
                                       key={message.id}
                                       className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} group`}                                                                      
                                     >
                                       <div className={`max-w-[95%] ${isOwnMessage ? 'order-2' : 'order-1'} relative`}>                                                                
                                        {!isOwnMessage && (
                                          <p className="text-xs sm:text-sm font-semibold text-white/90 mb-0.5 px-1">                                                                
                                            {message.displayName || 'Unknown'}
                                          </p>
                                        )}
                                        <div
                                          className={`rounded-lg px-3 py-2 relative ${  
                                            isOwnMessage
                                              ? 'bg-gradient-to-br from-techBlue to-techBlue/90 text-white'                                                                         
                                              : 'bg-white/95 text-gray-800'
                                          }`}
                                        >
                                          <p className="text-sm sm:text-base break-words">{message.text}</p>                                                                        
                                          <div className="flex items-center justify-end gap-2 mt-1">                                                                                
                                            <p className={`text-xs ${
                                              isOwnMessage ? 'text-white/70' : 'text-gray-500'                                                                                      
                                            }`}>
                                              {formatTime(message.createdAt)}
                                            </p>
                                            {/* Delete button */}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteMessage(meeting.roomId, message.id);                                                                                    
                                              }}
                                              className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity"                                                     
                                              title="Delete message for you"
                                            >
                                              <svg className={`w-3.5 h-3.5 ${
                                                isOwnMessage ? 'text-white/70' : 'text-gray-500'                                                                                    
                                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">                                                                            
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />                          
                                              </svg>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                                                                                                                                                                                                                                                       })}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
           </div>
         </div>
      </main>

      {/* Success Dialog */}
      {showSuccessDialog && createdMeeting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-cloud rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-midnight mb-2">Meeting Scheduled!</h2>
              <p className="text-gray-600">Your meeting has been created successfully</p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-midnight mb-2">Host Link (Private)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={createdMeeting.hostLink}
                    readOnly
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdMeeting.hostLink);
                      toast.success('Host link copied!');
                    }}
                    className="px-4 py-2 bg-techBlue text-cloud rounded-lg hover:bg-techBlue/90"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-midnight mb-2">Participant Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={createdMeeting.participantLink}
                    readOnly
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdMeeting.participantLink);
                      toast.success('Participant link copied!');
                    }}
                    className="px-4 py-2 bg-techBlue text-cloud rounded-lg hover:bg-techBlue/90"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {createdMeeting.passcode && (
                <div>
                  <label className="block text-sm font-medium text-midnight mb-2">
                    Meeting Passcode (6-digit) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={createdMeeting.passcode}
                      readOnly
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-yellow-50 text-gray-900 font-mono font-semibold text-center text-lg tracking-widest"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdMeeting.passcode!);
                        toast.success('Passcode copied!');
                      }}
                      className="px-4 py-2 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 font-medium"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    ⚠️ Share this 6-digit passcode with participants separately. They'll need it to join the meeting.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setShowSuccessDialog(false);
                setCreatedMeeting(null);
              }}
              className="mt-4 w-full text-gray-600 hover:text-gray-800 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Feedback Popup */}
      {showFeedbackPopup && feedbackMeetingId && (
        <FeedbackPopup
          isOpen={showFeedbackPopup}
          onClose={() => {
            setShowFeedbackPopup(false);
            setFeedbackMeetingId(null);
            setFeedbackMeetingDuration(0);
          }}
          onSubmit={async (feedbackData: FeedbackData) => {
            if (!user || !userProfile || !feedbackMeetingId) return;

            try {
              // Get room data for host ID
              const roomData = await getRoomData(feedbackMeetingId);
              
              await saveFeedback(
                user.uid,
                userProfile.displayName,
                feedbackMeetingId,
                roomData?.createdBy,
                feedbackMeetingDuration,
                feedbackData
              );

              toast.success('Thank you for your feedback!');
              setShowFeedbackPopup(false);
              setFeedbackMeetingId(null);
              setFeedbackMeetingDuration(0);
            } catch (error: any) {
              console.error('Error submitting feedback:', error);
              toast.error('We couldn\'t save your feedback, but your meeting has already ended.');
            }
          }}
          meetingId={feedbackMeetingId}
          meetingDuration={feedbackMeetingDuration}
        />
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={upgradeModalProps.isOpen}
        onClose={() => setUpgradeModalProps({ isOpen: false })}
        title={upgradeModalProps.title}
        message={upgradeModalProps.message}
        feature={upgradeModalProps.feature}
        currentTier={upgradeModalProps.currentTier}
        reasonCode={upgradeModalProps.reasonCode}
      />
    </div>
  );
};

export default HomePage;
