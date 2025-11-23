import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../contexts/LiveKitContext';
import { api } from '../lib/api';
import { doc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, updateDoc, getDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MeetingService } from '../lib/meetingService';
import { activeMeetingService } from '../lib/activeMeetingService';
import toast from '../lib/toast';
import MeetingControls from '../components/MeetingControls';
import MeetingShell from '../meeting/MeetingShell';
import ViewMenu from '../components/ViewMenu';
import ChatPanel from '../components/ChatPanel';
import PrivateMessagesPanel from '../components/PrivateMessagesPanel';
import ParticipantsPanel from '../components/ParticipantsPanel';
import SettingsPanel from '../components/SettingsPanel';
import DeviceConflictModal from '../components/DeviceConflictModal';
import { recordingService, RecordingService } from '../lib/recordingService';
import { ViewMode } from '../types/viewModes';
import { useCostOptimizations } from '../hooks/useCostOptimizations';

const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, userProfile, updateUserPreferences } = useAuth();
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
  const [showDeviceConflictModal, setShowDeviceConflictModal] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{ activeMeeting: any; currentDevice: string } | null>(null);
  // Load view mode from userProfile (Firestore) - user-specific, not device-specific
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = userProfile?.preferences?.viewMode;
    if (saved && ['speaker', 'gallery', 'multi-speaker', 'immersive'].includes(saved)) {
      return saved as ViewMode;
    }
    return 'gallery'; // Default to gallery
  });
  
  // Update viewMode when userProfile changes (e.g., when user logs in/out)
  useEffect(() => {
    const saved = userProfile?.preferences?.viewMode;
    if (saved && ['speaker', 'gallery', 'multi-speaker', 'immersive'].includes(saved)) {
      setViewMode(saved as ViewMode);
    } else {
      setViewMode('gallery');
    }
  }, [userProfile?.preferences?.viewMode]);

  // Load room data
  useEffect(() => {
    if (!roomId || !user) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, async (doc) => {
      if (doc.exists()) {
        const roomData = { id: doc.id, ...doc.data() } as any;
        setRoomData(roomData);
        setIsLocked(roomData.status === 'locked');
        
        // ✅ CRITICAL: If room is ended, disconnect and leave immediately - NO DELAYS
        if (roomData.status === 'ended') {
          console.log('[RoomPage] ⚠️⚠️⚠️ ROOM ENDED - FORCING IMMEDIATE DISCONNECT ⚠️⚠️⚠️');
          toast.error('Meeting has ended. Disconnecting now...', { duration: 1500 });
          
          // Clear active meeting
          if (user) {
            activeMeetingService.clearActiveMeeting(user.uid).catch(console.error);
          }
          
          // ✅ CRITICAL: Store roomId for feedback check BEFORE clearing anything
          // Use a small delay to ensure sessionStorage is persisted
          if (roomId && user) {
            try {
              sessionStorage.setItem('pendingFeedbackCheck', JSON.stringify({ roomId }));
              console.log('[RoomPage] ✅ Stored pendingFeedbackCheck for room:', roomId);
              // Small delay to ensure sessionStorage is persisted before navigation
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
              console.warn('[RoomPage] Failed to store feedback check:', err);
            }
          }
          
          // Clear all meeting-related storage (but keep pendingFeedbackCheck)
          sessionStorage.removeItem('currentRoomId');
          sessionStorage.removeItem('isParticipant');
          sessionStorage.removeItem('pendingInvite');
          sessionStorage.removeItem('meetingToken');
          sessionStorage.removeItem('isScheduledMeeting');
          if (roomId) {
            localStorage.removeItem(`meeting-active-${roomId}`);
          }
          
          // ✅ CRITICAL: Force disconnect IMMEDIATELY - no async delays
          try {
            disconnect();
            console.log('[RoomPage] ✅ Disconnected from LiveKit');
          } catch (disconnectError) {
            console.error('[RoomPage] ❌ Error during disconnect:', disconnectError);
          }
          
          // ✅ CRITICAL: Navigate using React Router to preserve sessionStorage
          // Navigate to home page for authenticated users
          setTimeout(() => {
            navigate('/home');
          }, 300);
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

  // ✅ CRITICAL FIX: Load private messages using WHERE queries (Firestore-compatible)
  // Firestore rules can't evaluate resource.data in collection queries, so we use WHERE clauses
  useEffect(() => {
    if (!roomId || !user) return;

    // ✅ CRITICAL: Verify Firebase project before querying
    const currentProjectId = (db as any).app?.options?.projectId;
    console.log('[PrivateMessages] Loading messages for room:', {
      roomId,
      userId: user.uid,
      projectId: currentProjectId,
      expectedProject: 'habs-meet-prod'
    });

    const privateMessagesRef = collection(db, 'rooms', roomId, 'privateMessages');
    
    // ✅ CRITICAL FIX: Use WHERE queries instead of fetching all and filtering
    // Firestore security rules can't evaluate resource.data in collection queries
    // So we query for messages where user is sender OR receiver using separate queries
    
    // Query 1: Messages where user is the sender
    const sentMessagesQuery = query(
      privateMessagesRef,
      where('senderId', '==', user.uid)
    );
    
    // Query 2: Messages where user is the receiver
    const receivedMessagesQuery = query(
      privateMessagesRef,
      where('receiverId', '==', user.uid)
    );
    
    let sentUnsubscribe: (() => void) | null = null;
    let receivedUnsubscribe: (() => void) | null = null;
    const allUserMessages = new Map<string, any>();
    
    const updateMessages = () => {
      const messagesArray = Array.from(allUserMessages.values())
        .filter((msg: any) => {
          // Skip self-messages
          return msg.senderId !== msg.receiverId;
        })
        .sort((a: any, b: any) => {
          const timeA = a.createdAt?.toDate?.() || new Date(0);
          const timeB = b.createdAt?.toDate?.() || new Date(0);
          return timeA.getTime() - timeB.getTime();
        });
      
      setPrivateMessages(messagesArray);
      console.log('[PrivateMessages] ✅ Messages updated:', {
        roomId,
        count: messagesArray.length,
        projectId: currentProjectId
      });
    };
    
    // Subscribe to sent messages
    sentUnsubscribe = onSnapshot(
      sentMessagesQuery,
      (snapshot) => {
        console.log('[PrivateMessages] Sent messages snapshot:', {
          roomId,
          count: snapshot.docs.length
        });
        
        snapshot.docs.forEach(doc => {
          allUserMessages.set(doc.id, {
            id: doc.id,
            roomId: roomId,
            ...doc.data()
          });
        });
        
        updateMessages();
      },
      (error) => {
        console.error('[PrivateMessages] Error loading sent messages:', {
          error,
          code: error.code,
          message: error.message,
          roomId,
          userId: user.uid
        });
        
        if (error.code === 'permission-denied') {
          console.error('[PrivateMessages] Permission denied for sent messages - check Firestore rules');
        }
      }
    );
    
    // Subscribe to received messages
    receivedUnsubscribe = onSnapshot(
      receivedMessagesQuery,
      (snapshot) => {
        console.log('[PrivateMessages] Received messages snapshot:', {
          roomId,
          count: snapshot.docs.length
        });
        
        snapshot.docs.forEach(doc => {
          allUserMessages.set(doc.id, {
            id: doc.id,
            roomId: roomId,
            ...doc.data()
          });
        });
        
        updateMessages();
      },
      (error) => {
        console.error('[PrivateMessages] Error loading received messages:', {
          error,
          code: error.code,
          message: error.message,
          roomId,
          userId: user.uid
        });
        
        if (error.code === 'permission-denied') {
          console.error('[PrivateMessages] Permission denied for received messages - check Firestore rules');
          toast.error('Permission denied: Cannot load private messages. Check Firestore rules.');
        }
      }
    );

    return () => {
      if (sentUnsubscribe) sentUnsubscribe();
      if (receivedUnsubscribe) receivedUnsubscribe();
    };
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

  // ✅ Fix 4: Prevent multiple tabs from opening the same meeting
  useEffect(() => {
    const meetingKey = `meeting-active-${roomId}`;
    
    // Check if meeting is already open in another tab
    if (localStorage.getItem(meetingKey)) {
      console.warn('[RoomPage] Meeting already open in another tab');
      toast.error('This meeting is already open in another tab. Please close the other tab first.');
      navigate('/home');
      return;
    }
    
    // Mark this tab as active
    localStorage.setItem(meetingKey, 'true');
    
    // Clean up on page unload
    const handleBeforeUnload = () => {
      localStorage.removeItem(meetingKey);
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      localStorage.removeItem(meetingKey);
    };
  }, [roomId, navigate]);

  // Check for device conflicts and connect to LiveKit room
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

        // Check if user is already in a meeting on another device
        const { hasConflict, activeMeeting } = await activeMeetingService.checkDeviceConflict(user.uid);
        
        if (hasConflict && activeMeeting) {
          // Show device conflict modal
          const currentDeviceName = navigator.userAgent.includes('Mobile') 
            ? (navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Mobile Device')
            : (navigator.userAgent.includes('Mac') ? 'Mac' : 'Desktop');
          
          setConflictInfo({
            activeMeeting,
            currentDevice: currentDeviceName,
          });
          setShowDeviceConflictModal(true);
          return; // Don't connect yet, wait for user choice
        }

        // No conflict - proceed with connection
        await proceedWithConnection();
      } catch (error: any) {
        toast.error('Failed to join room: ' + error.message);
        navigate('/');
      }
    };

    const proceedWithConnection = async () => {
      try {
        // Check if this is a scheduled meeting with a pre-generated token
        const isScheduledMeeting = sessionStorage.getItem('isScheduledMeeting') === 'true';
        const preGeneratedToken = sessionStorage.getItem('meetingToken');
        
        let token: string;
        
        if (isScheduledMeeting && preGeneratedToken) {
          token = preGeneratedToken;
          sessionStorage.removeItem('meetingToken');
          sessionStorage.removeItem('isScheduledMeeting');
        } else {
          // Retry logic: If user is room creator, ensure participant doc exists
          if (roomData?.createdBy === user.uid) {
            // Check if participant document exists, if not wait a bit and retry
            const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
            let participantSnap = await getDoc(participantRef);
            
            if (!participantSnap.exists()) {
              // Wait a moment for participant document to be created
              await new Promise(resolve => setTimeout(resolve, 500));
              participantSnap = await getDoc(participantRef);
            }
          }
          
          const response = await api.getMeetingToken(roomId);
          token = response.token;
        }
        
        // Connect first - the connect() function resolves when connection starts
        // Wait for connection to be fully established before proceeding
        await connect(token);
        
        // Wait for connection to be fully established
        // Poll for connection state with longer timeout and more reliable checks
        let attempts = 0;
        const maxAttempts = 150; // 15 seconds max wait (increased for slower connections)
        let connectionEstablished = false;
        
        while (attempts < maxAttempts) {
          // Check isConnected state (set by RoomEvent.Connected)
          // Also check if room exists and is connected
          const currentRoom = room; // Get current room from context
          
          // More flexible connection check: isConnected is the primary indicator
          if (isConnected) {
            // If room is available, check its state for additional confirmation
            if (currentRoom) {
              // Accept 'connected' or 'reconnecting' states (reconnecting means we were connected)
              if (currentRoom.state === 'connected' || currentRoom.state === 'reconnecting') {
                connectionEstablished = true;
                console.log('[RoomPage] Connection fully established, room state:', currentRoom.state);
                break;
              } else {
                console.log('[RoomPage] Waiting for room state to be connected, current:', currentRoom.state);
              }
            } else {
              // Room might not be set yet, but isConnected is true, so connection is established
              // This is acceptable - the room will be set shortly
              connectionEstablished = true;
              console.log('[RoomPage] Connection established (isConnected=true, room not yet set)');
              break;
            }
          }
          
          // Small delay between checks
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // Don't fail on timeout - connection might still be establishing
        // The LiveKit connection will continue in the background
        if (!connectionEstablished) {
          // ✅ STABILITY FIX: Reduce warning frequency - only log once, not repeatedly
          if (attempts === 150) { // Only log on first timeout
            console.warn('[RoomPage] Connection check timeout, but continuing anyway', {
              isConnected,
              roomState: room?.state,
              attempts
            });
          }
          // Don't block - let connection continue
          // The connection might still succeed even if our check timed out
        }
        
        console.log('[RoomPage] Connection fully established, waiting before setting active meeting');
        
        // Set active meeting AFTER successful connection is stable
        // Add a delay to ensure connection is fully ready and stable
        await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
        
        if (roomData?.title) {
          await activeMeetingService.setActiveMeeting(user.uid, roomId, roomData.title);
          console.log('[RoomPage] Active meeting set successfully');
        }
      } catch (error: any) {
        console.error('[RoomPage] Failed to connect:', error);
        toast.error('Failed to join room: ' + (error.message || 'Unknown error'));
        navigate('/');
      }
    };

    connectToRoom();
  }, [roomId, user, navigate, disconnect, isConnected, isConnecting, roomData, connect]);

  // Handle device conflict modal choices
  const handleChooseCurrentDevice = async () => {
    if (!user || !roomId || !conflictInfo) return;
    
    try {
      // Clear the old device's active meeting (this will trigger disconnect on that device)
      await activeMeetingService.clearActiveMeeting(user.uid);
      
      // Wait a moment for the old device to disconnect
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Set this device as active
      if (roomData?.title) {
        await activeMeetingService.setActiveMeeting(user.uid, roomId, roomData.title);
      }
      
      setShowDeviceConflictModal(false);
      setConflictInfo(null);
      
      // Proceed with connection
      const isScheduledMeeting = sessionStorage.getItem('isScheduledMeeting') === 'true';
      const preGeneratedToken = sessionStorage.getItem('meetingToken');
      
      let token: string;
      if (isScheduledMeeting && preGeneratedToken) {
        token = preGeneratedToken;
        sessionStorage.removeItem('meetingToken');
        sessionStorage.removeItem('isScheduledMeeting');
      } else {
        const response = await api.getMeetingToken(roomId);
        token = response.token;
      }
      
      await connect(token);
    } catch (error: any) {
      toast.error('Failed to switch device: ' + error.message);
    }
  };

  const handleChooseActiveDevice = () => {
    setShowDeviceConflictModal(false);
    setConflictInfo(null);
    navigate('/home');
    toast('Staying connected on your other device', { icon: 'ℹ️' });
  };

  const handleCancelConflict = () => {
    setShowDeviceConflictModal(false);
    setConflictInfo(null);
    navigate('/home');
  };

  // Listen for disconnection requests from other devices
  // Only set up listener AFTER connection is fully established and stable
  useEffect(() => {
    if (!user || !isConnected || !roomId) return;

    let unsubscribe: (() => void) | null = null;

    // Add a delay to ensure connection is stable before setting up listener
    // This prevents the listener from firing during initial connection setup
    const timeoutId = setTimeout(() => {
      unsubscribe = activeMeetingService.onDisconnectRequest(user.uid, () => {
        // Only disconnect if we're actually connected and in a room
        if (isConnected && roomId) {
          console.log('[RoomPage] Disconnect requested from another device');
          toast('You joined this meeting on another device. Disconnecting...', { icon: '⚠️' });
          disconnect();
          setTimeout(() => {
            navigate('/home');
          }, 2000);
        }
      });
    }, 2000); // Wait 2 seconds after connection to set up listener

    return () => {
      clearTimeout(timeoutId);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, isConnected, roomId, disconnect, navigate]);

  // Clear active meeting when disconnecting or leaving
  useEffect(() => {
    if (!user || !roomId) return;

    // Cleanup function: clear active meeting when component unmounts
    return () => {
      // Only clear if we're actually disconnected
      // This prevents clearing during reconnections
      if (!isConnected) {
        activeMeetingService.clearActiveMeeting(user.uid).catch(console.error);
      }
    };
  }, [user, roomId, isConnected]);

  // Create and publish local tracks after connecting
  // Add a significant delay to ensure connection is fully established and stable before publishing
  useEffect(() => {
    if (!isConnected || !roomId || !room) {
      console.log('[RoomPage] Not ready to publish tracks:', { isConnected, roomId: !!roomId, room: !!room });
      return;
    }
    
    // Wait for room to be fully connected before publishing tracks
    // Check room state to ensure it's actually connected
    if (room.state !== 'connected') {
      console.log('[RoomPage] Room not fully connected yet, waiting...', room.state);
      return;
    }
    
    console.log('[RoomPage] Connection stable, scheduling track publication...');
    
    // ✅ STABILITY FIX: Reduce delay to prevent dark screen and blinking
    // Wait for connection to stabilize before publishing tracks
    // This prevents "cannot publish track when not connected" errors
    const timeoutId = setTimeout(() => {
      // More flexible connection check - accept 'connected' or 'reconnecting' states
      if (!room || (!isConnected && room.state !== 'reconnecting')) {
        console.warn('[RoomPage] Room not ready for publishing tracks', {
          room: !!room,
          roomState: room?.state,
          isConnected
        });
        return;
      }
      
      // ✅ CRITICAL: Final verification - room MUST be connected
      if (room.state !== 'connected') {
        // ✅ STABILITY FIX: Only log once, not repeatedly
        if (room.state !== 'reconnecting') {
          console.warn('[RoomPage] Room not connected, cannot publish tracks. State:', room.state);
        }
        // Retry after a delay if room is reconnecting
        if (room.state === 'reconnecting') {
          setTimeout(() => {
            if (room && room.state === 'connected' && isConnected) {
              console.log('[RoomPage] Publishing tracks after reconnection...');
              publishFromSavedSettings().catch((e) => {
                console.error('[Room] publishFromSavedSettings failed', e);
                const errorMsg = e.message || String(e);
                if (!errorMsg.includes('not connected') && 
                    !errorMsg.includes('closed') && 
                    !errorMsg.includes('timeout') &&
                    !errorMsg.includes('timed out')) {
                  toast.error('Failed to start camera/microphone: ' + errorMsg);
                }
              });
            }
          }, 1000);
        }
        return;
      }
      
      // ✅ CRITICAL: Verify localParticipant exists
      if (!room.localParticipant) {
        // ✅ STABILITY FIX: Only log once, not repeatedly
        console.warn('[RoomPage] No localParticipant, cannot publish tracks. Will retry...');
        // Retry after a short delay
        setTimeout(() => {
          if (room && room.localParticipant && room.state === 'connected' && isConnected) {
            console.log('[RoomPage] localParticipant now available, publishing tracks...');
            publishFromSavedSettings().catch((e) => {
              const errorMsg = e.message || String(e);
              if (!errorMsg.includes('not connected') && 
                  !errorMsg.includes('closed') && 
                  !errorMsg.includes('timeout') &&
                  !errorMsg.includes('timed out')) {
                toast.error('Failed to start camera/microphone: ' + errorMsg);
              }
            });
          }
        }, 500);
        return;
      }
      
      console.log('[RoomPage] ✅ Room verified as connected, publishing tracks now...');
      // ✅ STABILITY FIX: Add timeout and retry logic
      const publishWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            await Promise.race([
              publishFromSavedSettings(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Publish timeout')), 15000)
              )
            ]);
            console.log('[RoomPage] ✅ Tracks published and background applied successfully');
            return; // Success - exit retry loop
          } catch (e: any) {
            const errorMsg = e.message || String(e);
            console.warn(`[RoomPage] Publish attempt ${i + 1}/${retries} failed:`, errorMsg);
            
            // If it's a connection issue, wait and retry
            if (errorMsg.includes('not connected') || 
                errorMsg.includes('closed') || 
                errorMsg.includes('timeout') ||
                errorMsg.includes('timed out')) {
              if (i < retries - 1) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                continue;
              }
            }
            
            // Last attempt or non-connection error
            if (i === retries - 1) {
              if (!errorMsg.includes('not connected') && 
                  !errorMsg.includes('closed') && 
                  !errorMsg.includes('timeout') &&
                  !errorMsg.includes('timed out') &&
                  !errorMsg.includes('Track ended') &&
                  !errorMsg.includes('Cannot publish')) {
                toast.error('Failed to start camera/microphone: ' + errorMsg);
              } else {
                console.warn('[RoomPage] Track publishing failed due to connection/track issue:', errorMsg);
              }
            }
          }
        }
      };
      
      publishWithRetry();
    }, (() => {
      // ✅ STABILITY FIX: Reduced delays to prevent dark screen and blinking
      // ✅ MOBILE OPTIMIZATION: Shorter delay for mobile devices
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                      (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
      return isMobile ? 800 : 2000; // Reduced: 800ms for mobile, 2s for desktop (was 1.5s/4s)
    })());
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [isConnected, roomId, room, publishFromSavedSettings]);

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
    // Clear active meeting when leaving
    if (user) {
      await activeMeetingService.clearActiveMeeting(user.uid).catch(console.error);
    }
    
    // ✅ CRITICAL: Set leftAt timestamp FIRST before any navigation
    // This must complete before we navigate to ensure duration calculation works
    if (roomId && user) {
      try {
        console.log('[RoomPage] Setting leftAt timestamp for room:', roomId);
        await api.leaveMeeting(roomId);
        console.log('[RoomPage] ✅ Successfully set leftAt timestamp');
      } catch (err) {
        console.warn('[RoomPage] Failed to set leftAt timestamp:', err);
        // Continue even if this fails - feedback system will handle gracefully
      }
    }
    
    // ✅ CRITICAL: Store roomId for feedback check BEFORE clearing sessionStorage
    if (roomId && user) {
      try {
        sessionStorage.setItem('pendingFeedbackCheck', JSON.stringify({ roomId }));
        console.log('[RoomPage] ✅ Stored pendingFeedbackCheck for room:', roomId);
        // Small delay to ensure sessionStorage is persisted
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.warn('[RoomPage] Failed to store feedback check:', err);
      }
    }
    
    // Clean up all meeting-related storage (but keep pendingFeedbackCheck)
    if (roomId) {
      localStorage.removeItem(`meeting-active-${roomId}`);
    }
    sessionStorage.removeItem('currentRoomId');
    sessionStorage.removeItem('isParticipant');
    sessionStorage.removeItem('pendingInvite');
    sessionStorage.removeItem('meetingToken');
    sessionStorage.removeItem('isScheduledMeeting');
    
    // If host is leaving (but not ending), generate a host join key so they can rejoin as host
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
    
    // Force complete disconnect - don't wait
    disconnect();
    
    // Navigate to home page (not AuthPage) - use React Router to preserve sessionStorage
    navigate('/home');
  }, [disconnect, navigate, isHost, roomId, user]);

  const handleEndMeeting = useCallback(async () => {
    // Only hosts can end meetings
    if (!isHost || !roomId) {
      toast.error('Only the host can end the meeting');
      return;
    }

    try {
      console.log('[RoomPage] 🔴 Host ending meeting:', roomId);
      
      // ✅ CRITICAL: Call API endpoint to end meeting FIRST - this will:
      // 1. Update room status to 'ended' in Firestore (THIS MUST HAPPEN FIRST)
      // 2. Disconnect all participants from LiveKit room
      // 3. Expire the meeting link
      const result = await api.endMeeting(roomId);
      console.log('[RoomPage] ✅ API endMeeting result:', result);
      
      // ✅ CRITICAL: Wait a moment for Firestore update to propagate
      // This ensures all participants receive the 'ended' status update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Clear active meeting for host
      if (user) {
        await activeMeetingService.clearActiveMeeting(user.uid).catch(console.error);
      }
      
      // ✅ CRITICAL: Store roomId for feedback check BEFORE clearing sessionStorage
      if (roomId && user) {
        try {
          sessionStorage.setItem('pendingFeedbackCheck', JSON.stringify({ roomId }));
          console.log('[RoomPage] ✅ Stored pendingFeedbackCheck for room:', roomId);
          // Small delay to ensure sessionStorage is persisted
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.warn('[RoomPage] Failed to store feedback check:', err);
        }
      }
      
      // Clear all session storage related to this meeting (but keep pendingFeedbackCheck)
      sessionStorage.removeItem('currentRoomId');
      sessionStorage.removeItem('isParticipant');
      sessionStorage.removeItem('pendingInvite');
      sessionStorage.removeItem('meetingToken');
      sessionStorage.removeItem('isScheduledMeeting');
      if (roomId) {
        localStorage.removeItem(`meeting-active-${roomId}`);
      }
      
      // ✅ CRITICAL: Force disconnect AFTER Firestore update has propagated
      disconnect();
      
      toast.success('Meeting ended for all participants. The meeting link has expired.');
      
      // ✅ CRITICAL: Navigate using React Router to preserve sessionStorage
      // Navigate to home page for authenticated users
      setTimeout(() => {
        navigate('/home');
      }, 500);
    } catch (error: any) {
      console.error('[RoomPage] ❌ Failed to end room:', error);
      toast.error('Failed to end meeting: ' + error.message);
      
      // Even if API fails, try to update Firestore directly as fallback
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await updateDoc(roomRef, {
          status: 'ended',
          endedAt: serverTimestamp()
        });
        console.log('[RoomPage] ✅ Fallback: Updated room status to ended directly');
      } catch (fallbackError) {
        console.error('[RoomPage] ❌ Fallback also failed:', fallbackError);
      }
      
      // Still disconnect even if everything fails
      disconnect();
      navigate('/', { replace: true });
    }
  }, [disconnect, navigate, isHost, roomId, user]);

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
      console.error('[PrivateMessage] Missing required data:', { user: !!user, userProfile: !!userProfile, roomId, receiverId });
      toast.error('Cannot send private message: Missing user info or recipient');
      return;
    }

    // ✅ CRITICAL FIX: Must have either text or files (allow sending to self)
    if (!text.trim() && (!files || files.length === 0)) {
      toast.error('Please enter a message or attach a file');
      return;
    }

    try {
      // ✅ CRITICAL FIX: Prevent self-messages - users can only send to others
      if (receiverId === user.uid) {
        toast.error('You cannot send messages to yourself');
        return;
      }

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
        roomId: roomId, // ✅ CRITICAL: Explicitly include roomId in message data
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

      console.log('[PrivateMessage] Sending message:', { 
        roomId, 
        senderId: user.uid, 
        receiverId, 
        hasText: !!text.trim(), 
        fileCount: files?.length || 0,
        projectId: (db as any).app?.options?.projectId // Log Firebase project ID
      });

      // ✅ CRITICAL FIX: Ensure we're using the correct Firestore instance
      const messagesRef = collection(db, 'rooms', roomId, 'privateMessages');
      
      // ✅ CRITICAL: Verify Firebase project before saving
      const currentProjectId = (db as any).app?.options?.projectId;
      console.log('[PrivateMessage] Firebase project verification:', {
        currentProjectId,
        roomId,
        expectedProject: currentProjectId // Should match environment variable
      });
      
      const docRef = await addDoc(messagesRef, messageData);
      
      // ✅ CRITICAL: Verify message was actually saved
      const savedMessageRef = doc(db, 'rooms', roomId, 'privateMessages', docRef.id);
      const savedMessageDoc = await getDoc(savedMessageRef);
      
      if (!savedMessageDoc.exists()) {
        throw new Error('Message was not saved to Firestore. Please check your Firebase configuration.');
      }
      
      console.log('[PrivateMessage] ✅ Message saved and verified:', {
        messageId: docRef.id,
        roomId,
        receiverName,
        projectId: currentProjectId,
        hasText: !!savedMessageDoc.data()?.text,
        fileCount: savedMessageDoc.data()?.files?.length || 0
      });
      
      toast.success(`Message sent to ${receiverName}`, { duration: 2000 });
    } catch (error: any) {
      console.error('[PrivateMessage] Failed to send message:', error);
      console.error('[PrivateMessage] Error details:', {
        code: error.code,
        message: error.message,
        roomId,
        receiverId,
        hasText: !!text.trim(),
        fileCount: files?.length || 0,
        projectId: (db as any).app?.options?.projectId
      });
      
      // ✅ Better error messages for common issues
      let errorMessage = 'Failed to send private message';
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. You may not be a participant in this room.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Firestore is temporarily unavailable. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
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
          <ViewMenu currentMode={viewMode} onModeChange={async (mode) => {
            setViewMode(mode);
            // Save to Firestore (user-specific), not localStorage (device-specific)
            try {
              await updateUserPreferences({ viewMode: mode });
            } catch (error) {
              console.error('Failed to save view mode preference:', error);
            }
          }} />
          
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
      
      {/* Device Conflict Modal */}
      {conflictInfo && (
        <DeviceConflictModal
          isOpen={showDeviceConflictModal}
          currentDevice={conflictInfo.currentDevice}
          activeDevice={conflictInfo.activeMeeting.deviceName}
          roomTitle={conflictInfo.activeMeeting.roomTitle}
          onChooseCurrent={handleChooseCurrentDevice}
          onChooseActive={handleChooseActiveDevice}
          onCancel={handleCancelConflict}
        />
      )}
      
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

      {/* Device Conflict Modal */}
      {conflictInfo && (
        <DeviceConflictModal
          isOpen={showDeviceConflictModal}
          currentDevice={conflictInfo.currentDevice}
          activeDevice={conflictInfo.activeMeeting.deviceName}
          roomTitle={conflictInfo.activeMeeting.roomTitle}
          onChooseCurrent={handleChooseCurrentDevice}
          onChooseActive={handleChooseActiveDevice}
          onCancel={handleCancelConflict}
        />
      )}
    </div>
  );
};

export default RoomPage;
