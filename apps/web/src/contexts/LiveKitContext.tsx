import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Room, RoomEvent, Track, RemoteParticipant, LocalParticipant, LocalTrackPublication, LocalVideoTrack, createLocalVideoTrack, createLocalAudioTrack } from 'livekit-client';
import { LIVEKIT_CONFIG } from '../lib/livekitConfig';
import { backgroundEngine } from '../video/BackgroundEngine';

interface LiveKitContextType {
  room: Room | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: (token: string) => Promise<void>;
  disconnect: () => void;
  
  // Audio/Video Controls
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
  
  // Status
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  isConnectingToRoom: boolean;
  
  // Participants
  participants: Map<string, RemoteParticipant>;
  localParticipant: LocalParticipant | null;
  
  // Room Info
  roomName: string;
  participantCount: number;
  
  // Error handling
  error: string | null;
  clearError: () => void;
  
  // Background Engine
  getLocalVideoTrack: () => LocalVideoTrack | null;
  
  // Publish from saved settings
  publishFromSavedSettings: () => Promise<void>;
}

const LiveKitContext = createContext<LiveKitContextType | undefined>(undefined);

export const useLiveKit = () => {
  const context = useContext(LiveKitContext);
  if (context === undefined) {
    throw new Error('useLiveKit must be used within a LiveKitProvider');
  }
  return context;
};

