import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../contexts/LiveKitContext';
import { api } from '../lib/api';
import { doc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';
import Header from '../components/Header';
import MeetingControls from '../components/MeetingControls';
import VideoGrid from '../components/VideoGrid';
import ChatPanel from '../components/ChatPanel';
import ParticipantsPanel from '../components/ParticipantsPanel';
import SettingsPanel from '../components/SettingsPanel';

const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { connect, disconnect, isConnected, isConnecting } = useLiveKit();
  
  const [room, setRoom] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [activePanel, setActivePanel] = useState<'chat' | 'participants' | 'settings'>('chat');
  const [isHost, setIsHost] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Load room data
  useEffect(() => {
    if (!roomId || !user) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (doc) => {
      if (doc.exists()) {
        const roomData = { id: doc.id, ...doc.data() } as any;
        setRoom(roomData);
        setIsLocked(roomData.status === 'locked');
      } else {
        toast.error('Room not found');
        navigate('/');
      }
    });

    return unsubscribe;
  }, [roomId, user, navigate]);

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

  const handleLeave = useCallback(() => {
    disconnect();
    navigate('/');
  }, [disconnect, navigate]);

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

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-techBlue"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight flex flex-col">
      <Header 
        title={room.title} 
        onLeave={handleLeave}
        showUserMenu={false}
      />
      
      <div className="flex-1 flex">
        {/* Main video area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-4">
            <VideoGrid participants={participants} />
          </div>
          
          <MeetingControls
            isHost={isHost}
            onRecord={handleRecord}
            onLock={handleLock}
            isRecording={isRecording}
            isLocked={isLocked}
          />
        </div>

        {/* Right panel */}
        <div className="w-80 bg-cloud border-l border-gray-300 flex flex-col">
          {/* Panel tabs */}
          <div className="flex border-b border-gray-300">
            <button
              onClick={() => setActivePanel('chat')}
              className={`flex-1 py-3 px-4 text-sm font-medium ${
                activePanel === 'chat'
                  ? 'text-techBlue border-b-2 border-techBlue'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActivePanel('participants')}
              className={`flex-1 py-3 px-4 text-sm font-medium ${
                activePanel === 'participants'
                  ? 'text-techBlue border-b-2 border-techBlue'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Participants ({participants.length})
            </button>
            <button
              onClick={() => setActivePanel('settings')}
              className={`flex-1 py-3 px-4 text-sm font-medium ${
                activePanel === 'settings'
                  ? 'text-techBlue border-b-2 border-techBlue'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Settings
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
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
      </div>
    </div>
  );
};

export default RoomPage;
