import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MeetingService } from '../lib/meetingService';
import toast from 'react-hot-toast';
import Header from '../components/Header';
import CalendarInterface from '../components/CalendarInterface';
import ShareScreen from '../components/ShareScreen';
import { collection, query, getDocs, orderBy, limit, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const HomePage: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [inviteLink, setInviteLink] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'schedule' | 'share'>('calendar');
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [recentMeetingsWithMessages, setRecentMeetingsWithMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isMessageSystemOpen, setIsMessageSystemOpen] = useState(false);

  const handleCreateRoom = async () => {
    if (!user || !userProfile) return;

    setIsCreatingRoom(true);
    try {
      const roomId = await MeetingService.createMeeting(
        `${userProfile.displayName || user.email?.split('@')[0]}'s Habs Meet`,
        user.uid,
        userProfile.displayName || user.email?.split('@')[0] || 'User',
        'Professional meeting room with video and audio capabilities'
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
      toast.error('Failed to create meeting: ' + error.message);
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

  const handleTabClick = (tab: 'calendar' | 'schedule' | 'share') => {
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
              rooms.push({
                roomId,
                title: roomData.title || 'Untitled Meeting',
                createdAt: roomData.createdAt,
                endedAt: roomData.endedAt,
                status: roomData.status || 'open',
                messages,
                participantData: participantSnap.data()
              });
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

    loadRecentMeetingsWithMessages();
  }, [user]);

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
              <button
                onClick={() => handleTabClick('share')}
                className={`px-3 sm:px-6 py-2 sm:py-3 rounded-md font-medium transition-colors text-sm sm:text-base ${
                  activeTab === 'share' && isMobilePanelOpen
                    ? 'bg-techBlue text-cloud'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Share Screen
              </button>
            </div>
          </div>

          {/* Mobile & Tablet Sliding Panel */}
          {isMobilePanelOpen && (
            <div className="lg:hidden mb-4">
              <div className="bg-cloud rounded-2xl shadow-2xl overflow-hidden">
                {activeTab === 'calendar' && <CalendarInterface />}
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
                    <div className="max-w-md mx-auto space-y-4 sm:space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-midnight mb-2">
                          Meeting Title
                        </label>
                        <input
                          type="text"
                          placeholder="Enter meeting title"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900 placeholder-gray-500"
                          style={{color: '#111827', backgroundColor: 'white'}}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-midnight mb-2">
                          Date & Time
                        </label>
                        <input
                          type="datetime-local"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900"
                          style={{color: '#111827', backgroundColor: 'white'}}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-midnight mb-2">
                          Duration
                        </label>
                        <select className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900" style={{color: '#111827', backgroundColor: 'white'}}>
                          <option>15 minutes</option>
                          <option>30 minutes</option>
                          <option>1 hour</option>
                          <option>2 hours</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-midnight mb-2">
                          Description
                        </label>
                        <textarea
                          rows={4}
                          placeholder="Meeting description or agenda"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent resize-none text-gray-900 placeholder-gray-500"
                          style={{color: '#111827', backgroundColor: 'white'}}
                        />
                      </div>
                      <button
                        onClick={handleCreateRoom}
                        disabled={isCreatingRoom}
                        className="w-full bg-techBlue text-cloud py-3 px-4 rounded-lg font-medium hover:bg-techBlue/90 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <span>{isCreatingRoom ? 'Creating...' : 'Schedule Meeting'}</span>
                      </button>
                    </div>
                  </div>
                )}
                {activeTab === 'share' && (
                  <div className="p-4 sm:p-6 lg:p-8">
                    <div className="text-center mb-6 sm:mb-8">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-violetDeep rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-cloud" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-midnight mb-2 sm:mb-4">Share Your Screen</h2>
                      <p className="text-gray-600 mb-6 sm:mb-8 text-sm sm:text-base">
                        Share your screen with meeting participants for presentations and collaboration
                      </p>
                    </div>
                    <div className="max-w-md mx-auto">
                      <ShareScreen />
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
              {activeTab === 'calendar' && <CalendarInterface />}
              
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

                  <div className="max-w-md mx-auto space-y-4 sm:space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-midnight mb-2">
                        Meeting Title
                      </label>
                      <input
                        type="text"
                        placeholder="Enter meeting title"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900 placeholder-gray-500"
                        style={{color: '#111827', backgroundColor: 'white'}}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-midnight mb-2">
                        Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900"
                        style={{color: '#111827', backgroundColor: 'white'}}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-midnight mb-2">
                        Duration (minutes)
                      </label>
                      <select className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900" style={{color: '#111827', backgroundColor: 'white'}}>
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                        <option value="90">1.5 hours</option>
                        <option value="120">2 hours</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-midnight mb-2">
                        Description
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Meeting description or agenda"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent resize-none text-gray-900 placeholder-gray-500"
                        style={{color: '#111827', backgroundColor: 'white'}}
                      />
                    </div>

                    <button
                      onClick={handleCreateRoom}
                      disabled={isCreatingRoom}
                      className="w-full bg-techBlue text-cloud py-3 px-6 rounded-lg font-semibold hover:bg-techBlue/90 transition-colors disabled:opacity-50"
                    >
                      {isCreatingRoom ? 'Scheduling...' : 'Schedule Meeting'}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'share' && (
                <div className="bg-cloud rounded-2xl shadow-2xl p-4 sm:p-6 lg:p-8">
                  <div className="text-center mb-6 sm:mb-8">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-violetDeep rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                      <svg className="w-6 h-6 sm:w-8 sm:h-8 text-cloud" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-midnight mb-2 sm:mb-4">Share Your Screen</h2>
                    <p className="text-gray-600 mb-6 sm:mb-8 text-sm sm:text-base">
                      Share your screen with meeting participants for presentations and collaboration
                    </p>
                  </div>

                  <div className="max-w-md mx-auto">
                    <ShareScreen />
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
                    {recentMeetingsWithMessages.length > 0 && (
                      <span className="bg-techBlue text-white text-xs font-bold rounded-full px-2 py-0.5">
                        {recentMeetingsWithMessages.reduce((sum, m) => sum + m.messages.length, 0)}
                      </span>
                    )}
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
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-midnight text-sm truncate">{meeting.title}</h4>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {formatDate(meeting.createdAt)} • {meeting.messages.length} message{meeting.messages.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                              {meeting.status === 'ended' && (
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded ml-2">Ended</span>
                              )}
                            </div>
                            
                            {/* Messages Preview - WhatsApp Style */}
                            <div className="space-y-2 max-h-48 overflow-y-auto mt-3 border-t border-gray-100 pt-3">
                              {meeting.messages.slice(-5).map((message: any) => {
                                const isOwnMessage = message.uid === user?.uid;
                                return (
                                  <div 
                                    key={message.id} 
                                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                                  >
                                    <div className={`max-w-[75%] ${isOwnMessage ? 'order-2' : 'order-1'}`}>
                                      {!isOwnMessage && (
                                        <p className="text-xs font-medium text-gray-700 mb-1 px-1">
                                          {message.displayName || 'Unknown'}
                                        </p>
                                      )}
                                      <div
                                        className={`rounded-lg px-3 py-2 ${
                                          isOwnMessage
                                            ? 'bg-techBlue text-white'
                                            : 'bg-gray-100 text-gray-800'
                                        }`}
                                      >
                                        <p className="text-xs break-words">{message.text}</p>
                                      </div>
                                      <p className={`text-xs text-gray-400 mt-0.5 px-1 ${
                                        isOwnMessage ? 'text-right' : 'text-left'
                                      }`}>
                                        {formatTime(message.createdAt)}
                                      </p>
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
                  {recentMeetingsWithMessages.length > 0 && (
                    <span className="bg-techBlue text-white text-xs font-bold rounded-full px-2 py-0.5">
                      {recentMeetingsWithMessages.reduce((sum, m) => sum + m.messages.length, 0)}
                    </span>
                  )}
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
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-midnight text-sm truncate">{meeting.title}</h4>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {formatDate(meeting.createdAt)} • {meeting.messages.length} message{meeting.messages.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            {meeting.status === 'ended' && (
                              <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded ml-2">Ended</span>
                            )}
                          </div>
                          
                          {/* Messages Preview - WhatsApp Style */}
                          <div className="space-y-2 max-h-48 overflow-y-auto mt-3 border-t border-gray-100 pt-3">
                            {meeting.messages.slice(-5).map((message: any) => {
                              const isOwnMessage = message.uid === user?.uid;
                              return (
                                <div 
                                  key={message.id} 
                                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div className={`max-w-[75%] ${isOwnMessage ? 'order-2' : 'order-1'}`}>
                                    {!isOwnMessage && (
                                      <p className="text-xs font-medium text-gray-700 mb-1 px-1">
                                        {message.displayName || 'Unknown'}
                                      </p>
                                    )}
                                    <div
                                      className={`rounded-lg px-3 py-2 ${
                                        isOwnMessage
                                          ? 'bg-techBlue text-white'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      <p className="text-sm break-words">{message.text}</p>
                                    </div>
                                    <p className={`text-xs text-gray-400 mt-0.5 px-1 ${
                                      isOwnMessage ? 'text-right' : 'text-left'
                                    }`}>
                                      {formatTime(message.createdAt)}
                                    </p>
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
    </div>
  );
};

export default HomePage;
