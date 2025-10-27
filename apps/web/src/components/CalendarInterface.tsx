import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';
import CalendarConnectionModal from './CalendarConnectionModal';
import CalendarDatePicker from './CalendarDatePicker';

const CalendarInterface: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [connectedCalendar, setConnectedCalendar] = useState<'google' | 'microsoft' | null>(null);
  const [isLoadingCalendarStatus, setIsLoadingCalendarStatus] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('day');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showViewPicker, setShowViewPicker] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const handleCreateRoom = async () => {
    if (!user) return;

    setIsCreatingRoom(true);
    try {
      // Create room document
      const roomRef = await addDoc(collection(db, 'rooms'), {
        title: `${userProfile?.displayName || user.email}'s Meeting`,
        createdBy: user.uid,
        status: 'open',
        waitingRoom: false,
        createdAt: serverTimestamp(),
      });

      // Create host participant
      await addDoc(collection(db, 'rooms', roomRef.id, 'participants'), {
        uid: user.uid,
        role: 'host',
        joinedAt: serverTimestamp(),
      });

      toast.success('Meeting scheduled successfully!');
      navigate(`/room/${roomRef.id}`);
    } catch (error: any) {
      toast.error('Failed to schedule meeting: ' + error.message);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.dropdown-container')) {
        setShowDatePicker(false);
        setShowOptionsMenu(false);
        setShowViewPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load calendar connection status on component mount
  useEffect(() => {
    const loadCalendarStatus = async () => {
      if (!user) {
        setIsLoadingCalendarStatus(false);
        return;
      }

      try {
        // First check localStorage for quick access
        const localCalendarStatus = localStorage.getItem(`calendar_${user.uid}`);
        if (localCalendarStatus) {
          setConnectedCalendar(localCalendarStatus as 'google' | 'microsoft');
        }

        // Then check user profile in Firestore for authoritative data
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.connectedCalendar) {
            setConnectedCalendar(userData.connectedCalendar);
            // Update localStorage to match Firestore
            localStorage.setItem(`calendar_${user.uid}`, userData.connectedCalendar);
          }
        }
      } catch (error) {
        console.error('Error loading calendar status:', error);
      } finally {
        setIsLoadingCalendarStatus(false);
      }
    };

    loadCalendarStatus();
  }, [user]);

  const handleCalendarConnect = async (provider: 'google' | 'microsoft') => {
    if (!user) return;

    try {
      // Save to localStorage for immediate access
      localStorage.setItem(`calendar_${user.uid}`, provider);
      
      // Save to user profile in Firestore for persistence
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        connectedCalendar: provider,
        calendarConnectedAt: serverTimestamp()
      });

      setConnectedCalendar(provider);
      toast.success(`${provider === 'google' ? 'Google' : 'Microsoft'} Calendar connected successfully!`);
    } catch (error) {
      console.error('Error saving calendar connection:', error);
      toast.error('Failed to save calendar connection');
    }
  };

  const handleCalendarDisconnect = () => {
    setShowDisconnectConfirm(true);
  };

  const confirmCalendarDisconnect = async () => {
    if (!user) return;

    try {
      // Remove from localStorage
      localStorage.removeItem(`calendar_${user.uid}`);
      
      // Remove from user profile in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        connectedCalendar: null,
        calendarConnectedAt: null
      });

      setConnectedCalendar(null);
      setShowDisconnectConfirm(false);
      toast.success('Calendar disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting calendar:', error);
      toast.error('Failed to disconnect calendar');
    }
  };

  // Navigation functions
  const handlePreviousDate = () => {
    const newDate = new Date(currentDate);
    if (calendarView === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (calendarView === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNextDate = () => {
    const newDate = new Date(currentDate);
    if (calendarView === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (calendarView === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleViewChange = (view: 'day' | 'week' | 'month') => {
    setCalendarView(view);
    setShowViewPicker(false);
  };

  const handleDateSelect = (date: Date) => {
    setCurrentDate(date);
    setShowDatePicker(false);
  };


  const currentTime = new Date();
  const timeString = currentTime.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  const dateString = currentTime.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric' 
  });

  // Format current date for display
  const formatCurrentDate = () => {
    if (calendarView === 'day') {
      return currentDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    } else if (calendarView === 'week') {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day;
      startOfWeek.setDate(diff);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });
    }
  };

  return (
    <div className="bg-cloud rounded-2xl shadow-2xl overflow-hidden">
      {/* Header with time and date */}
      <div className="bg-gradient-to-r from-techBlue to-violetDeep p-4 sm:p-6 text-center relative">
        <div className="absolute left-2 sm:left-4 top-2 sm:top-4 w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-full flex items-center justify-center">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full"></div>
        </div>
        <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-cloud mb-2">{timeString}</div>
        <div className="text-cloud text-sm sm:text-base lg:text-lg">{dateString}</div>
        <div className="absolute right-4 top-4">
          <svg className="w-6 h-6 text-cloud" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </div>
      </div>

      {/* Calendar connection banner */}
      {isLoadingCalendarStatus ? (
        <div className="bg-gray-50 border-l-4 border-gray-300 p-4 flex items-center">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center mr-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-600">Loading calendar status...</p>
          </div>
        </div>
      ) : !connectedCalendar ? (
        <div className="bg-blue-50 border-l-4 border-techBlue p-4 flex items-center">
          <div className="w-8 h-8 bg-techBlue rounded-full flex items-center justify-center mr-3">
            <span className="text-cloud text-sm font-bold">i</span>
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              You haven't connected your calendar yet.{' '}
              <button 
                onClick={() => setIsConnectionModalOpen(true)}
                className="text-techBlue hover:underline font-medium"
              >
                Connect now
              </button>{' '}
              to manage all your meetings and events in one place.
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 flex items-center">
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-3">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-green-800">
                {connectedCalendar === 'google' ? 'Google' : 'Microsoft'} Calendar
              </span>{' '}
              is connected and syncing your meetings.
            </p>
          </div>
          <button 
            onClick={handleCalendarDisconnect}
            className="text-gray-400 hover:text-gray-600"
            title="Disconnect calendar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Calendar navigation */}
      <div className="p-3 sm:p-4 border-b border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
        <div className="flex items-center space-x-2 relative dropdown-container">
          <button 
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center space-x-2 font-semibold text-midnight hover:text-techBlue transition-colors"
          >
            <span>{formatCurrentDate()}</span>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Calendar Date Picker */}
          {showDatePicker && (
            <div className="absolute top-full left-0 mt-2 z-20">
              <CalendarDatePicker
                selectedDate={currentDate}
                onDateSelect={handleDateSelect}
                onClose={() => setShowDatePicker(false)}
              />
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap justify-center">
          {/* View Picker */}
          <div className="relative dropdown-container">
            <button 
              onClick={() => setShowViewPicker(!showViewPicker)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center space-x-1"
            >
              <span className="capitalize">{calendarView}</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* View picker dropdown */}
            {showViewPicker && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-32">
                <div className="p-2">
                  <div className="space-y-1">
                    <button
                      onClick={() => handleViewChange('day')}
                      className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                        calendarView === 'day' ? 'bg-techBlue text-white' : 'text-gray-700'
                      }`}
                    >
                      Day
                    </button>
                    <button
                      onClick={() => handleViewChange('week')}
                      className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                        calendarView === 'week' ? 'bg-techBlue text-white' : 'text-gray-700'
                      }`}
                    >
                      Week
                    </button>
                    <button
                      onClick={() => handleViewChange('month')}
                      className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 ${
                        calendarView === 'month' ? 'bg-techBlue text-white' : 'text-gray-700'
                      }`}
                    >
                      Month
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <button 
            onClick={handleToday}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Today
          </button>
          <button 
            onClick={handlePreviousDate}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            title={`Previous ${calendarView}`}
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button 
            onClick={handleNextDate}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            title={`Next ${calendarView}`}
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="relative dropdown-container">
            <button 
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              title="Calendar options"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            
            {/* Options menu dropdown */}
            {showOptionsMenu && (
              <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-48">
                <div className="p-2">
                  <button className="w-full text-left px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-100">
                    Calendar Settings
                  </button>
                  <button className="w-full text-left px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-100">
                    Import Calendar
                  </button>
                  <button className="w-full text-left px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-100">
                    Export Calendar
                  </button>
                  <hr className="my-1" />
                  <button className="w-full text-left px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-100">
                    Help & Support
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calendar content */}
      <div className="p-4 sm:p-6 lg:p-8 text-center">
        <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4 sm:mb-6 flex items-center justify-center">
          <svg className="w-16 h-16 sm:w-24 sm:h-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 3v4M16 3v4M3 7h18" />
          </svg>
        </div>
        
        <h3 className="text-xl font-semibold text-midnight mb-4">No meetings scheduled.</h3>
        
        <button
          onClick={handleCreateRoom}
          disabled={isCreatingRoom}
          className="inline-flex items-center px-6 py-3 bg-techBlue text-cloud rounded-lg font-semibold hover:bg-techBlue/90 transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {isCreatingRoom ? 'Scheduling...' : 'Schedule a meeting'}
        </button>
      </div>

      {/* Calendar Connection Modal */}
      <CalendarConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onConnect={handleCalendarConnect}
      />

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-cloud rounded-2xl shadow-2xl w-full max-w-md p-8 relative">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-midnight mb-2">Disconnect Calendar?</h2>
              <p className="text-gray-600">
                Are you sure you want to disconnect your{' '}
                <span className="font-medium text-techBlue">
                  {connectedCalendar === 'google' ? 'Google' : 'Microsoft'} Calendar
                </span>?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                You'll need to reconnect it to sync your meetings and events.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmCalendarDisconnect}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarInterface;
