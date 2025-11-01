import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MeetingService } from '../lib/meetingService';
import toast from 'react-hot-toast';
import Header from '../components/Header';
import CalendarInterface from '../components/CalendarInterface';
import ShareScreen from '../components/ShareScreen';

const HomePage: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [inviteLink, setInviteLink] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'schedule' | 'share'>('calendar');
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

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



  return (
    <div className="min-h-screen bg-midnight">
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
                <div className="bg-gradient-to-b from-purple-500 to-blue-600 rounded-lg p-4 sm:p-6 text-white">
                  <div className="text-center">
                    {/* Icon */}
                    <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    
                    {/* Title */}
                    <h3 className="text-xl font-bold mb-2">Create Meeting</h3>
                    
                    {/* Description */}
                    <p className="text-sm text-white/90 mb-4">
                  Start a new meeting and invite participants with secure links.
                </p>
                    
                    {/* Button */}
                <button
                  onClick={handleCreateRoom}
                  disabled={isCreatingRoom}
                      className="w-full bg-yellow-400 text-black py-3 px-4 rounded-lg font-medium hover:bg-yellow-300 transition-colors disabled:opacity-50"
                >
                  {isCreatingRoom ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </div>

            {/* Join Meeting Card */}
                <div className="bg-gradient-to-b from-purple-500 to-blue-600 rounded-lg p-4 sm:p-6 text-white">
              <div className="text-center">
                    {/* Icon */}
                    <div className="w-16 h-16 bg-purple-400 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                    
                    {/* Title */}
                    <h3 className="text-xl font-bold mb-2">Join Meeting</h3>
                    
                    {/* Description */}
                    <p className="text-sm text-white/90 mb-4">
                  Enter an invite link to join an existing meeting.
                </p>
                    
                    {/* Input Field */}
                  <input
                    type="url"
                    placeholder="Paste invite link here..."
                    value={inviteLink}
                    onChange={(e) => setInviteLink(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900 placeholder-gray-500 mb-4"
                      style={{color: '#111827', backgroundColor: 'white'}}
                  />
                    
                    {/* Button */}
                  <button
                    onClick={handleJoinWithInvite}
                      className="w-full bg-purple-400 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-300 transition-colors"
                  >
                    Join Meeting
                  </button>
              </div>
            </div>
          </div>

              {/* Recent Meetings */}
              <div className="bg-cloud rounded-lg p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-midnight mb-3 sm:mb-4">Recent Meetings</h3>
                <div className="space-y-3">
                  <div className="text-sm text-gray-500 text-center py-4">
                    No recent meetings
              </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile & Tablet content when panel is closed */}
          <div className={`lg:hidden ${isMobilePanelOpen ? 'hidden' : 'block'}`}>
            {/* Quick Actions Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Create Meeting Card */}
              <div className="bg-gradient-to-b from-purple-500 to-blue-600 rounded-lg p-4 sm:p-6 text-white">
                <div className="text-center">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  
                  {/* Title */}
                  <h3 className="text-xl font-bold mb-2">Create Meeting</h3>
                  
                  {/* Description */}
                  <p className="text-sm text-white/90 mb-4">
                    Start a new meeting and invite participants with secure links.
                  </p>
                  
                  {/* Button */}
                  <button
                    onClick={handleCreateRoom}
                    disabled={isCreatingRoom}
                    className="w-full bg-yellow-400 text-black py-3 px-4 rounded-lg font-medium hover:bg-yellow-300 transition-colors disabled:opacity-50"
                  >
                    {isCreatingRoom ? 'Creating...' : 'Create Room'}
                  </button>
                </div>
              </div>

              {/* Join Meeting Card */}
              <div className="bg-gradient-to-b from-purple-500 to-blue-600 rounded-lg p-4 sm:p-6 text-white">
                <div className="text-center">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-purple-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
            </div>

                  {/* Title */}
                  <h3 className="text-xl font-bold mb-2">Join Meeting</h3>
                  
                  {/* Description */}
                  <p className="text-sm text-white/90 mb-4">
                    Enter an invite link to join an existing meeting.
                  </p>
                  
                  {/* Input Field */}
                  <input
                    type="url"
                    placeholder="Paste invite link here..."
                    value={inviteLink}
                    onChange={(e) => setInviteLink(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900 placeholder-gray-500 mb-4"
                    style={{color: '#111827', backgroundColor: 'white'}}
                  />
                  
                  {/* Button */}
                  <button
                    onClick={handleJoinWithInvite}
                    className="w-full bg-purple-400 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-300 transition-colors"
                  >
                    Join Meeting
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Meetings */}
            <div className="bg-cloud rounded-lg p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-midnight mb-3 sm:mb-4">Recent Meetings</h3>
              <div className="space-y-3">
                <div className="text-sm text-gray-500 text-center py-4">
                  No recent meetings
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default HomePage;
