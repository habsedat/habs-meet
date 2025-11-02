import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../contexts/LiveKitContext';
import { api } from '../lib/api';
import { doc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';
import MeetingControls from '../components/MeetingControls';
import VideoGrid from '../components/VideoGrid';
import ChatPanel from '../components/ChatPanel';
import ParticipantsPanel from '../components/ParticipantsPanel';
import SettingsPanel from '../components/SettingsPanel';

const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { connect, disconnect, isConnected, isConnecting, publishFromSavedSettings } = useLiveKit();
  
  const [roomData, setRoomData] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [activePanel, setActivePanel] = useState<'chat' | 'participants' | 'settings' | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [showBottomControls, setShowBottomControls] = useState(true);

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

  // Check if user is host
  useEffect(() => {
    if (!roomId || !user) return;

    const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
    const unsubscribeParticipant = onSnapshot(participantRef, (participantDoc) => {
      if (participantDoc.exists()) {
        const participantData = participantDoc.data() as any;
        setIsHost(participantData.role === 'host');
      }
    });

    return unsubscribeParticipant;
  }, [roomId, user]);

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

  // Load chat messages
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
    });

    return unsubscribe;
  }, [roomId]);

  // Connect to LiveKit room
  useEffect(() => {
    if (!roomId || !user || isConnected || isConnecting) return;

    const connectToRoom = async () => {
      try {
      const { token } = await api.getMeetingToken(roomId);
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

  // Auto-hide bottom controls after 15 seconds of inactivity
  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout;
    
    const resetTimer = () => {
      setShowBottomControls(true);
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        setShowBottomControls(false);
      }, 15000); // 15 seconds
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
          handleLeave();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleLeave = useCallback(async () => {
    // If host is leaving, end the room
    if (isHost && roomId) {
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await updateDoc(roomRef, {
          status: 'ended',
          endedAt: serverTimestamp()
        });
        toast.success('Meeting ended');
      } catch (error: any) {
        console.error('Failed to end room:', error);
      }
    }
    
    disconnect();
    navigate('/');
  }, [disconnect, navigate, isHost, roomId]);

  const handleRecord = async () => {
    if (!isHost) return;
    
    try {
      // TODO: Implement recording start/stop via API
      setIsRecording(!isRecording);
      toast.success(isRecording ? 'Recording stopped' : 'Recording started');
    } catch (error: any) {
      toast.error('Failed to toggle recording: ' + error.message);
    }
  };

  const handleLock = async () => {
    if (!isHost) return;
    
    try {
      // TODO: Implement room lock/unlock via API
      setIsLocked(!isLocked);
      toast.success(isLocked ? 'Room unlocked' : 'Room locked');
    } catch (error: any) {
      toast.error('Failed to toggle room lock: ' + error.message);
    }
  };

  const sendChatMessage = async (text: string) => {
    if (!user || !userProfile || !text.trim()) return;

    try {
      await addDoc(collection(db, 'rooms', roomId!, 'chat'), {
        uid: user.uid,
        displayName: userProfile.displayName,
        text: text.trim(),
        createdAt: serverTimestamp(),
      });
    } catch (error: any) {
      toast.error('Failed to send message: ' + error.message);
    }
  };

  const handleShareLink = async () => {
    if (!isHost || !roomId) return;
    
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
    <div className="h-screen bg-midnight flex flex-col overflow-hidden relative">
      {/* Top bar - always visible, thin */}
      <header className="h-12 bg-gray-900/90 backdrop-blur-sm border-b border-gray-700 px-2 sm:px-4 flex items-center justify-between z-20">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-techBlue to-violetDeep rounded-lg flex items-center justify-center">
            <span className="text-cloud font-bold text-lg">H</span>
          </div>
          <span className="text-cloud font-medium text-xs sm:text-sm truncate max-w-[200px] sm:max-w-none">{roomData.title}</span>
        </div>
        <div className="flex items-center space-x-2">
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
            <VideoGrid />
          </div>
        </div>

        {/* Side panel - slide in from right when active */}
        {activePanel && (
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-80 bg-cloud border-l border-gray-300 flex flex-col overflow-hidden shadow-2xl z-30">
            {/* Panel header */}
            <div className="h-12 bg-gray-800 flex items-center justify-between px-4 border-b border-gray-700">
              <h3 className="text-cloud font-semibold text-sm uppercase">
                {activePanel === 'chat' && 'Chat'}
                {activePanel === 'participants' && 'Participants'}
                {activePanel === 'settings' && 'Settings'}
              </h3>
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
              {activePanel === 'participants' && (
                <ParticipantsPanel
                  participants={participants}
                  isHost={isHost}
                  roomId={roomId!}
                />
              )}
              {activePanel === 'settings' && (
                <SettingsPanel />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls bar - auto-hide */}
      <div className={`h-14 bg-gray-900/95 backdrop-blur-sm border-t border-gray-700 flex items-center justify-center px-2 sm:px-4 z-20 transition-transform duration-300 ${showBottomControls ? 'translate-y-0' : 'translate-y-full'}`}>
        {/* Center - main controls */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          <MeetingControls
            isHost={isHost}
            onRecord={handleRecord}
            onLock={handleLock}
            isRecording={isRecording}
            isLocked={isLocked}
          />
          
          <div className="w-px h-8 bg-gray-600 mx-2"></div>
          
          <button
            onClick={() => setActivePanel(activePanel === 'participants' ? null : 'participants')}
            className={`relative p-1.5 sm:p-2 hover:bg-gray-700 rounded transition-colors ${
              activePanel === 'participants' ? 'text-techBlue' : 'text-gray-400 hover:text-white'
            }`}
            title="Participants"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 bg-techBlue text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {participants.length}
            </span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
            className={`p-1.5 sm:p-2 hover:bg-gray-700 rounded transition-colors ${
              activePanel === 'chat' ? 'text-techBlue' : 'text-gray-400 hover:text-white'
            }`}
            title="Chat"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>

          {isHost && (
            <button
              onClick={handleShareLink}
              className={`p-1.5 sm:p-2 hover:bg-gray-700 rounded transition-colors ${
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

          <div className="w-px h-8 bg-gray-600 mx-2"></div>

          {/* Right side - end/leave button */}
          <button
            onClick={handleLeave}
            className="bg-red-600 hover:bg-red-700 text-white px-4 sm:px-6 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base"
          >
            {isHost ? 'End' : 'Leave'}
          </button>
        </div>
      </div>

      {/* Share Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShareModal(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-cloud">Share Meeting Link</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Invite participants to join this meeting
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="flex-1 bg-gray-700 text-cloud px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-techBlue focus:border-transparent"
                />
                <button
                  onClick={copyToClipboard}
                  className="bg-techBlue hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                  title="Copy link"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="text-sm text-gray-400">
              <p>This link will expire in 7 days and can be used up to 100 times.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
