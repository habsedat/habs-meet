import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../contexts/LiveKitContext';
import { api } from '../lib/api';
import { doc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, updateDoc, getDoc, getDocs, where } from 'firebase/firestore';
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
import RecordingConsentModal from '../components/RecordingConsentModal';
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [showBottomControls, setShowBottomControls] = useState(true);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [lastSeenMessageId, setLastSeenMessageId] = useState<string | null>(null);
  const [showDeviceConflictModal, setShowDeviceConflictModal] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{ activeMeeting: any; currentDevice: string } | null>(null);
  const [showRecordingConsentModal, setShowRecordingConsentModal] = useState(false);
  const [hasConsentedToRecording, setHasConsentedToRecording] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState(false); // Track if meeting has ended to prevent reconnection
  const previousRecordingStatusRef = React.useRef<boolean>(false); // Track previous recording status to detect transitions
  // ✅ CRITICAL FIX: Use refs to access current state values without recreating listener
  const hasConsentedToRecordingRef = React.useRef<boolean>(false);
  const isConnectedRef = React.useRef<boolean>(false);
  const showRecordingConsentModalRef = React.useRef<boolean>(false);
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
        
        // ✅ RECORDING STATUS: Listen to room-level recording status for consent modal
        // Note: Each participant tracks their own recording in their participant document
        // Room-level tracking is used to notify all participants when ANYONE starts recording
        const roomHasActiveRecording = roomData.isRecording === true;
        const recordingStartedBy = roomData.recordingStartedBy; // Who started the recording (for consent modal)
        const wasRoomRecording = previousRecordingStatusRef.current; // Use ref to track previous state
        
        // ✅ CRITICAL DEBUG: Log room data to help diagnose production issues
        console.log('[RoomPage] 🔍 Room data snapshot:', {
          roomId,
          isRecording: roomData.isRecording,
          recordingStartedBy: roomData.recordingStartedBy,
          wasRoomRecording,
          roomHasActiveRecording,
          userUid: user?.uid,
          isConnected: isConnectedRef.current,
          hasConsented: hasConsentedToRecordingRef.current
        });
        
        // ✅ CRITICAL: Show consent modal ONLY to participants who are NOT the one who started recording
        // If ANY participant just started recording (transition from false to true at room level):
        if (roomHasActiveRecording && !wasRoomRecording) {
          const isUserWhoStartedRecording = recordingStartedBy === user.uid;
          
          console.log('[RoomPage] 🔍 Recording transition detected:', {
            roomHasActiveRecording,
            wasRoomRecording,
            recordingStartedBy,
            isUserWhoStartedRecording,
            hasConsentedToRecording: hasConsentedToRecordingRef.current,
            isConnected: isConnectedRef.current,
            showModal: showRecordingConsentModalRef.current
          });
          
          if (!isUserWhoStartedRecording) {
            // User is NOT the one who started recording
            // Show consent modal if they haven't consented yet
            // Note: We check isConnected to ensure user is actually in the meeting
            if (!hasConsentedToRecordingRef.current && isConnectedRef.current) {
              console.log('[RoomPage] ✅ Another participant started recording, showing consent modal to active participant');
              // Use setTimeout to ensure state is ready and modal shows properly
              setTimeout(() => {
                setShowRecordingConsentModal(true);
                showRecordingConsentModalRef.current = true;
              }, 100);
            } else {
              console.log('[RoomPage] ⚠️ Cannot show modal:', {
                hasConsented: hasConsentedToRecordingRef.current,
                isConnected: isConnectedRef.current
              });
            }
          } else {
            // User started recording themselves - auto-consent, no modal needed
            console.log('[RoomPage] User started recording themselves, no consent modal needed');
            setHasConsentedToRecording(true);
            hasConsentedToRecordingRef.current = true;
          }
        }
        
        // ✅ FALLBACK: Also check if recording is active and user hasn't consented yet
        // This handles edge cases where the transition detection might have been missed
        // (e.g., if user was on another tab, or state update timing issues)
        if (roomHasActiveRecording && !hasConsentedToRecordingRef.current && recordingStartedBy) {
          const isUserWhoStartedRecording = recordingStartedBy === user.uid;
          
          // Only show modal if:
          // 1. User is NOT the one who started recording
          // 2. Modal is not already showing
          // 3. User is connected to the meeting (to avoid showing before they join)
          if (!isUserWhoStartedRecording && !showRecordingConsentModalRef.current && isConnectedRef.current) {
            console.log('[RoomPage] ✅ Fallback: Recording is active, user has not consented, showing modal');
            // Use setTimeout to ensure state is ready and modal shows properly
            setTimeout(() => {
              setShowRecordingConsentModal(true);
              showRecordingConsentModalRef.current = true;
            }, 100);
          }
        }
        
        // Update ref to track previous room-level recording status for next listener call
        previousRecordingStatusRef.current = roomHasActiveRecording;
        
        // Note: Recording state (isRecording) is now tracked from participant document, not room document
        
        // ✅ CRITICAL: If room is ended, disconnect and leave immediately - NO DELAYS
        if (roomData.status === 'ended' && !meetingEnded) {
          console.log('[RoomPage] ⚠️⚠️⚠️ ROOM ENDED - FORCING IMMEDIATE DISCONNECT ⚠️⚠️⚠️');
          setMeetingEnded(true); // Set flag to prevent any further connection attempts
          
          // Stop any ongoing connection attempts
          connectionAttemptRef.current = false;
          connectionEstablishedRef.current = false;
          
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
  }, [roomId, user, navigate, disconnect]); // ✅ CRITICAL FIX: Removed dependencies that cause listener recreation

  // Check if user is host (including cohost) and if they're banned
  // Also track participant's own recording status (for recording badge display)
  useEffect(() => {
    if (!roomId || !user) return;

    const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
    const unsubscribeParticipant = onSnapshot(participantRef, (participantDoc) => {
      if (participantDoc.exists()) {
        const participantData = participantDoc.data() as any;
        // Both host and cohost have host privileges
        setIsHost(participantData.role === 'host' || participantData.role === 'cohost');
        
        // ✅ Check participant's own recording status (each participant records independently)
        // This is used to show the recording badge ONLY to the person who is recording
        // Use functional state updates to avoid dependency issues
        const participantRecordingStatus = participantData.isRecording === true;
        const participantRecordingStartedAt = participantData.recordingStartedAt;
        
        // Update local recording state from participant document (functional update to avoid loops)
        setIsRecording((prevIsRecording) => {
          if (participantRecordingStatus !== prevIsRecording) {
            return participantRecordingStatus;
          }
          return prevIsRecording;
        });
        
        // Calculate recording duration from participant's recording start time (functional update)
        if (participantRecordingStatus && participantRecordingStartedAt) {
          const startTime = participantRecordingStartedAt.toMillis ? participantRecordingStartedAt.toMillis() : participantRecordingStartedAt;
          const duration = Math.floor((Date.now() - startTime) / 1000);
          setRecordingDuration((prevDuration) => {
            if (duration !== prevDuration) {
              return duration;
            }
            return prevDuration;
          });
        } else if (!participantRecordingStatus) {
          setRecordingDuration((prevDuration) => {
            if (prevDuration !== 0) {
              return 0;
            }
            return prevDuration;
          });
        }
        
        // If user is banned, disconnect them immediately
        if (participantData.isBanned === true) {
          toast.error('You have been removed from this meeting');
          disconnect();
          setTimeout(() => navigate('/'), 2000);
        }
      }
    });

    return unsubscribeParticipant;
  }, [roomId, user, disconnect, navigate]); // Removed isRecording and recordingDuration to prevent dependency loops

  // ✅ CRITICAL FIX: Keep refs in sync with state values
  useEffect(() => {
    hasConsentedToRecordingRef.current = hasConsentedToRecording;
  }, [hasConsentedToRecording]);
  
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);
  
  useEffect(() => {
    showRecordingConsentModalRef.current = showRecordingConsentModal;
  }, [showRecordingConsentModal]);

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

  // ✅ STABILITY FIX: Add connection state ref to prevent race conditions
  const connectionAttemptRef = useRef(false);
  const connectionEstablishedRef = useRef(false);

  // Check for device conflicts and connect to LiveKit room
  useEffect(() => {
    if (!roomId || !user) return;
    
    // ✅ STABILITY FIX: Prevent multiple simultaneous connection attempts
    if (isConnected || isConnecting || connectionAttemptRef.current) {
      return;
    }

    const connectToRoom = async () => {
      // ✅ CRITICAL: Don't attempt connection if meeting has ended
      if (meetingEnded || roomData?.status === 'ended') {
        console.log('[RoomPage] ⚠️ Meeting has ended, skipping connection attempt');
        setMeetingEnded(true);
        connectionAttemptRef.current = false;
        return;
      }
      
      // ✅ STABILITY FIX: Set flag immediately to prevent race conditions
      connectionAttemptRef.current = true;
      
      try {
        // Check lobby status first
        const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
        const participantSnap = await getDoc(participantRef);
        
        if (participantSnap.exists()) {
          const participantData = participantSnap.data() as any;
          const lobbyStatus = participantData.lobbyStatus || 'admitted';
          
          if (lobbyStatus === 'waiting') {
            connectionAttemptRef.current = false;
            navigate('/waiting-room');
            return;
          }
          
          if (lobbyStatus === 'denied') {
            connectionAttemptRef.current = false;
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
          connectionAttemptRef.current = false; // Reset on conflict
          return; // Don't connect yet, wait for user choice
        }

        // No conflict - proceed with connection
        await proceedWithConnection();
      } catch (error: any) {
        connectionAttemptRef.current = false;
        console.error('[RoomPage] Connection error:', error);
        toast.error('Failed to join room: ' + error.message);
        navigate('/');
      }
    };

    const proceedWithConnection = async () => {
      try {
        // ✅ CRITICAL: Check if meeting has ended before attempting connection
        if (meetingEnded || roomData?.status === 'ended') {
          console.log('[RoomPage] ⚠️ Meeting has ended, aborting connection attempt');
          setMeetingEnded(true);
          connectionAttemptRef.current = false;
          toast.error('This meeting has ended. Redirecting...', { duration: 2000 });
          setTimeout(() => {
            navigate('/home');
          }, 2000);
          return;
        }
        
        // Check if this is a scheduled meeting with a pre-generated token
        const isScheduledMeeting = sessionStorage.getItem('isScheduledMeeting') === 'true';
        const preGeneratedToken = sessionStorage.getItem('meetingToken');
        
        let token: string;
        
        if (isScheduledMeeting && preGeneratedToken) {
          token = preGeneratedToken;
          sessionStorage.removeItem('meetingToken');
          sessionStorage.removeItem('isScheduledMeeting');
        } else {
          // ✅ CRITICAL: Check room status again before getting token
          if (roomData?.status === 'ended') {
            console.log('[RoomPage] ⚠️ Meeting ended before token request, aborting');
            setMeetingEnded(true);
            connectionAttemptRef.current = false;
            toast.error('This meeting has ended. Redirecting...', { duration: 2000 });
            setTimeout(() => {
              navigate('/home');
            }, 2000);
            return;
          }
          
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
          
          try {
            const response = await api.getMeetingToken(roomId);
            token = response.token;
          } catch (tokenError: any) {
            // Handle 403/ended meeting error specifically
            if (tokenError.message?.includes('meeting has ended') || tokenError.message?.includes('expired') || tokenError.status === 403) {
              console.log('[RoomPage] ⚠️ Meeting ended during token request');
              setMeetingEnded(true);
              connectionAttemptRef.current = false;
              toast.error('This meeting has ended. Redirecting...', { duration: 2000 });
              setTimeout(() => {
                navigate('/home');
              }, 2000);
              return;
            }
            throw tokenError; // Re-throw if it's a different error
          }
        }
        
        console.log('[RoomPage] 🔄 Starting connection...');
        
        // Connect - the connect() function will trigger RoomEvent.Connected
        // We don't need to poll - the event handler will update state
        await connect(token);
        
        // ✅ CRITICAL FIX: Don't poll for connection - rely on RoomEvent.Connected event
        // The event handler in LiveKitContext will update state and trigger track publishing
        // Just wait a brief moment for the connection event to fire
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Set active meeting if we have room data
        if (roomData?.title) {
          try {
            await activeMeetingService.setActiveMeeting(user.uid, roomId, roomData.title);
            console.log('[RoomPage] ✅ Active meeting set successfully');
          } catch (error) {
            console.warn('[RoomPage] ⚠️ Failed to set active meeting:', error);
          }
        }
      } catch (error: any) {
        connectionAttemptRef.current = false;
        connectionEstablishedRef.current = false;
        console.error('[RoomPage] ❌ Failed to connect:', error);
        
        // Handle meeting ended error gracefully
        if (error.message?.includes('meeting has ended') || error.message?.includes('expired') || error.status === 403 || error.response?.status === 403) {
          console.log('[RoomPage] Meeting has ended, handling gracefully');
          setMeetingEnded(true); // Set flag to prevent any further attempts
          connectionAttemptRef.current = false;
          connectionEstablishedRef.current = false;
          toast.error('This meeting has ended. Redirecting...', { duration: 2000 });
          setTimeout(() => {
            navigate('/home');
          }, 2000);
          return;
        }
        toast.error('Failed to join room: ' + (error.message || 'Unknown error'));
        navigate('/');
      }
    };

    connectToRoom();
    
    // ✅ STABILITY FIX: Cleanup function to reset flags
    return () => {
      // Only reset if we're not actually connected
      if (!isConnected) {
        connectionAttemptRef.current = false;
        connectionEstablishedRef.current = false;
      }
    };
  }, [roomId, user, navigate, disconnect, isConnected, isConnecting, roomData, connect, room]);

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

  // ✅ STABILITY FIX: Reset connection flags when disconnecting
  useEffect(() => {
    if (!isConnected && !isConnecting) {
      // Reset flags when disconnected
      connectionAttemptRef.current = false;
      connectionEstablishedRef.current = false;
      trackPublishingRef.current = false;
    }
  }, [isConnected, isConnecting]);

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
      // ✅ STABILITY FIX: Reset all flags on unmount
      connectionAttemptRef.current = false;
      connectionEstablishedRef.current = false;
      trackPublishingRef.current = false;
    };
  }, [user, roomId, isConnected]);

  // ✅ REMOVED: This effect was causing conflicts with track publishing
  // Track publishing is now handled in the main publishing effect below
  // Camera/mic are enabled automatically via publishFromSavedSettings

  // ✅ CRITICAL FIX: Track publishing ref to prevent multiple simultaneous attempts
  const trackPublishingRef = useRef(false);
  const tracksPublishedRef = useRef(false); // Track if we've already published tracks for this connection

  // ✅ CRITICAL FIX: Publish tracks immediately when connection is established
  // This prevents flashing/blinking by ensuring camera/mic are enabled right away
  useEffect(() => {
    // Reset published flag when disconnected
    if (!isConnected || !room) {
      tracksPublishedRef.current = false;
      trackPublishingRef.current = false;
      return;
    }
    
    // ✅ CRITICAL: Only publish ONCE per connection - prevent multiple publishes
    if (tracksPublishedRef.current) {
      return;
    }
    
    // ✅ CRITICAL: Multiple guards to ensure we only publish when truly ready
    if (!roomId || !room) {
      return;
    }
    
    // ✅ CRITICAL: Room MUST be in connected state
    if (room.state !== 'connected') {
      return;
    }
    
    // ✅ CRITICAL: Must have localParticipant
    if (!room.localParticipant) {
      return;
    }
    
    // ✅ STABILITY FIX: Prevent multiple simultaneous publishing attempts
    if (trackPublishingRef.current) {
      return;
    }
    
    console.log('[RoomPage] ✅ All conditions met, publishing tracks immediately...');
    
    // ✅ CRITICAL FIX: Publish tracks immediately with minimal delay
    const publishTracks = async () => {
      // Check if room is still connected
      if (!room || room.state !== 'connected' || !isConnected || !room.localParticipant) {
        trackPublishingRef.current = false;
        return;
      }
      
      // Set flag to prevent concurrent attempts
      trackPublishingRef.current = true;
      
      try {
        // ✅ CRITICAL: Small delay to ensure peer connection is ready (reduced from 1000ms to 300ms)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Verify again after delay
        if (!room || room.state !== 'connected' || !isConnected || !room.localParticipant) {
          trackPublishingRef.current = false;
          return;
        }
        
        // Publish tracks immediately
        await publishFromSavedSettings();
        console.log('[RoomPage] ✅ Tracks published successfully');
        tracksPublishedRef.current = true; // Mark as published
        trackPublishingRef.current = false;
      } catch (error: any) {
        console.error('[RoomPage] Error publishing tracks:', error);
        trackPublishingRef.current = false;
        // Don't mark as published if it failed - allow retry after a delay
        setTimeout(() => {
          tracksPublishedRef.current = false;
        }, 2000);
      }
    };
    
    // ✅ CRITICAL FIX: Publish immediately with minimal delay (reduced from 1200ms to 200ms)
    const publishTimeout = setTimeout(() => {
      publishTracks();
    }, 200);
    
    return () => {
      clearTimeout(publishTimeout);
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

  // Check recording status when user connects (for participants joining already-recording meetings)
  // This is now handled by the Firestore room listener above

  // Update recording duration timer (for all participants)
  // Each participant tracks their own recording duration
  useEffect(() => {
    if (!isRecording) {
      setRecordingDuration(0);
      return;
    }

    const interval = setInterval(() => {
      // Get duration from recording service (works for all participants who are recording)
      const state = recordingService.getState();
      if (state.isRecording && state.startTime) {
        setRecordingDuration(state.duration);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Subscribe to recording state changes (for all participants' local recording service)
  useEffect(() => {
    const handleRecordingStateChange = (state: any) => {
      const wasRecording = isRecording;
      const nowRecording = state.isRecording;
      
      // Update from local service (works for all participants)
      setIsRecording(nowRecording);
      setRecordingDuration(state.duration);
      
      // If recording just started and user hasn't consented, show consent modal
      if (nowRecording && !wasRecording && !hasConsentedToRecordingRef.current && isConnectedRef.current) {
        setShowRecordingConsentModal(true);
        showRecordingConsentModalRef.current = true;
      }
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
  }, [isRecording, hasConsentedToRecording, isConnected]);

  const handleRecord = async () => {
    console.log('[RoomPage] handleRecord called, isRecording:', isRecording, 'room:', !!room, 'roomId:', roomId, 'user:', !!user);
    
    // If already recording, stop it
    if (isRecording) {
      console.log('[RoomPage] Stopping recording...');
      try {
        recordingService.stopRecording();
        
        // ✅ Update Firestore to stop THIS USER's recording
        // Each participant records independently, so we only update their own status
        if (roomId && user) {
          try {
            // Update participant's own recording status
            const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
            await updateDoc(participantRef, {
              isRecording: false,
              recordingStoppedAt: serverTimestamp(),
            });
            console.log('[RoomPage] Recording stopped - Participant document updated for user:', user.uid);
            
            // Check if this user was the one who triggered room-level recording status
            // If so, we need to check if anyone else is still recording before clearing room-level status
            const roomRef = doc(db, 'rooms', roomId);
            const roomSnap = await getDoc(roomRef);
            if (roomSnap.exists()) {
              const roomData = roomSnap.data();
              if (roomData?.recordingStartedBy === user.uid) {
                // This user was the one who triggered room-level recording
                // Check if any other participant is still recording
                const participantsRef = collection(db, 'rooms', roomId, 'participants');
                const participantsSnap = await getDocs(participantsRef);
                const anyOtherRecording = participantsSnap.docs.some(
                  (docSnap: any) => docSnap.id !== user.uid && docSnap.data().isRecording === true
                );
                
                if (!anyOtherRecording) {
                  // No one else is recording, clear room-level status
                  await updateDoc(roomRef, {
                    isRecording: false,
                    recordingStartedBy: null,
                    recordingStoppedAt: serverTimestamp(),
                  });
                  console.log('[RoomPage] No other participants recording - room-level status cleared');
                } else {
                  // Someone else is still recording, update recordingStartedBy to the next person
                  const stillRecording = participantsSnap.docs.find(
                    (docSnap: any) => docSnap.id !== user.uid && docSnap.data().isRecording === true
                  );
                  if (stillRecording) {
                    await updateDoc(roomRef, {
                      recordingStartedBy: stillRecording.id,
                    });
                    console.log('[RoomPage] Another participant still recording - room-level status updated');
                  }
                }
              }
            }
          } catch (error) {
            console.error('[RoomPage] Failed to update Firestore recording status:', error);
          }
        }
        
        // Don't show message here - wait for save complete callback
      } catch (error: any) {
        console.error('Error stopping recording:', error);
        toast.error('Failed to stop recording: ' + error.message);
      }
      return;
    }

    console.log('[RoomPage] Starting recording flow...');

    // Check if recording is supported
    if (!RecordingService.isSupported()) {
      console.log('[RoomPage] Recording not supported on this device');
      toast.error('Recording is not supported on this device');
      return;
    }

    if (!room || !roomId || !user) {
      console.log('[RoomPage] Missing requirements - room:', !!room, 'roomId:', roomId, 'user:', !!user);
      toast.error('Not connected to meeting room. Please wait...');
      return;
    }

    // ✅ SUBSCRIPTION CHECK: Verify user can start recording (applies to ALL participants)
    if (userProfile) {
      try {
        const { canStartRecording } = await import('../lib/subscriptionService');
        const { getSubscriptionFromProfile } = await import('../lib/subscriptionService');
        const subscription = getSubscriptionFromProfile(userProfile);
        const check = canStartRecording(subscription);
        
        if (!check.allowed) {
          console.log('[RoomPage] Recording not allowed:', check.reason);
          toast.error(check.reason || 'Cannot start recording. Please upgrade your subscription.');
          // TODO: Show upgrade modal if upgradeRequired
          return;
        }
        console.log('[RoomPage] Subscription check passed');
      } catch (error) {
        console.error('[Subscription] Error checking recording:', error);
        // Continue anyway (fail open)
      }
    }

    // ✅ CRITICAL: Person starting recording does NOT see the modal
    // They start recording immediately, and other participants will be notified
    console.log('[RoomPage] Starting recording - user will NOT see consent modal');
    
    try {
      // ✅ Update Firestore to track recording status:
      // 1. Participant-level: Track THIS user's recording status (for badge display)
      // 2. Room-level: Track that someone is recording (for consent modal to other participants)
      if (roomId && user) {
        try {
          // Update participant's own recording status
          const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
          await updateDoc(participantRef, {
            isRecording: true,
            recordingStartedAt: serverTimestamp(),
          });
          console.log('[RoomPage] Recording started - Participant document updated for user:', user.uid);
          
          // Update room-level recording status (for consent modal to other participants)
          const roomRef = doc(db, 'rooms', roomId);
          try {
            await updateDoc(roomRef, {
              isRecording: true, // Indicates someone is recording (for consent modal)
              recordingStartedBy: user.uid, // Track who started (for consent modal exclusion)
              recordingStartedAt: serverTimestamp(),
            });
            console.log('[RoomPage] ✅ Recording started - Room document updated for consent modal');
          } catch (updateError: any) {
            console.error('[RoomPage] ❌ Failed to update room document for recording:', updateError);
            console.error('[RoomPage] Error code:', updateError.code, 'Error message:', updateError.message);
            // Continue - participant document was updated, recording will still work
            // But consent modal won't show to other participants
            toast.error('Recording started but failed to notify other participants. Please try again.');
          }
        } catch (error) {
          console.error('[RoomPage] Failed to update Firestore recording status:', error);
          toast.error('Failed to update recording status');
        }
      }
      
      // Start the actual recording
      await recordingService.startRecording({
        room: room,
      });
      toast.success('Recording started - capturing your screen and meeting audio');
      setHasConsentedToRecording(true); // Person starting recording automatically consents
      hasConsentedToRecordingRef.current = true; // Update ref
      setIsRecording(true); // Update local state for badge display
    } catch (error: any) {
      console.error('Error starting recording:', error);
      
      // If recording failed, update Firestore to reflect that
      if (roomId && user) {
        try {
          // Revert participant's recording status
          const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
          await updateDoc(participantRef, {
            isRecording: false,
          });
          
          // Check if this user was the only one recording, then clear room-level status
          const roomRef = doc(db, 'rooms', roomId);
          const roomSnap = await getDoc(roomRef);
          if (roomSnap.exists()) {
            const roomData = roomSnap.data();
            if (roomData?.recordingStartedBy === user.uid) {
              // This user was the one who triggered room-level recording, clear it
              await updateDoc(roomRef, {
                isRecording: false,
                recordingStartedBy: null,
              });
            }
          }
        } catch (updateError) {
          console.error('[RoomPage] Failed to revert Firestore recording status:', updateError);
        }
      }
      
      // Check if error is subscription-related
      if (error.message?.includes('subscription') || error.message?.includes('limit') || error.message?.includes('plan')) {
        toast.error(error.message);
        // TODO: Show upgrade modal
      } else {
        toast.error('Failed to start recording: ' + error.message);
      }
    }
  };

  // Handle recording consent
  const handleRecordingConsent = () => {
    console.log('[RoomPage] Participant consented to recording');
    setShowRecordingConsentModal(false);
    showRecordingConsentModalRef.current = false;
    setHasConsentedToRecording(true);
    hasConsentedToRecordingRef.current = true;
    // No pending action needed - recording is already active, user just consented to participate
  };

  const handleRecordingDecline = () => {
    console.log('[RoomPage] Participant declined recording consent, leaving meeting');
    setShowRecordingConsentModal(false);
    showRecordingConsentModalRef.current = false;
    // User declined consent, they must leave the meeting
    disconnect();
    navigate('/home');
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
      // Show inline success message next to the button
      setLinkCopied(true);
      // Close modal after a short delay
      setTimeout(() => {
        setShowShareModal(false);
        setLinkCopied(false);
      }, 1500);
    } catch (error: any) {
      // Only show error if copy fails
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
          
          {/* Recording indicator - visible to all participants */}
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
      <div className={`h-14 bg-gray-900/95 backdrop-blur-sm flex items-center justify-center px-2 sm:px-4 z-[60] transition-transform duration-300 ${showBottomControls ? 'translate-y-0' : 'translate-y-full'}`} style={{ border: 'none', borderTop: 'none', pointerEvents: 'auto' }}>                                           
                {/* Center - main controls - scrollable on smaller screens */}
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto w-full lg:w-auto lg:justify-center flex-nowrap scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', pointerEvents: 'auto' }}>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0" style={{ pointerEvents: 'auto' }}>
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
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 items-start sm:items-center">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="flex-1 bg-gray-700 text-cloud px-3 sm:px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-techBlue focus:border-transparent text-sm sm:text-base min-w-0"    
                />
                <div className="relative w-full sm:w-auto">
                  <button
                    onClick={copyToClipboard}
                    className="bg-techBlue hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm sm:text-base whitespace-nowrap flex-shrink-0 w-full sm:w-auto"
                    title="Copy link"
                  >
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                  {linkCopied && (
                    <div 
                      className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-10"
                      style={{
                        animation: 'fadeIn 0.2s ease-in'
                      }}
                    >
                      Link copied!
                      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                        <div className="w-2 h-2 bg-gray-900 transform rotate-45 -mt-1"></div>
                      </div>
                    </div>
                  )}
                </div>
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

      {/* Recording Consent Modal - Shows to ALL participants when recording starts */}
      <RecordingConsentModal
        isOpen={showRecordingConsentModal}
        onContinue={handleRecordingConsent}
        onLeave={handleRecordingDecline}
        isHost={isHost}
      />
      
      {/* Professional Recording Status Badge - Only visible to the person recording - Top Right */}
      {isRecording && (
        <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-red-600 to-red-700 text-cloud px-4 py-2.5 rounded-lg flex items-center gap-3 shadow-xl border border-red-500/30 backdrop-blur-sm">
          <div className="relative">
            <div className="w-3 h-3 bg-cloud rounded-full animate-pulse"></div>
            <div className="absolute inset-0 w-3 h-3 bg-cloud rounded-full animate-ping opacity-75"></div>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide">Recording</span>
            {recordingDuration > 0 && (
              <span className="text-xs font-mono text-red-100">
                {RecordingService.formatDuration(recordingDuration)}
              </span>
            )}
          </div>
          <button
            onClick={handleRecord}
            className="ml-2 px-3 py-1 bg-red-800 hover:bg-red-900 text-cloud text-xs font-semibold rounded transition-colors"
            title="Stop Recording"
          >
            Stop
          </button>
        </div>
      )}
    </div>
  );
};

export default RoomPage;


