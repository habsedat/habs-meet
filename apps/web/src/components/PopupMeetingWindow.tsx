import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../contexts/LiveKitContext';
import { api } from '../lib/api';
import { MeetingService } from '../lib/meetingService';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MeetingControls from './MeetingControls';
import VideoGrid from './VideoGrid';
import ChatPanel from './ChatPanel';
import ParticipantsPanel from './ParticipantsPanel';
import SettingsPanel from './SettingsPanel';

interface PopupMeetingWindowProps {
  roomId: string;
  onClose: () => void;
}

const PopupMeetingWindow: React.FC<PopupMeetingWindowProps> = ({ roomId, onClose }) => {
  const { user } = useAuth();
  const { connect, disconnect, isConnected, isConnecting } = useLiveKit();
  
  // UI State for popup window
  const [showNavigation, setShowNavigation] = useState(false);
  const [mouseTimeout, setMouseTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Draggable video state
  const [videoPosition, setVideoPosition] = useState({ x: 50, y: 50 });
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [videoSize, setVideoSize] = useState({ width: 400, height: 300 });
  const videoRef = useRef<HTMLDivElement>(null);
  
  const [room, setRoom] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [activePanel, setActivePanel] = useState<'chat' | 'participants' | 'settings' | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Mouse event handlers for auto-hide navigation
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingVideo) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Keep video within screen bounds
      const maxX = window.innerWidth - videoSize.width;
      const maxY = window.innerHeight - videoSize.height;
      
      setVideoPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    } else {
      setShowNavigation(true);
      if (mouseTimeout) {
        clearTimeout(mouseTimeout);
      }
      const timeout = setTimeout(() => {
        setShowNavigation(false);
      }, 3000);
      setMouseTimeout(timeout);
    }
  };

  const handleMouseLeave = () => {
    if (!isDraggingVideo) {
      if (mouseTimeout) {
        clearTimeout(mouseTimeout);
      }
      const timeout = setTimeout(() => {
        setShowNavigation(false);
      }, 1000);
      setMouseTimeout(timeout);
    }
  };

  // Video drag event handlers
  const handleVideoMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('video-drag-handle')) {
      setIsDraggingVideo(true);
      const rect = videoRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleVideoMouseUp = () => {
    setIsDraggingVideo(false);
  };

  // Global mouse event listeners for video dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingVideo) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        const maxX = window.innerWidth - videoSize.width;
        const maxY = window.innerHeight - videoSize.height;
        
        setVideoPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingVideo(false);
    };

    if (isDraggingVideo) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingVideo, dragOffset, videoSize]);

  // Prevent page refresh during meeting
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave the meeting? Your video will be disconnected.';
      return 'Are you sure you want to leave the meeting? Your video will be disconnected.';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Generate meeting share link
  const generateShareLink = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/invite/${roomId}`;
  };

  // Copy share link to clipboard
  const copyShareLink = async () => {
    try {
      const shareLink = generateShareLink();
      await navigator.clipboard.writeText(shareLink);
      console.log('Meeting link copied to clipboard');
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  // End meeting (host only)
  const handleEndMeeting = async () => {
    if (!isHost) return;
    
    try {
      await MeetingService.endMeeting(roomId);
      disconnect();
      onClose();
    } catch (error: any) {
      console.error('Failed to end meeting:', error);
    }
  };

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
        console.error('Room not found');
        onClose();
      }
    });

    return unsubscribe;
  }, [roomId, user, onClose]);

  // Check if user is host
  useEffect(() => {
    if (!roomId || !user) return;

    const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
    const unsubscribeParticipant = onSnapshot(participantRef, (participantDoc) => {
      if (participantDoc.exists()) {
        const participantData = participantDoc.data() as any;
        setIsHost(participantData.role === 'host' || participantData.role === 'cohost');
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
      // Chat messages are now handled by the ChatPanel component
      console.log('Chat messages updated:', snapshot.docs.length);
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
        console.error('Failed to join room: ' + error.message);
        onClose();
      }
    };

    connectToRoom();
  }, [roomId, user, isConnected, isConnecting, connect, onClose]);

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
    onClose();
  }, [disconnect, onClose]);

  const handleRecord = async () => {
    if (!isHost) return;
    
    try {
      setIsRecording(!isRecording);
      console.log(isRecording ? 'Recording stopped' : 'Recording started');
    } catch (error: any) {
      console.error('Failed to toggle recording: ' + error.message);
    }
  };

  const handleLock = async () => {
    if (!isHost) return;
    
    try {
      setIsLocked(!isLocked);
      console.log(isLocked ? 'Room unlocked' : 'Room locked');
    } catch (error: any) {
      console.error('Failed to toggle room lock: ' + error.message);
    }
  };


  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gray-900 flex flex-col popup-meeting-window"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Auto-hide Top Navigation Bar */}
      <div className={`absolute top-0 left-0 right-0 z-10 transition-all duration-300 ${
        showNavigation ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'
      }`}>
        <div className="bg-black/80 backdrop-blur-sm border-b border-white/20">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center space-x-4">
              <h1 className="text-white text-lg font-semibold">{room.title}</h1>
              {isRecording && (
                <div className="flex items-center space-x-2 text-red-500">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm">Recording</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Share Meeting Link */}
              <button
                onClick={() => setShowShareModal(true)}
                className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
                title="Share meeting link"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
              </button>
              
              {/* End Meeting (Host only) */}
              {isHost && (
                <button
                  onClick={handleEndMeeting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  End Meeting
                </button>
              )}
              
              {/* Leave Meeting */}
              <button
                onClick={handleLeave}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex relative">
        {/* Draggable Video Area */}
        <div 
          ref={videoRef}
          className="absolute z-20 popup-video-container cursor-move video-drag-handle"
          style={{
            left: `${videoPosition.x}px`,
            top: `${videoPosition.y}px`,
            width: `${videoSize.width}px`,
            height: `${videoSize.height}px`,
            cursor: isDraggingVideo ? 'grabbing' : 'grab'
          }}
          onMouseDown={handleVideoMouseDown}
          onMouseUp={handleVideoMouseUp}
        >
          <VideoGrid />
          
          {/* Video resize handles */}
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize opacity-50 hover:opacity-100"
               onMouseDown={(e) => {
                 e.preventDefault();
                 e.stopPropagation();
                 const startX = e.clientX;
                 const startY = e.clientY;
                 const startWidth = videoSize.width;
                 const startHeight = videoSize.height;
                 
                 const handleResize = (e: MouseEvent) => {
                   const newWidth = Math.max(300, startWidth + (e.clientX - startX));
                   const newHeight = Math.max(200, startHeight + (e.clientY - startY));
                   setVideoSize({ width: newWidth, height: newHeight });
                 };
                 
                 const handleResizeEnd = () => {
                   document.removeEventListener('mousemove', handleResize);
                   document.removeEventListener('mouseup', handleResizeEnd);
                 };
                 
                 document.addEventListener('mousemove', handleResize);
                 document.addEventListener('mouseup', handleResizeEnd);
               }}
          />
        </div>

        {/* Auto-hide Bottom Controls */}
        <div className={`absolute bottom-0 left-0 right-0 transition-all duration-300 ${
          showNavigation ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full'
        }`}>
          <div className="bg-black/90 backdrop-blur-sm border-t border-white/20 rounded-t-lg">
            <MeetingControls
              isHost={isHost}
              onRecord={handleRecord}
              onLock={handleLock}
              isRecording={isRecording}
              isLocked={isLocked}
            />
          </div>
        </div>

        {/* Independent Chat Panel - Only show when activePanel is set */}
        {activePanel && (
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-gray-900 border-l border-gray-700 flex flex-col z-30">
            {/* Panel Header */}
            <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold capitalize">{activePanel}</h3>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 text-sm">{participants.length} participants</span>
                  <button
                    onClick={() => setActivePanel(null)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Close panel"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto">
              {activePanel === 'chat' && (
                <ChatPanel 
                  messages={[]}
                  onSendMessage={async () => {}}
                />
              )}
              {activePanel === 'participants' && (
                <ParticipantsPanel 
                  participants={participants}
                  isHost={isHost}
                  roomId={roomId}
                />
              )}
              {activePanel === 'settings' && (
                <SettingsPanel />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Share Meeting Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-lg font-semibold">Share Meeting</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Meeting Link
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={generateShareLink()}
                    readOnly
                    className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={copyShareLink}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
              
              <div className="text-gray-400 text-sm">
                <p>Share this link with participants to let them join the meeting.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PopupMeetingWindow;
