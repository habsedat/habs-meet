import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../contexts/LiveKitContext';
import { api } from '../lib/api';
import { doc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MeetingService } from '../lib/meetingService';
import toast from '../lib/toast';
import MeetingControls from '../components/MeetingControls';
import MeetingShell from '../meeting/MeetingShell';
import ViewMenu from '../components/ViewMenu';
import ChatPanel from '../components/ChatPanel';
import PrivateMessagesPanel from '../components/PrivateMessagesPanel';
import ParticipantsPanel from '../components/ParticipantsPanel';
import SettingsPanel from '../components/SettingsPanel';
import { recordingService, RecordingService } from '../lib/recordingService';
import { ViewMode } from '../types/viewModes';
import { useCostOptimizations } from '../hooks/useCostOptimizations';

const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { connect, disconnect, isConnected, isConnecting, publishFromSavedSettings, room, participantCount, setMicrophoneEnabled } = useLiveKit();
  
  // Apply cost optimizations: active speaker quality, background pause, auto-disconnect
  useCostOptimizations(room);
  
  const [roomData, setRoomData] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [privateMessages, setPrivateMessages] = useState<any[]>([]);
  const [activePanel, setActivePanel] = useState<'chat' | 'inbox' | 'participants' | 'settings' | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [showBottomControls, setShowBottomControls] = useState(true);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [lastSeenMessageId, setLastSeenMessageId] = useState<string | null>(null);
  // Load view mode from localStorage or default to 'gallery'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('viewMode');
    if (saved && ['speaker', 'gallery', 'multi-speaker', 'immersive'].includes(saved)) {
      return saved as ViewMode;
    }
    return 'gallery'; // Default to gallery
  });

  // Load room data
  useEffect(() => {
    if (!roomId || !user) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (doc) => {
      if (doc.exists()) {
        const roomData = { id: doc.id, ...doc.data() } as any;
        setRoomData(roomData);
        setIsLocked(roomData.status === 'locked');
        
        // If room is ended, disconnect and leave
        if (roomData.status === 'ended') {
          toast('Meeting has ended', { icon: 'ℹ️' });
          disconnect();
          setTimeout(() => navigate('/'), 2000);
        }
      } else {
        toast.error('Room not found');
        navigate('/');
      }
    });

    return unsubscribe;
  }, [roomId, user, navigate, disconnect]);

  // Check if user is host (including cohost) and if they're banned
  useEffect(() => {
    if (!roomId || !user) return;

    const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
    const unsubscribeParticipant = onSnapshot(participantRef, (participantDoc) => {
      if (participantDoc.exists()) {
        const participantData = participantDoc.data() as any;
        // Both host and cohost have host privileges
        setIsHost(participantData.role === 'host' || participantData.role === 'cohost');
        
        // If user is banned, disconnect them immediately
        if (participantData.isBanned === true) {
          toast.error('You have been removed from this meeting');
          disconnect();
          setTimeout(() => navigate('/'), 2000);
        }
      }
    });

    return unsubscribeParticipant;
  }, [roomId, user, disconnect, navigate]);

  // Listen for mute/unmute notifications from host
  useEffect(() => {
    if (!roomId || !user || !isConnected) return;

    const notificationsRef = collection(db, 'rooms', roomId, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const notification = change.doc.data();
          
          // Only process notifications for this user
          if (notification.participantId === user.uid && !notification.read) {
            console.log('[RoomPage] Received mute notification:', notification);
            
            // Apply mute/unmute based on notification type
            if (notification.type === 'muted') {
              setMicrophoneEnabled(false).catch((err) => {
                console.error('[RoomPage] Failed to mute microphone:', err);
              });
              // Show popup notification
              toast.error(notification.message || 'Your microphone has been muted by the host', {
                duration: 5000,
                icon: '🔇'
              });
            } else if (notification.type === 'unmuted') {
              setMicrophoneEnabled(true).catch((err) => {
                console.error('[RoomPage] Failed to unmute microphone:', err);
              });
              // Show popup notification
              toast.success(notification.message || 'Your microphone has been unmuted by the host', {
                duration: 5000,
                icon: '🔊'
              });
            }
            
            // Mark notification as read
            updateDoc(change.doc.ref, { read: true }).catch((err) => {
              console.error('[RoomPage] Failed to mark notification as read:', err);
            });
          }
        }
      });
    });

    return unsubscribe;
  }, [roomId, user, isConnected, setMicrophoneEnabled]);

  // Load participants
  useEffect(() => {
    if (!roomId) return;

    const participantsRef = collection(db, 'rooms', roomId, 'participants');
    const q = query(participantsRef, orderBy('joinedAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const participantsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setParticipants(participantsData);
    });

    return unsubscribe;
  }, [roomId]);

  // Separate waiting participants for host
  const waitingParticipants = participants.filter(p => p.lobbyStatus === 'waiting');
  const admittedParticipants = participants.filter(p => !p.lobbyStatus || p.lobbyStatus === 'admitted');

  // Load chat messages and track unread count
  useEffect(() => {
    if (!roomId) return;

    const chatRef = collection(db, 'rooms', roomId, 'chat');
    const q = query(chatRef, orderBy('createdAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setChatMessages(messages);
      
      // ✅ Calculate unread messages (messages after the last seen message or if chat panel is closed)
      if (activePanel !== 'chat') {
        if (lastSeenMessageId) {
          const lastSeenIndex = messages.findIndex(m => m.id === lastSeenMessageId);
          const unread = lastSeenIndex >= 0 
            ? messages.length - lastSeenIndex - 1 
            : messages.length;
          setUnreadChatCount(unread);
        } else if (messages.length > 0) {
          // First time loading - don't count as unread if we're just joining
          setUnreadChatCount(0);
          setLastSeenMessageId(messages[messages.length - 1].id);
        }
      }
    });

    return unsubscribe;
  }, [roomId, activePanel, lastSeenMessageId]);

  // Load private messages
  useEffect(() => {
    if (!roomId || !user) return;

    const privateMessagesRef = collection(db, 'rooms', roomId, 'privateMessages');
    
    // Firestore doesn't support OR queries directly, so we need to fetch all and filter
    // The Firestore rules ensure users can only read their own messages
    // We don't use orderBy here to avoid index requirements - we'll sort client-side
    const q = query(privateMessagesRef);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        roomId: roomId, // Ensure roomId is included for delete functionality
        ...doc.data()
      }));
      
      // Filter to only show messages where current user is sender or receiver
      // Firestore rules already enforce this, but we filter client-side for safety
      const userMessages = allMessages.filter(
        (msg: any) => msg.senderId === user.uid || msg.receiverId === user.uid
      );
      
      // Sort by createdAt client-side (ascending for chronological order)
      userMessages.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toDate?.() || new Date(0);
        const timeB = b.createdAt?.toDate?.() || new Date(0);
        return timeA.getTime() - timeB.getTime();
      });
      
      setPrivateMessages(userMessages);
    }, (error) => {
      console.error('[PrivateMessages] Error loading messages:', error);
      toast.error('Failed to load private messages: ' + error.message);
    });

    return unsubscribe;
  }, [roomId, user]);
  
  // ✅ Clear unread count when chat panel is opened
  useEffect(() => {
    if (activePanel === 'chat' && chatMessages.length > 0) {
      // Mark all messages as read
      setUnreadChatCount(0);
      // Update last seen message to the most recent one
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (lastMessage) {
        setLastSeenMessageId(lastMessage.id);
      }
    }
  }, [activePanel, chatMessages]);

  // Check lobby status before connecting
  useEffect(() => {
    if (!roomId || !user) return;

    const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
    const unsubscribe = onSnapshot(participantRef, (doc) => {
      if (doc.exists()) {
        const participantData = doc.data() as any;
        const lobbyStatus = participantData.lobbyStatus || 'admitted';

        // If user is waiting in lobby, redirect to waiting room
        if (lobbyStatus === 'waiting') {
          navigate('/waiting-room');
          return;
        }

        // If denied, redirect home
        if (lobbyStatus === 'denied') {
          toast.error('You have been denied access to this meeting');
          navigate('/home');
          return;
        }
      }
    });

    return unsubscribe;
  }, [roomId, user, navigate]);

  // Connect to LiveKit room (only if admitted)
  useEffect(() => {
    if (!roomId || !user || isConnected || isConnecting) return;

    const connectToRoom = async () => {
      try {
        // Check lobby status first
        const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
        const participantSnap = await getDoc(participantRef);
        
        if (participantSnap.exists()) {
          const participantData = participantSnap.data() as any;
          const lobbyStatus = participantData.lobbyStatus || 'admitted';
          
          if (lobbyStatus === 'waiting') {
            navigate('/waiting-room');
            return;
          }
          
          if (lobbyStatus === 'denied') {
            toast.error('You have been denied access to this meeting');
            navigate('/home');
            return;
          }
        }

        // Check if this is a scheduled meeting with a pre-generated token
        const isScheduledMeeting = sessionStorage.getItem('isScheduledMeeting') === 'true';
        const preGeneratedToken = sessionStorage.getItem('meetingToken');
        
        let token: string;
        
        if (isScheduledMeeting && preGeneratedToken) {
          // Use the pre-generated token from scheduled meeting
          token = preGeneratedToken;
          // Clear it from sessionStorage after use
          sessionStorage.removeItem('meetingToken');
          sessionStorage.removeItem('isScheduledMeeting');
        } else {
          // Regular meeting - get token from API
          const response = await api.getMeetingToken(roomId);
          token = response.token;
        }
        
        await connect(token);
      } catch (error: any) {
        toast.error('Failed to join room: ' + error.message);
        navigate('/');
      }
    };

    connectToRoom();
  }, [roomId, user, isConnected, isConnecting, connect, navigate]);

  // Create and publish local tracks after connecting
  useEffect(() => {
    if (!isConnected) return;
    publishFromSavedSettings().catch((e) =>
      console.error('[Room] publishFromSavedSettings failed', e)
    );
  }, [isConnected, publishFromSavedSettings]);

    // Auto-hide bottom controls after 5 seconds of inactivity
  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout;

    const resetTimer = () => {
      setShowBottomControls(true);
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        setShowBottomControls(false);
      }, 5000); // 5 seconds
    };
    
    // Initial timer
    resetTimer();
    
    // Reset on mouse movement
    const handleMouseMove = () => {
      resetTimer();
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(inactivityTimer);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'm':
          // Toggle microphone
          break;
        case 'v':
          // Toggle video
          break;
        case 's':
          // Toggle screen share
          break;
        case 'escape':
          // ESC leaves the meeting (not ends it, even for host)
          // Only non-hosts can leave with ESC - hosts must use End Meeting
          if (!isHost) {
          handleLeave();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleLeave = useCallback(async () => {
    // If host is leaving, generate a host join key so they can rejoin as host
    if (isHost && roomId && user) {
      try {
        // Generate a secure host join key (similar to scheduled meetings)
        const hostJoinKey = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
        
        // Store the host join key in the room document
        const roomRef = doc(db, 'rooms', roomId);
        await updateDoc(roomRef, {
          hostJoinKey: hostJoinKey,
          hostJoinKeyCreatedAt: serverTimestamp(),
        });
        
        // Generate host rejoin link
        const baseUrl = window.location.origin;
        const hostLink = `${baseUrl}/join/${roomId}?k=${hostJoinKey}`;
        
        // Store in sessionStorage for easy access
        sessionStorage.setItem(`hostLink_${roomId}`, hostLink);
        
        console.log('Host join key generated. Link:', hostLink);
      } catch (error: any) {
        console.error('Failed to generate host join key:', error);
        // Continue with leave even if key generation fails
      }
    }
    
    // Disconnect and navigate
    disconnect();
    navigate('/');
  }, [disconnect, navigate, isHost, roomId, user]);

  const handleEndMeeting = useCallback(async () => {
    // Only hosts can end meetings
    if (!isHost || !roomId) {
      toast.error('Only the host can end the meeting');
      return;
    }

    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        status: 'ended',
        endedAt: serverTimestamp()
      });
      toast.success('Meeting ended for all participants');
      
      // Give a moment for the update to propagate, then disconnect
      setTimeout(() => {
        disconnect();
        navigate('/');
      }, 500);
    } catch (error: any) {
      console.error('Failed to end room:', error);
      toast.error('Failed to end meeting: ' + error.message);
    }
  }, [disconnect, navigate, isHost, roomId]);

  // Subscribe to recording state changes
  useEffect(() => {
    const handleRecordingStateChange = (state: any) => {
      setIsRecording(state.isRecording);
      setRecordingDuration(state.duration);
    };

    const handleSaveComplete = (result: { success: boolean; message: string; filename?: string; location?: string }) => {
      if (result.success) {
        // Show detailed success message with location
        const message = result.location || result.message;
        toast.success(
          <div>
            <div className="font-semibold">Recording Saved!</div>
            <div className="text-sm mt-1">{message}</div>
            {result.filename && (
              <div className="text-xs mt-1 text-gray-300">Filename: {result.filename}</div>
            )}
          </div>,
          { 
            duration: 8000,
            icon: '✅'
          }
        );
      } else {
        toast.error(result.message, { duration: 5000 });
      }
    };

    recordingService.onStateChange(handleRecordingStateChange);
    recordingService.onSaveComplete(handleSaveComplete);

    return () => {
      // Cleanup on unmount
      if (recordingService.getState().isRecording) {
        recordingService.stopRecording();
      }
    };
  }, []);

  const handleRecord = async () => {
    // If already recording, stop it
    if (isRecording) {
      try {
        recordingService.stopRecording();
        // Don't show message here - wait for save complete callback
      } catch (error: any) {
        console.error('Error stopping recording:', error);
        toast.error('Failed to stop recording: ' + error.message);
      }
      return;
    }

    // Check if recording is supported
    if (!RecordingService.isSupported()) {
      toast.error('Recording is not supported on this device');
      return;
    }

    if (!room) {
      toast.error('Not connected to meeting room. Please wait...');
      return;
    }

    // IMPORTANT: Recording is only started on explicit host action to avoid burning LiveKit minutes.
    // Never auto-start recording when host joins, first participant joins, or any other automatic trigger.
    // Start recording immediately - no options, just record everything
    try {
      await recordingService.startRecording({
        room: room,
      });
      toast.success('Recording started - capturing entire meeting room');
    } catch (error: any) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording: ' + error.message);
    }
  };

  const handleLock = async () => {
    if (!isHost || !roomId) return;
    
    try {
      const newStatus = isLocked ? 'open' : 'locked';
      await MeetingService.updateRoom(roomId, {
        status: newStatus,
      });
      // The status will be updated via the onSnapshot listener, but we can also update local state immediately
      setIsLocked(!isLocked);
      toast.success(isLocked ? 'Room unlocked' : 'Room locked');
    } catch (error: any) {
      console.error('Failed to toggle room lock:', error);
      toast.error('Failed to toggle room lock: ' + error.message);
    }
  };

  const sendChatMessage = async (text: string) => {
    if (!user || !userProfile || !text.trim() || !roomId) {
      toast.error('Cannot send message: Missing user info or room ID');
      return;
    }

    try {
      // ✅ Save message to Firestore - all participants can see it via real-time listener
      await addDoc(collection(db, 'rooms', roomId, 'chat'), {
        uid: user.uid,
        displayName: userProfile.displayName || user.email || 'Anonymous',
        text: text.trim(),
        createdAt: serverTimestamp(),
      });
      // Message will appear automatically via the onSnapshot listener above
      console.log('[Chat] Message sent successfully');
    } catch (error: any) {
      console.error('[Chat] Failed to send message:', error);
      toast.error('Failed to send message: ' + (error.message || 'Unknown error'));
    }
  };

  const sendPrivateMessage = async (
    text: string,
    receiverId: string,
    files?: Array<{ url: string; type: 'image' | 'video' | 'pdf'; name: string }>,
    replyTo?: { messageId: string; senderName: string; text?: string; fileCount?: number }
  ) => {
    if (!user || !userProfile || !roomId || !receiverId) {
      toast.error('Cannot send private message: Missing user info or recipient');
      return;
    }

    // Must have either text or files
    if (!text.trim() && (!files || files.length === 0)) {
      toast.error('Please enter a message or attach a file');
      return;
    }

    try {
      // Get receiver's display name
      const receiver = participants.find(p => p.uid === receiverId);
      const receiverName = receiver?.displayName || receiverId;

      // ✅ Save private message to Firestore
      const messageData: any = {
        senderId: user.uid,
        receiverId: receiverId,
        senderName: userProfile.displayName || user.email || 'Anonymous',
        receiverName: receiverName,
        read: false,
        createdAt: serverTimestamp(),
      };

      if (text.trim()) {
        messageData.text = text.trim();
      }

      if (files && files.length > 0) {
        messageData.files = files;
      }

      if (replyTo) {
        messageData.replyTo = replyTo;
      }

      await addDoc(collection(db, 'rooms', roomId, 'privateMessages'), messageData);
      
      console.log('[PrivateMessage] Message sent successfully');
      toast.success(`Message sent to ${receiverName}`, { duration: 2000 });
    } catch (error: any) {
      console.error('[PrivateMessage] Failed to send message:', error);
      toast.error('Failed to send private message: ' + (error.message || 'Unknown error'));
    }
  };

  const markPrivateMessageAsRead = async (messageId: string) => {
    if (!roomId || !messageId) return;

    try {
      const messageRef = doc(db, 'rooms', roomId, 'privateMessages', messageId);
      await updateDoc(messageRef, {
        read: true,
      });
    } catch (error: any) {
      console.error('[PrivateMessage] Failed to mark as read:', error);
    }
  };

  const handleShareLink = async () => {
    // Don't allow sharing if room is locked
    if (isLocked || !roomId) {
      toast.error('Cannot share link: Meeting is locked');
      return;
    }
    
    setIsGeneratingLink(true);
    try {
      // Create shorter, more professional link using room ID
      const shortLink = `${window.location.origin}/join/${roomId}`;
      setShareLink(shortLink);
      setShowShareModal(true);
    } catch (error: any) {
      toast.error('Failed to create invite link: ' + error.message);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success('Link copied to clipboard!');
    } catch (error: any) {
      toast.error('Failed to copy link: ' + error.message);
    }
  };

  if (!roomData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-techBlue"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-midnight via-techBlue to-violetDeep flex flex-col overflow-hidden relative">
      {/* Top bar - always visible, thin - NO BORDERS */}
      <header className="h-12 bg-gray-900/90 backdrop-blur-sm px-2 sm:px-4 flex items-center justify-between z-20" style={{ border: 'none', borderBottom: 'none' }}>
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-techBlue to-violetDeep rounded-lg flex items-center justify-center">
            <span className="text-cloud font-bold text-lg">H</span>
          </div>
          <span className="text-cloud font-medium text-xs sm:text-sm truncate max-w-[200px] sm:max-w-none">{roomData.title}</span>
        </div>
        <div className="flex items-center space-x-2">
          {/* View Mode Menu */}
          <ViewMenu currentMode={viewMode} onModeChange={setViewMode} />
          
          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center space-x-2 bg-red-600/20 px-3 py-1 rounded-full border border-red-600/50">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-red-400 text-xs font-mono font-semibold">
                {RecordingService.formatDuration(recordingDuration)}
              </span>
            </div>
          )}
          {activePanel && (
            <button
              onClick={() => setActivePanel(null)}
              className="text-gray-400 hover:text-white p-1"
              title="Close panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </header>
      
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main video area */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${activePanel ? 'mr-0 sm:mr-80' : ''}`}>
          <div className="flex-1 overflow-hidden">
            <MeetingShell viewMode={viewMode} />
          </div>
        </div>

        {/* Side panel - slide in from right when active - NO BORDERS */}
        {activePanel && (
          <div className={`absolute right-0 top-0 bottom-0 bg-cloud flex flex-col overflow-hidden shadow-2xl z-30 ${activePanel === 'inbox' ? 'w-full sm:w-[600px]' : 'w-full sm:w-80'}`} style={{ border: 'none', borderLeft: 'none' }}>
            {/* Panel header - NO BORDERS */}
            <div className="h-12 bg-gray-800 flex items-center justify-between px-4" style={{ border: 'none', borderBottom: 'none' }}>
              <div className="flex items-center space-x-2">
                {activePanel === 'chat' && (
                  <h3 className="text-cloud font-semibold text-sm uppercase">Chat</h3>
                )}
                {activePanel === 'inbox' && (
                  <h3 className="text-cloud font-semibold text-sm uppercase">Inbox</h3>
                )}
                {activePanel === 'participants' && (
                  <h3 className="text-cloud font-semibold text-sm uppercase">Participants</h3>
                )}
                {activePanel === 'settings' && (
                  <h3 className="text-cloud font-semibold text-sm uppercase">Settings</h3>
                )}
              </div>
              <button
                onClick={() => setActivePanel(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Panel content */}
            <div className="flex-1 overflow-auto">
              {activePanel === 'chat' && (
                <ChatPanel
                  messages={chatMessages}
                  onSendMessage={sendChatMessage}
                />
              )}
              {activePanel === 'inbox' && (
                <PrivateMessagesPanel
                  messages={privateMessages}
                  participants={admittedParticipants}
                  currentUserId={user?.uid || ''}
                  roomId={roomId!}
                  onSendMessage={sendPrivateMessage}
                  onMarkAsRead={markPrivateMessageAsRead}
                />
              )}
              {activePanel === 'participants' && (
                <ParticipantsPanel
                  participants={participants}
                  isHost={isHost}
                  roomId={roomId!}
                />
              )}
              {activePanel === 'settings' && (
                <SettingsPanel roomId={roomId} isHost={isHost} />
              )}
            </div>
          </div>
        )}
      </div>

            {/* Bottom controls bar - auto-hide - NO BORDERS */}
      <div className={`h-14 bg-gray-900/95 backdrop-blur-sm flex items-center justify-center px-2 sm:px-4 z-20 transition-transform duration-300 ${showBottomControls ? 'translate-y-0' : 'translate-y-full'}`} style={{ border: 'none', borderTop: 'none' }}>                                           
                {/* Center - main controls - scrollable on smaller screens */}
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto w-full lg:w-auto lg:justify-center flex-nowrap scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <MeetingControls
              isHost={isHost}
              onRecord={handleRecord}
              onLock={handleLock}
              isRecording={isRecording}
              isLocked={isLocked}
            />
          </div>

          <div className="w-px h-8 bg-gray-600 mx-2 flex-shrink-0"></div>

          <button
            onClick={() => setActivePanel(activePanel === 'participants' ? null : 'participants')}                                                                                      
            className={`relative p-1.5 sm:p-2 hover:bg-gray-700 rounded transition-colors flex-shrink-0 ${
              activePanel === 'participants' ? 'text-techBlue' : 'text-gray-400 hover:text-white'                                                                                       
            }`}
            title="Participants"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />                                                                               
            </svg>
            <span className="absolute -top-0.5 -right-0.5 bg-techBlue text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">                                        
              {isConnected && participantCount > 0 ? participantCount : admittedParticipants.length + (waitingParticipants.length > 0 ? 1 : 0)}
            </span>
            {waitingParticipants.length > 0 && isHost && (
              <span className="absolute -top-0.5 -right-0.5 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse" style={{ marginRight: '16px' }}>
                {waitingParticipants.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
            className={`relative p-1.5 sm:p-2 hover:bg-gray-700 rounded transition-colors flex-shrink-0 ${
              activePanel === 'chat' ? 'text-techBlue' : 'text-gray-400 hover:text-white'   
            }`}
            title={unreadChatCount > 0 ? `Chat (${unreadChatCount} new message${unreadChatCount > 1 ? 's' : ''})` : 'Chat'}                                                             
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />                               
            </svg>
            {/* ✅ Unread message badge (public chat) */}
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">                   
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </button>
          
          {/* Private Messages / Inbox button */}
          <button
            onClick={() => setActivePanel(activePanel === 'inbox' ? null : 'inbox')}
            className={`relative p-1.5 sm:p-2 hover:bg-gray-700 rounded transition-colors flex-shrink-0 ${
              activePanel === 'inbox' ? 'text-techBlue' : 'text-gray-400 hover:text-white'   
            }`}
            title="Private Messages / Inbox"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />                               
            </svg>
            {/* ✅ Unread private message badge */}
            {privateMessages.filter((m: any) => !m.read && m.receiverId === user?.uid).length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">                   
                {privateMessages.filter((m: any) => !m.read && m.receiverId === user?.uid).length > 99 
                  ? '99+' 
                  : privateMessages.filter((m: any) => !m.read && m.receiverId === user?.uid).length}
              </span>
            )}
          </button>

          {/* Share link button - visible to everyone when room is not locked */}
          {!isLocked && (
            <button
              onClick={handleShareLink}
              className={`p-1.5 sm:p-2 hover:bg-gray-700 rounded transition-colors flex-shrink-0 ${       
                isGeneratingLink ? 'opacity-50 cursor-not-allowed' : 'text-gray-400 hover:text-white'                                                                                   
              }`}
              title="Share meeting link"
              disabled={isGeneratingLink}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">                                                                                           
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />                                                 
              </svg>
            </button>
          )}

          <div className="w-px h-8 bg-gray-600 mx-2 flex-shrink-0"></div>

          {/* Right side - leave/end buttons */}
          {isHost ? (
            // Host only has End Meeting option (no Leave button)
              <button
                onClick={handleEndMeeting}
              className="bg-red-600 hover:bg-red-700 text-white px-3 sm:px-5 py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm flex-shrink-0"                                        
                title="End meeting for everyone"
              >
                End Meeting
              </button>
          ) : (
            // Non-hosts only have Leave option
            <button
              onClick={handleLeave}
              className="bg-red-600 hover:bg-red-700 text-white px-4 sm:px-6 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base flex-shrink-0"                                        
            >
              Leave
            </button>
          )}
        </div>
      </div>

            {/* Share Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto" onClick={() => setShowShareModal(false)}>                                                      
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 max-w-md w-full shadow-xl my-auto" onClick={(e) => e.stopPropagation()}>                                                              
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg sm:text-xl font-semibold text-cloud pr-2">Share Meeting Link</h3>      
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">                                                                                         
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />                                                                        
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Invite participants to join this meeting
              </label>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="flex-1 bg-gray-700 text-cloud px-3 sm:px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-techBlue focus:border-transparent text-sm sm:text-base min-w-0"    
                />
                <button
                  onClick={copyToClipboard}
                  className="bg-techBlue hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm sm:text-base whitespace-nowrap flex-shrink-0 w-full sm:w-auto"
                  title="Copy link"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="text-xs sm:text-sm text-gray-400">
              <p>This link will expire in 7 days and can be used up to 2500 times.</p>       
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default RoomPage;
