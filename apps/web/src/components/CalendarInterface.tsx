import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';
import CalendarConnectionModal from './CalendarConnectionModal';
import CalendarDatePicker from './CalendarDatePicker';
import CalendarSettingsModal from './CalendarSettingsModal';
import HelpSupportModal from './HelpSupportModal';
import ICAL from 'ical.js';

interface CalendarInterfaceProps {
  onScheduleMeeting?: (selectedDate?: Date) => void;
  refreshKey?: number; // Key to force refresh when changed
}

const CalendarInterface: React.FC<CalendarInterfaceProps> = ({ onScheduleMeeting, refreshKey }) => {
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
  const [scheduledMeetings, setScheduledMeetings] = useState<any[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [calendarSettings, setCalendarSettings] = useState<{
    timezone?: string;
    timeFormat?: '12h' | '24h';
    defaultView?: 'day' | 'week' | 'month';
  } | null>(null);

  const handleScheduleMeeting = () => {
    if (onScheduleMeeting) {
      // Pass the current selected date
      onScheduleMeeting(currentDate);
    } else {
      // Fallback: create room directly (old behavior)
      handleCreateRoom();
    }
  };

  const handleStartMeeting = async (meeting: any) => {
    if (!user || meeting.ownerUid !== user.uid) {
      toast.error('Only the meeting host can start the meeting');
      return;
    }

    // If hostJoinKey is not available, try to fetch it from Firestore
    let hostJoinKey = meeting.hostJoinKey;
    
    if (!hostJoinKey) {
      try {
        console.log('[CalendarInterface] Fetching hostJoinKey for meeting:', meeting.id);
        const meetingDoc = await getDoc(doc(db, 'meetings', meeting.id));
        if (meetingDoc.exists()) {
          const meetingData = meetingDoc.data();
          hostJoinKey = meetingData.hostJoinKey;
          console.log('[CalendarInterface] Found hostJoinKey:', hostJoinKey ? 'yes' : 'no');
        }
      } catch (error: any) {
        console.error('[CalendarInterface] Error fetching hostJoinKey:', error);
        toast.error('Failed to load meeting link');
        return;
      }
    }

    if (!hostJoinKey) {
      toast.error('Meeting link not available. Please check the meeting details.');
      return;
    }

    // Navigate to join page with host key
    const hostLink = `/join/${meeting.id}?k=${hostJoinKey}`;
    console.log('[CalendarInterface] Navigating to:', hostLink);
    navigate(hostLink);
  };

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
      // Check if click is outside dropdown container AND not on a button inside the dropdown
      if (!target.closest('.dropdown-container') && !target.closest('.dropdown-menu-item')) {
        setShowDatePicker(false);
        setShowOptionsMenu(false);
        setShowViewPicker(false);
      }
    };

    // Use click instead of mousedown to allow onClick handlers to fire first
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Load calendar connection status and settings on component mount
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

    const loadCalendarSettings = async () => {
      if (!user) return;

      try {
        const settingsRef = doc(db, 'users', user.uid, 'settings', 'calendar');
        const settingsDoc = await getDoc(settingsRef);
        
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setCalendarSettings({
            timezone: data.timezone,
            timeFormat: data.timeFormat,
            defaultView: data.defaultView,
          });
          
          // Apply default view if set
          if (data.defaultView && ['day', 'week', 'month'].includes(data.defaultView)) {
            setCalendarView(data.defaultView as 'day' | 'week' | 'month');
          }
        }
      } catch (error) {
        console.error('Error loading calendar settings:', error);
      }
    };

    loadCalendarStatus();
    loadCalendarSettings();
  }, [user]);

  // Load scheduled meetings
  useEffect(() => {
    if (!user) return;
    loadScheduledMeetings();
  }, [user, currentDate, calendarView, refreshKey]);

  const loadScheduledMeetings = async () => {
    if (!user) return;
    
    setIsLoadingMeetings(true);
    try {
      // Fetch ALL scheduled meetings for the user (not filtered by date range)
      // This ensures all meetings are visible regardless of calendar view
      const meetingsQuery = query(
        collection(db, 'meetings'),
        where('ownerUid', '==', user.uid),
        where('status', '==', 'scheduled')
      );
      
      const meetingsSnapshot = await getDocs(meetingsQuery);
      const now = new Date();
      
      const meetings = meetingsSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Ensure hostJoinKey is included
            hostJoinKey: data.hostJoinKey || null,
          };
        })
        .filter((meeting: any) => {
          // Filter out meetings that have already passed
          const meetingStart = meeting.startAt?.toDate ? meeting.startAt.toDate() : new Date(meeting.startAt);
          // Only show meetings that haven't started yet (future meetings)
          return meetingStart > now;
        });
      
      // Sort by start date (earliest first)
      meetings.sort((a: any, b: any) => {
        const dateA = a.startAt?.toDate ? a.startAt.toDate() : new Date(a.startAt);
        const dateB = b.startAt?.toDate ? b.startAt.toDate() : new Date(b.startAt);
        return dateA.getTime() - dateB.getTime();
      });
      
      console.log('[CalendarInterface] Loaded scheduled meetings:', meetings.length, meetings);
      setScheduledMeetings(meetings);
    } catch (error: any) {
      console.error('[CalendarInterface] Error loading scheduled meetings:', error);
      toast.error('Failed to load scheduled meetings: ' + error.message);
    } finally {
      setIsLoadingMeetings(false);
    }
  };

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

  // Import calendar from .ics file
  const handleImportCalendar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.ics')) {
      toast.error('Please select a valid .ics file');
      return;
    }

    if (!user) {
      toast.error('You must be logged in to import calendar');
      return;
    }

    try {
      const fileContent = await file.text();
      const jcalData = ICAL.parse(fileContent);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      let importedCount = 0;
      let skippedCount = 0;

      for (const vevent of vevents) {
        try {
          const event = new ICAL.Event(vevent);
          const summary = event.summary || 'Imported Event';
          const description = event.description || '';
          const startDate = event.startDate.toJSDate();
          const endDate = event.endDate.toJSDate();
          
          // Skip past events
          if (startDate < new Date()) {
            skippedCount++;
            continue;
          }

          const durationMs = endDate.getTime() - startDate.getTime();
          const durationMin = Math.round(durationMs / (1000 * 60));

          // Save to users/{uid}/events collection
          await addDoc(collection(db, 'users', user.uid, 'events'), {
            title: summary,
            description: description,
            startAt: Timestamp.fromDate(startDate),
            endAt: Timestamp.fromDate(endDate),
            durationMin: durationMin,
            importedAt: serverTimestamp(),
            source: 'imported',
          });

          importedCount++;
        } catch (error: any) {
          console.error('Error importing event:', error);
          skippedCount++;
        }
      }

      toast.success(`Imported ${importedCount} event(s)${skippedCount > 0 ? `, skipped ${skippedCount} past event(s)` : ''}`);
      
      // Refresh scheduled meetings
      loadScheduledMeetings();
    } catch (error: any) {
      console.error('Error importing calendar:', error);
      toast.error('Failed to import calendar: ' + error.message);
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Export calendar to .ics file
  const handleExportCalendar = async () => {
    if (!user) {
      toast.error('You must be logged in to export calendar');
      return;
    }

    try {
      // Fetch all scheduled meetings
      const meetingsQuery = query(
        collection(db, 'meetings'),
        where('ownerUid', '==', user.uid),
        where('status', '==', 'scheduled')
      );
      
      const meetingsSnapshot = await getDocs(meetingsQuery);
      const now = new Date();
      
      const events: any[] = [];
      
      meetingsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const startDate = data.startAt?.toDate ? data.startAt.toDate() : new Date(data.startAt);
        
        // Only include future meetings
        if (startDate > now) {
          const endDate = data.endAt?.toDate ? data.endAt.toDate() : new Date(data.endAt);
          
          events.push({
            title: data.title || 'Meeting',
            description: data.description || '',
            start: [
              startDate.getFullYear(),
              startDate.getMonth() + 1,
              startDate.getDate(),
              startDate.getHours(),
              startDate.getMinutes(),
            ],
            end: [
              endDate.getFullYear(),
              endDate.getMonth() + 1,
              endDate.getDate(),
              endDate.getHours(),
              endDate.getMinutes(),
            ],
            location: window.location.origin + `/join/${doc.id}`,
            url: window.location.origin + `/join/${doc.id}`,
          });
        }
      });

      if (events.length === 0) {
        toast.error('No scheduled meetings to export');
        return;
      }

      // Generate .ics file manually
      let icsContent = 'BEGIN:VCALENDAR\r\n';
      icsContent += 'VERSION:2.0\r\n';
      icsContent += 'PRODID:-//Habs Meet//Calendar Export//EN\r\n';
      icsContent += 'CALSCALE:GREGORIAN\r\n';
      
      for (const event of events) {
        const startDate = new Date(event.start[0], event.start[1] - 1, event.start[2], event.start[3], event.start[4]);
        const endDate = new Date(event.end[0], event.end[1] - 1, event.end[2], event.end[3], event.end[4]);
        
        const formatDate = (date: Date) => {
          return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };
        
        icsContent += 'BEGIN:VEVENT\r\n';
        icsContent += `DTSTART:${formatDate(startDate)}\r\n`;
        icsContent += `DTEND:${formatDate(endDate)}\r\n`;
        icsContent += `SUMMARY:${event.title.replace(/\n/g, '\\n')}\r\n`;
        if (event.description) {
          icsContent += `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}\r\n`;
        }
        if (event.location) {
          icsContent += `LOCATION:${event.location}\r\n`;
        }
        if (event.url) {
          icsContent += `URL:${event.url}\r\n`;
        }
        icsContent += 'END:VEVENT\r\n';
      }
      
      icsContent += 'END:VCALENDAR\r\n';

      // Download file
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'habs-calendar.ics';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${events.length} meeting(s) to calendar file`);
    } catch (error: any) {
      console.error('Error exporting calendar:', error);
      toast.error('Failed to export calendar: ' + error.message);
    }
  };


  // Format time based on user's time format preference
  const formatTime = (date: Date) => {
    const timeFormat = calendarSettings?.timeFormat || '12h';
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: timeFormat === '12h'
    });
  };

  const currentTime = new Date();
  const timeString = formatTime(currentTime);
  const dateString = currentTime.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric',
    timeZone: calendarSettings?.timezone || undefined
  });

  // Format current date for display (using user's timezone preference)
  const formatCurrentDate = () => {
    const timezone = calendarSettings?.timezone;
    const options: Intl.DateTimeFormatOptions = { timeZone: timezone };
    
    if (calendarView === 'day') {
      return currentDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric',
        ...options
      });
    } else if (calendarView === 'week') {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day;
      startOfWeek.setDate(diff);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...options })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...options })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric',
        ...options
      });
    }
  };

  return (
    <div className="bg-cloud rounded-2xl shadow-2xl overflow-hidden">
      {/* Header with time and date */}
      <div className="bg-gradient-to-r from-techBlue to-violetDeep p-3 sm:p-4 text-center relative">
        <div className="absolute left-2 sm:left-3 top-2 sm:top-3 w-5 h-5 sm:w-6 sm:h-6 bg-green-500 rounded-full flex items-center justify-center">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-white rounded-full"></div>
        </div>
        <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-cloud mb-1">{timeString}</div>
        <div className="text-cloud text-xs sm:text-sm lg:text-base">{dateString}</div>
        <div className="absolute right-0 top-0 p-2 sm:p-3 dropdown-container z-10">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowOptionsMenu(!showOptionsMenu);
            }}
            className="p-1.5 sm:p-2 text-cloud hover:text-cloud/80 transition-colors flex items-center justify-center"
            title="Calendar options"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          
          {/* Options menu dropdown */}
          {showOptionsMenu && (
            <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-48">
              <div className="p-2">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSettingsModal(true);
                    setShowOptionsMenu(false);
                  }}
                  className="dropdown-menu-item w-full text-left px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-100"
                >
                  Calendar Settings
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                    setShowOptionsMenu(false);
                  }}
                  className="dropdown-menu-item w-full text-left px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-100"
                >
                  Import Calendar
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExportCalendar();
                    setShowOptionsMenu(false);
                  }}
                  className="dropdown-menu-item w-full text-left px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-100"
                >
                  Export Calendar
                </button>
                <hr className="my-1" />
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowHelpModal(true);
                    setShowOptionsMenu(false);
                  }}
                  className="dropdown-menu-item w-full text-left px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-100"
                >
                  Help & Support
                </button>
              </div>
            </div>
          )}
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
        </div>
      </div>

      {/* Calendar content */}
      <div className="p-4 sm:p-6 lg:p-8">
        {isLoadingMeetings ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-techBlue mx-auto mb-4"></div>
            <p className="text-gray-600">Loading meetings...</p>
          </div>
        ) : scheduledMeetings.length === 0 ? (
          <div className="text-center">
            <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4 sm:mb-6 flex items-center justify-center">
              <svg className="w-16 h-16 sm:w-24 sm:h-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 3v4M16 3v4M3 7h18" />
              </svg>
            </div>
            
            <h3 className="text-xl font-semibold text-midnight mb-4">No meetings scheduled.</h3>
            
            <button
              onClick={handleScheduleMeeting}
              disabled={isCreatingRoom}
              className="inline-flex items-center px-6 py-3 bg-techBlue text-cloud rounded-lg font-semibold hover:bg-techBlue/90 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              {isCreatingRoom ? 'Scheduling...' : 'Schedule a meeting'}
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-midnight">
                {scheduledMeetings.length} {scheduledMeetings.length === 1 ? 'Meeting' : 'Meetings'} Scheduled
              </h3>
              <button
                onClick={handleScheduleMeeting}
                disabled={isCreatingRoom}
                className="inline-flex items-center px-4 py-2 bg-techBlue text-cloud rounded-lg font-medium hover:bg-techBlue/90 transition-colors disabled:opacity-50 text-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Schedule Meeting
              </button>
            </div>
            
            <div className="space-y-3">
              {scheduledMeetings.map((meeting: any) => {
                const startTime = meeting.startAt?.toDate ? meeting.startAt.toDate() : new Date(meeting.startAt);
                const endTime = meeting.endAt?.toDate ? meeting.endAt.toDate() : new Date(meeting.endAt);
                const isHost = user && meeting.ownerUid === user.uid;
                const canStart = isHost && meeting.hostJoinKey;
                
                return (
                  <div
                    key={meeting.id}
                    className={`bg-white border border-gray-200 rounded-lg p-4 transition-all ${
                      canStart 
                        ? 'hover:shadow-lg hover:border-techBlue cursor-pointer' 
                        : 'hover:shadow-md'
                    }`}
                    onClick={canStart ? () => handleStartMeeting(meeting) : undefined}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-semibold text-midnight">{meeting.title}</h4>
                          {canStart && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                              Click to Start
                            </span>
                          )}
                        </div>
                        {meeting.description && (
                          <p className="text-sm text-gray-600 mb-2">{meeting.description}</p>
                        )}
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>{startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          </div>
                          <div className="flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>
                              {formatTime(startTime)} - {formatTime(endTime)}
                            </span>
                          </div>
                          {meeting.durationMin && (
                            <span className="text-gray-400">({meeting.durationMin} min)</span>
                          )}
                        </div>
                      </div>
                      {canStart && (
                        <div className="ml-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartMeeting(meeting);
                            }}
                            className="px-4 py-2 bg-techBlue text-cloud rounded-lg font-medium hover:bg-techBlue/90 transition-colors text-sm"
                          >
                            Start
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input for calendar import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ics"
        style={{ display: 'none' }}
        onChange={handleImportCalendar}
      />

      {/* Calendar Connection Modal */}
      <CalendarConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onConnect={handleCalendarConnect}
      />

      {/* Calendar Settings Modal */}
      <CalendarSettingsModal
        isOpen={showSettingsModal}
        onClose={() => {
          setShowSettingsModal(false);
          // Reload settings after closing modal
          if (user) {
            const settingsRef = doc(db, 'users', user.uid, 'settings', 'calendar');
            getDoc(settingsRef).then((settingsDoc) => {
              if (settingsDoc.exists()) {
                const data = settingsDoc.data();
                setCalendarSettings({
                  timezone: data.timezone,
                  timeFormat: data.timeFormat,
                  defaultView: data.defaultView,
                });
                // Apply default view if changed
                if (data.defaultView && ['day', 'week', 'month'].includes(data.defaultView)) {
                  setCalendarView(data.defaultView as 'day' | 'week' | 'month');
                }
              }
            }).catch((error) => {
              console.error('Error reloading calendar settings:', error);
            });
          }
        }}
        connectedCalendar={connectedCalendar}
        onDisconnect={handleCalendarDisconnect}
      />

      {/* Help & Support Modal */}
      <HelpSupportModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
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