export const LiveKitProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnectingToRoom, setIsConnectingToRoom] = useState(false);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [roomName, setRoomName] = useState('');
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const roomRef = useRef<Room | null>(null);
  const hasPublishedRef = useRef(false);
  const [, forceUpdate] = useState({});

  const connect = async (token: string) => {
    if (isConnecting || isConnected) return;

    // Check if this is a mock token and skip connection for now
    if (token.startsWith('mock-token-')) {
      console.log('Mock token detected, skipping LiveKit connection for now');
      setIsConnecting(false);
      setIsConnectingToRoom(false);
      setError('LiveKit connection requires a real token. This is a demo with mock token.');
      return;
    }

    setIsConnecting(true);
    setIsConnectingToRoom(true);
    setError(null);
    
    try {
      const newRoom = new Room(LIVEKIT_CONFIG.roomConfig);
      roomRef.current = newRoom;

      // Set up comprehensive event listeners
      newRoom.on(RoomEvent.Connected, () => {
        console.log('Connected to room:', newRoom.name);
        setIsConnected(true);
        setIsConnecting(false);
        setIsConnectingToRoom(false);
        setRoomName(newRoom.name);
        setLocalParticipant(newRoom.localParticipant);
        setParticipantCount(newRoom.participants.size + 1); // +1 for local participant
      });

      newRoom.on(RoomEvent.Disconnected, (reason) => {
        console.log('Disconnected from room:', reason);
        setIsConnected(false);
        setIsConnecting(false);
        setIsConnectingToRoom(false);
        setRoom(null);
        setRoomName('');
        setParticipants(new Map());
        setLocalParticipant(null);
        setParticipantCount(0);
        roomRef.current = null;
        hasPublishedRef.current = false;
      });

      newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        setParticipants(prev => new Map(prev.set(participant.identity, participant)));
        setParticipantCount(newRoom.participants.size + 1);
      });

      newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        setParticipants(prev => {
          const newMap = new Map(prev);
          newMap.delete(participant.identity);
          return newMap;
        });
        setParticipantCount(newRoom.participants.size + 1);
      });

      newRoom.on(RoomEvent.TrackSubscribed, () => {
        // VideoGrid will handle track attachment
      });

      newRoom.on(RoomEvent.TrackUnsubscribed, () => {
        // VideoGrid will handle track detachment
      });

      newRoom.on(RoomEvent.TrackMuted, () => {
        // Track muted
      });

      newRoom.on(RoomEvent.TrackUnmuted, () => {
        // Track unmuted
      });

      newRoom.on(RoomEvent.LocalTrackPublished, () => {
        // Force re-render by setting a new object
        forceUpdate({});
      });

      newRoom.on(RoomEvent.ConnectionStateChanged, () => {
        // Connection state changed
      });

      // Connect to room
      await newRoom.connect(LIVEKIT_CONFIG.serverUrl, token);
      setRoom(newRoom);
      
      // Don't enable camera/mic here - let RoomPage handle track creation with user's device choices

    } catch (error: any) {
      console.error('Failed to connect to room:', error);
      setIsConnecting(false);
      setIsConnectingToRoom(false);
      setError(error.message || 'Failed to connect to meeting room');
      throw error;
    }
  };

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
    }
  }, []);

  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    if (!roomRef.current) return;
    
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
      setIsMicrophoneEnabled(enabled);
    } catch (error) {
      console.error('Failed to set microphone:', error);
      setError('Failed to toggle microphone');
    }
  }, []);

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    if (!roomRef.current) return;
    
    try {
      await roomRef.current.localParticipant.setCameraEnabled(enabled);
      setIsCameraEnabled(enabled);
    } catch (error) {
      console.error('Failed to set camera:', error);
      setError('Failed to toggle camera');
    }
  }, []);

  const setScreenShareEnabled = useCallback(async (enabled: boolean) => {
    if (!roomRef.current) return;
    
    try {
      await roomRef.current.localParticipant.setScreenShareEnabled(enabled);
      setIsScreenSharing(enabled);
    } catch (error) {
      console.error('Failed to set screen share:', error);
      setError('Failed to toggle screen share');
    }
  }, []);

  const toggleMicrophone = useCallback(async () => {
    await setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [isMicrophoneEnabled, setMicrophoneEnabled]);

  const toggleCamera = useCallback(async () => {
    await setCameraEnabled(!isCameraEnabled);
  }, [isCameraEnabled, setCameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    await setScreenShareEnabled(!isScreenSharing);
  }, [isScreenSharing, setScreenShareEnabled]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getLocalVideoTrack = useCallback((): LocalVideoTrack | null => {
    if (!localParticipant) return null;
    const pub = localParticipant.getTrack(Track.Source.Camera) as LocalTrackPublication | undefined;
    const track = pub?.track as LocalVideoTrack | undefined;
    return track ?? null;
  }, [localParticipant]);

  const publishFromSavedSettings = useCallback(async () => {
    if (hasPublishedRef.current) {
      return;
    }
    
    const r = roomRef.current;
    if (!r) {
      return;
    }

    hasPublishedRef.current = true;
    
    const raw = localStorage.getItem('preMeetingSettings');
    const saved = raw ? JSON.parse(raw) : {};
    const videoOn = saved.videoEnabled !== false;
    const audioOn = saved.audioEnabled !== false;

    // VIDEO
    if (videoOn) {
      const vTrack: LocalVideoTrack = await createLocalVideoTrack({
        deviceId: saved.videoDeviceId ? { exact: saved.videoDeviceId } : undefined,
        resolution: { width: 1280, height: 720 },
      });

      // Apply background effect if enabled
      try {
        const bgEnabled =
          saved.backgroundEffectsEnabled ||
          localStorage.getItem('backgroundEffectsEnabled') === 'true';
        const chosenBg =
          saved.savedBackground ||
          (localStorage.getItem('savedBackground') &&
            JSON.parse(localStorage.getItem('savedBackground')!));

        if (bgEnabled && chosenBg) {
          await backgroundEngine.init(vTrack);
          if (chosenBg.type === 'blur') await backgroundEngine.setBlur();
          else if (chosenBg.type === 'image' && chosenBg.url) await backgroundEngine.setImage(chosenBg.url);
        }
      } catch (e) {
        console.warn('[LiveKit] background effect failed, continuing without it', e);
      }

      await r.localParticipant.publishTrack(vTrack, {
        source: Track.Source.Camera,
      });
      setIsCameraEnabled(true);
      
      // Force a re-render after a short delay to allow VideoTile to pick up the track
      setTimeout(() => {
        forceUpdate({});
        setLocalParticipant(r.localParticipant);
      }, 100);
    }

    // AUDIO
    if (audioOn) {
      const aTrack = await createLocalAudioTrack({
        deviceId: saved.audioDeviceId ? { exact: saved.audioDeviceId } : undefined,
      });
      await r.localParticipant.publishTrack(aTrack);
      setIsMicrophoneEnabled(true);
    }
  }, []);

  const value: LiveKitContextType = {
    room,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    
    // Audio/Video Controls
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    setMicrophoneEnabled,
    setCameraEnabled,
    setScreenShareEnabled,
    
    // Status
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenSharing,
    isConnectingToRoom,
    
    // Participants
    participants,
    localParticipant,
    
    // Room Info
    roomName,
    participantCount,
    
    // Error handling
    error,
    clearError,
    
    // Background Engine
    getLocalVideoTrack,
    
    // Publish from saved settings
    publishFromSavedSettings,
  };

  return <LiveKitContext.Provider value={value}>{children}</LiveKitContext.Provider>;
};
