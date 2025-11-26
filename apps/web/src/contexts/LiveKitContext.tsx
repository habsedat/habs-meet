import React, { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Room, RoomEvent, Track, RemoteParticipant, LocalParticipant, LocalTrackPublication, LocalVideoTrack, createLocalVideoTrack, createLocalAudioTrack, ParticipantEvent, DataPacket_Kind } from 'livekit-client';

// ✅ Remote control event types
export interface RemoteControlEvent {
  type: 'mousemove' | 'mousedown' | 'mouseup' | 'click' | 'wheel' | 'keydown' | 'keyup';
  x: number; // Normalized coordinate (0-1) relative to screen size
  y: number; // Normalized coordinate (0-1) relative to screen size
  button?: number; // Mouse button (0 = left, 1 = middle, 2 = right)
  key?: string; // Keyboard key
  deltaY?: number; // For wheel events
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}
import { LIVEKIT_CONFIG } from '../lib/livekitConfig';
import { backgroundEngine } from '../video/BackgroundEngine';
import { useAuth } from './AuthContext';
import { auth } from '../lib/firebase';
import toast from '../lib/toast';

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
  switchCamera: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
  
  // Status
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  isConnectingToRoom: boolean;
  isScreenShareSupported: boolean;
  
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
  
  // Remote control for screen sharing
  sendRemoteControlEvent: (targetParticipantId: string, event: RemoteControlEvent) => Promise<void>;
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
  const { userProfile } = useAuth(); // Get userProfile to access savedBackground
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnectingToRoom, setIsConnectingToRoom] = useState(false);
  const connectingRef = useRef(false); // Prevent race conditions
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [participants, setParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [roomName, setRoomName] = useState('');
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const roomRef = useRef<Room | null>(null);
  const hasPublishedRef = useRef(false);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenShareTrackRef = useRef<LocalVideoTrack | null>(null);
  const [, forceUpdate] = useState({});

  // Helper function to detect mobile devices
  const isMobileDevice = useCallback(() => {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  }, []);

  // ✅ NETWORK QUALITY DETECTION: Detect network quality and adjust accordingly
  const getNetworkQuality = useCallback(() => {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return 'unknown';
    }
    
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!connection) {
      return 'unknown';
    }
    
    // Check effective type (4g, 3g, 2g, slow-2g)
    const effectiveType = connection.effectiveType;
    const downlink = connection.downlink || 0; // Mbps
    
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.5) {
      return 'poor';
    } else if (effectiveType === '3g' || downlink < 2) {
      return 'medium';
    } else {
      return 'good';
    }
  }, []);

  // Get optimized video constraints based on device type AND network quality
  const getVideoConstraints = useCallback(() => {
    const isMobile = isMobileDevice();
    const networkQuality = getNetworkQuality();
    
    // ✅ NETWORK-BASED OPTIMIZATION: Adjust quality based on network conditions
    if (isMobile || networkQuality === 'poor') {
      // Mobile OR poor network: Lowest quality for maximum compatibility
      return {
        width: 320, // Very low for poor networks
        height: 180, // Very low for poor networks
        frameRate: 10, // Very low frame rate for poor networks
      };
    } else if (networkQuality === 'medium') {
      // Medium network: Moderate quality
      return {
        width: 640,
        height: 360,
        frameRate: 15,
      };
    } else {
      // Good network: Higher quality (but still optimized)
      if (isMobile) {
        return {
          width: 480,
          height: 270,
          frameRate: 12,
        };
      } else {
        return {
          width: 1280,
          height: 720,
          frameRate: 30,
        };
      }
    }
  }, [isMobileDevice, getNetworkQuality]);

  // LIVEKIT CONNECTION – CLEAN, STABLE VERSION
  const connect = useCallback(async (token: string) => {
    // prevent double connections
    if (connectingRef.current || isConnecting || isConnected) {
      console.log('[LiveKit] connect() skipped – already connecting/connected');
      return;
    }

    // mock token check (keep this for dev if you use it)
    if (token.startsWith('mock-token-')) {
      console.log('[LiveKit] Mock token detected, skipping real connection');
      setIsConnecting(false);
      setIsConnectingToRoom(false);
      setError('LiveKit connection requires a real token.');
      return;
    }

    connectingRef.current = true;
    setIsConnecting(true);
    setIsConnectingToRoom(true);
    setError(null);

    // clear previous room
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (err) {
        console.warn('[LiveKit] error disconnecting old room', err);
      }
      roomRef.current = null;
    }

    // reset state
    setRoom(null);
    setRoomName('');
    setParticipants(new Map());
    setLocalParticipant(null);
    setParticipantCount(0);
    hasPublishedRef.current = false;

    try {
      // create room with your existing config
      const newRoom = new Room(LIVEKIT_CONFIG.roomConfig);
      roomRef.current = newRoom;

      // helper to rebuild participants map from the room
      const rebuildParticipants = () => {
        if (!roomRef.current) return;
        const map = new Map<string, RemoteParticipant>();

        roomRef.current.participants.forEach((p) => {
          if (p instanceof RemoteParticipant) {
            map.set(p.identity, p);
          }
        });

        setParticipants(map);
        // +1 for local participant
        setParticipantCount(map.size + 1);
        console.log('[LiveKit] participants updated:', Array.from(map.keys()));
        // ✅ CRITICAL FIX: Force UI update when participants change to prevent screen going dark
        forceUpdate({});
      };

      // CONNECTION EVENTS
      newRoom.on(RoomEvent.Connected, () => {
        console.log('[LiveKit] ✅ Connected to room:', newRoom.name);
        // ✅ STABILITY FIX: Update all state synchronously to prevent race conditions
        setRoom(newRoom);
        setRoomName(newRoom.name || '');
        setLocalParticipant(newRoom.localParticipant);
        setIsConnected(true);
        setIsConnecting(false);
        setIsConnectingToRoom(false);
        connectingRef.current = false;
        rebuildParticipants();
        
        // ✅ STABILITY FIX: Verify connection is truly ready
        // Small delay to ensure all state updates are processed
        setTimeout(() => {
          if (newRoom.state === 'connected' && newRoom.localParticipant) {
            console.log('[LiveKit] ✅ Connection fully verified and ready');
          } else {
            console.warn('[LiveKit] ⚠️ Connection event fired but room not fully ready:', {
              roomState: newRoom.state,
              hasLocalParticipant: !!newRoom.localParticipant
            });
          }
        }, 100);
      });

      newRoom.on(RoomEvent.Disconnected, (reason) => {
        console.log('[LiveKit] 🔴 Disconnected from room:', reason);
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
        
        // Clean up screen share resources
        if (screenShareStreamRef.current) {
          screenShareStreamRef.current.getTracks().forEach(track => track.stop());
          screenShareStreamRef.current = null;
        }
        if (screenShareTrackRef.current) {
          screenShareTrackRef.current.stop();
          screenShareTrackRef.current = null;
        }
        setIsScreenSharing(false);
      });

      // PARTICIPANT EVENTS
      newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('[LiveKit] ➕ Participant connected:', participant.identity);
        if (participant instanceof RemoteParticipant) {
          rebuildParticipants();
        }
      });

      newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('[LiveKit] ➖ Participant disconnected:', participant.identity);
        if (participant instanceof RemoteParticipant) {
          rebuildParticipants();
          // ✅ CRITICAL FIX: Force UI update when participant leaves to prevent screen going dark
          forceUpdate({});
          // Additional delayed update to ensure VideoGrid re-renders
          setTimeout(() => forceUpdate({}), 100);
          setTimeout(() => forceUpdate({}), 300);
        }
      });


      // TRACK EVENTS – only used to force React re-renders
      newRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('[LiveKit] 🟢 Track subscribed:', publication.kind, 'from', participant.identity);
        forceUpdate({});
        
        // Handle AUDIO tracks - attach and play them with LOW LATENCY settings
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach() as HTMLAudioElement;
          el.autoplay = true;
          el.muted = false;
          el.volume = 1.0;
          el.preload = 'none';
          el.crossOrigin = 'anonymous';
          
          const playPromise = el.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('[LiveKit] Audio autoplay blocked:', err);
              document.addEventListener('click', () => {
                el.play().catch(e => console.warn('Audio play failed:', e));
              }, { once: true });
            });
          }
        }
      });

      newRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log('[LiveKit] ⚪ Track unsubscribed:', publication.kind, 'from', participant.identity);
        track.detach().forEach((el) => el.remove());
        forceUpdate({});
      });

      newRoom.on(RoomEvent.TrackMuted, (publication, participant) => {
        console.log('[LiveKit] 🔇 Track muted:', publication.kind, 'from', participant.identity);
        forceUpdate({});
      });

      newRoom.on(RoomEvent.TrackUnmuted, (publication, participant) => {
        console.log('[LiveKit] 🔊 Track unmuted:', publication.kind, 'from', participant.identity);
        forceUpdate({});
      });

      newRoom.on(RoomEvent.LocalTrackPublished, (publication) => {
        // ✅ CRITICAL FIX: Force immediate re-render when local track is published
        console.log('[LiveKit] 📹 Local track published:', publication.kind, publication.source, {
          trackSid: publication.trackSid,
          isMuted: publication.isMuted,
          hasTrack: !!publication.track
        });
        
        // ✅ CRITICAL: Update camera/mic state immediately
        if (publication.source === Track.Source.Camera) {
          setIsCameraEnabled(true);
          console.log('[LiveKit] ✅ Camera enabled state set to true');
        } else if (publication.source === Track.Source.Microphone) {
          setIsMicrophoneEnabled(true);
          console.log('[LiveKit] ✅ Microphone enabled state set to true');
        }
        
        // Force re-render multiple times to ensure UI updates
        forceUpdate({});
        setTimeout(() => forceUpdate({}), 100);
        setTimeout(() => forceUpdate({}), 300);
      });

      // ✅ CRITICAL: Listen for local participant track mute/unmute events
      // This ensures immediate updates when user mutes/unmutes via bottom bar
      newRoom.localParticipant.on(ParticipantEvent.TrackMuted, (publication) => {
        if (publication.source === Track.Source.Microphone) {
          console.log('[LiveKit] Local mic muted - updating state');
          setIsMicrophoneEnabled(false);
          forceUpdate({});
        }
      });

      newRoom.localParticipant.on(ParticipantEvent.TrackUnmuted, (publication) => {
        if (publication.source === Track.Source.Microphone) {
          console.log('[LiveKit] Local mic unmuted - updating state');
          setIsMicrophoneEnabled(true);
          forceUpdate({});
        }
      });

      newRoom.on(RoomEvent.ConnectionStateChanged, () => {
        // Connection state changed
      });

      // ✅ Listen for remote control data packets (for screen share control)
      newRoom.on(RoomEvent.DataReceived, (payload, participant) => {
        if (participant) {
          try {
            const event: RemoteControlEvent = JSON.parse(new TextDecoder().decode(payload));
            handleRemoteControlEvent(event, participant.identity);
          } catch (err) {
            // Not a remote control event, ignore
          }
        }
      });

      // REAL CONNECTION – let LiveKit auto-subscribe to all remote tracks
      console.log('[LiveKit] 🔄 Connecting with autoSubscribe: true');
      await newRoom.connect(LIVEKIT_CONFIG.serverUrl, token, {
        autoSubscribe: true,
      });

      // NOTE: after connect resolves, RoomEvent.Connected will fire and update state

    } catch (error: any) {
      console.error('[LiveKit] ❌ Failed to connect:', error);
      connectingRef.current = false;
      setIsConnecting(false);
      setIsConnectingToRoom(false);
      setError(error.message || 'Failed to connect to meeting room');

      if (roomRef.current) {
        try {
          roomRef.current.disconnect();
        } catch {}
        roomRef.current = null;
      }

      throw error;
    }
  }, [isConnecting, isConnected]);

  const disconnect = useCallback(() => {
    console.log('[LiveKit] 🔴 DISCONNECTING - Starting immediate cleanup...');
    
    // ✅ CRITICAL: Disconnect from room FIRST - this is the most important step
    if (roomRef.current) {
      try {
        console.log('[LiveKit] 🔴 Disconnecting from room immediately...');
        roomRef.current.disconnect();
        console.log('[LiveKit] ✅ Room disconnected');
      } catch (e) {
        console.error('[LiveKit] ❌ Error disconnecting room:', e);
      }
    }
    
    // ✅ Reset connecting ref IMMEDIATELY
    connectingRef.current = false;
    setIsConnected(false);
    setIsConnecting(false);
    setIsConnectingToRoom(false);
    
    // Clean up screen share resources
    if (screenShareStreamRef.current) {
      try {
        screenShareStreamRef.current.getTracks().forEach(track => track.stop());
        screenShareStreamRef.current = null;
      } catch (e) {
        console.warn('[LiveKit] Error stopping screen share stream:', e);
      }
    }
    if (screenShareTrackRef.current) {
      try {
        screenShareTrackRef.current.stop();
        screenShareTrackRef.current = null;
      } catch (e) {
        console.warn('[LiveKit] Error stopping screen share track:', e);
      }
    }
    setIsScreenSharing(false);
    
    // Clean up background engine
    if (backgroundEngine && typeof backgroundEngine.setNone === 'function') {
      try {
        backgroundEngine.setNone().catch(() => {
          // Ignore errors during cleanup
        });
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    
    // Stop all local tracks before disconnecting
    if (roomRef.current && roomRef.current.localParticipant) {
      try {
        const cameraTrack = roomRef.current.localParticipant.getTrack(Track.Source.Camera);
        const micTrack = roomRef.current.localParticipant.getTrack(Track.Source.Microphone);
        const screenTrack = roomRef.current.localParticipant.getTrack(Track.Source.ScreenShare);
        
        if (cameraTrack?.track) {
          (cameraTrack.track as LocalVideoTrack).stop();
        }
        if (micTrack?.track) {
          (micTrack.track as any).stop();
        }
        if (screenTrack?.track) {
          (screenTrack.track as LocalVideoTrack).stop();
        }
      } catch (e) {
        console.warn('[LiveKit] Error stopping tracks during disconnect:', e);
      }
    }

    // ✅ CRITICAL: Clear room reference and all state IMMEDIATELY
    roomRef.current = null;
    setRoom(null);
    setParticipants(new Map());
    setLocalParticipant(null);
    setParticipantCount(0);
    hasPublishedRef.current = false;
    
    console.log('[LiveKit] ✅ Disconnected and cleaned up completely');
  }, []);

  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    if (!roomRef.current) return;
    
    try {
      // Check if audio track exists
      const audioTrack = roomRef.current.localParticipant.getTrack(Track.Source.Microphone);
      
      if (enabled && !audioTrack) {
        // Need to create and publish audio track
        // Get audio device preference from userProfile (Firestore) - user-specific
        const audioDeviceId = userProfile?.preferences?.audioDeviceId;
        
        // ✅ Enhanced audio constraints for echo cancellation and low latency
        const aTrack = await createLocalAudioTrack({
          deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
          sampleSize: 16,
          latency: 0.01, // 10ms latency target
        });
        await roomRef.current.localParticipant.publishTrack(aTrack);
        console.log('[LiveKit] ✅ Audio track created with echo cancellation');
      } else if (audioTrack) {
        // CRITICAL: Enable/disable existing track - this broadcasts mute state to all participants
        await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
        setIsMicrophoneEnabled(enabled);
        // Force update to ensure all VideoTiles see the change immediately
        forceUpdate({});
        console.log('[LiveKit] ✅ Microphone', enabled ? 'unmuted' : 'muted', '- state broadcasted to all participants');
      } else {
        // Track doesn't exist and we're trying to disable - just update local state
        setIsMicrophoneEnabled(false);
        forceUpdate({});
      }
      
      // Also update state for enabled case (when creating new track)
      if (enabled && !audioTrack) {
        setIsMicrophoneEnabled(true);
        forceUpdate({});
      }
    } catch (error) {
      console.error('Failed to set microphone:', error);
      setError('Failed to toggle microphone');
      setIsMicrophoneEnabled(false);
    }
  }, []);

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    if (!roomRef.current) return;
    
    try {
      // Check if video track exists
      const videoTrack = roomRef.current.localParticipant.getTrack(Track.Source.Camera);
      
      if (enabled && !videoTrack) {
        // ✅ CRITICAL FIX: Explicitly start camera device FIRST using getUserMedia
        // This ensures the camera device is actually turned on before creating the track
        console.log('[LiveKit] 📹 setCameraEnabled: Starting camera device explicitly...');
        
        // Get video device preference from userProfile (Firestore) - user-specific
        const videoDeviceId = userProfile?.preferences?.videoDeviceId;
        
        // ✅ Video constraints optimized for device type
        const videoConstraints = getVideoConstraints();
        
        // ✅ CRITICAL: Request camera access and start the device explicitly
        let cameraStream: MediaStream | null = null;
        let vTrack: LocalVideoTrack;
        
        try {
          // Build constraints for getUserMedia
          const getUserMediaConstraints: MediaStreamConstraints = {
            video: videoDeviceId 
              ? { 
                  deviceId: { exact: videoDeviceId },
                  width: videoConstraints.width,
                  height: videoConstraints.height,
                  frameRate: videoConstraints.frameRate
                }
              : {
                  width: videoConstraints.width,
                  height: videoConstraints.height,
                  frameRate: videoConstraints.frameRate
                },
            audio: false // We handle audio separately
          };
          
          // ✅ CRITICAL: Explicitly start camera device via getUserMedia
          console.log('[LiveKit] 📹 setCameraEnabled: Requesting camera access via getUserMedia...');
          cameraStream = await navigator.mediaDevices.getUserMedia(getUserMediaConstraints);
          
          // ✅ CRITICAL: Verify camera is actually on
          const activeVideoTrack = cameraStream.getVideoTracks()[0];
          if (activeVideoTrack) {
            console.log('[LiveKit] ✅ setCameraEnabled: Camera device started successfully:', {
              readyState: activeVideoTrack.readyState,
              enabled: activeVideoTrack.enabled,
              label: activeVideoTrack.label
            });
            
            // ✅ CRITICAL: Ensure track is enabled (camera is on)
            if (!activeVideoTrack.enabled) {
              activeVideoTrack.enabled = true;
            }
            
            // ✅ CRITICAL: Wait for camera to be live
            if (activeVideoTrack.readyState !== 'live') {
              console.log('[LiveKit] ⚠️ setCameraEnabled: Waiting for camera to become live...');
              await new Promise<void>((resolve) => {
                const checkReady = () => {
                  if (activeVideoTrack.readyState === 'live') {
                    console.log('[LiveKit] ✅ setCameraEnabled: Camera is now live!');
                    resolve();
                  } else {
                    setTimeout(checkReady, 100);
                  }
                };
                setTimeout(() => resolve(), 2000); // Max 2 seconds
                checkReady();
              });
            }
            
            // ✅ CRITICAL FIX: Create LocalVideoTrack from existing MediaStreamTrack
            // This ensures the camera device stays active
            vTrack = new LocalVideoTrack(activeVideoTrack);
            console.log('[LiveKit] ✅ setCameraEnabled: LiveKit track created from active camera device');
          } else {
            throw new Error('No video track in camera stream');
          }
        } catch (getUserMediaError: any) {
          console.warn('[LiveKit] ⚠️ setCameraEnabled: getUserMedia failed, falling back to createLocalVideoTrack:', getUserMediaError);
          
          // Fallback to createLocalVideoTrack if getUserMedia fails
          vTrack = await createLocalVideoTrack({
            deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
            resolution: videoConstraints,
          });
        }
        
        // ✅ CRITICAL: Apply background IMMEDIATELY before publishing to prevent raw camera from showing
        // Read saved background directly from Firestore for latest value
        let latestSavedBackground = userProfile?.savedBackground || null;
        
        if (auth.currentUser) {
          try {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              latestSavedBackground = userData.savedBackground || null;
            }
          } catch (error) {
            // Fall back to userProfile
          }
        }
        
        const chosenBg = latestSavedBackground;
        
        // ✅ CRITICAL: Read backgroundEffectsEnabled from Firestore to ensure latest value
        let bgEnabled = userProfile?.preferences?.backgroundEffectsEnabled || false;
        if (auth.currentUser) {
          try {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              bgEnabled = userData.preferences?.backgroundEffectsEnabled || false;
            }
          } catch (error) {
            // Fall back to userProfile
          }
        }
        
        // ✅ CRITICAL: Apply background ONLY if BOTH conditions are met:
        // 1. Background effects are enabled (bgEnabled === true)
        // 2. User has explicitly selected a background (chosenBg is not null)
        if (bgEnabled && chosenBg && backgroundEngine) {
          try {
            await backgroundEngine.init(vTrack);
            
            // Apply based on type - IMMEDIATELY, synchronously
            // Note: 'none' means no background selected (null), so we only handle 'blur', 'image', 'video'
            if (chosenBg.type === 'blur') {
              if (typeof backgroundEngine.setBlur === 'function') {
                await backgroundEngine.setBlur();
              }
            } else if (chosenBg.type === 'image' && chosenBg.url) {
              if (typeof backgroundEngine.setImage === 'function') {
                await backgroundEngine.setImage(chosenBg.url);
              }
            } else if (chosenBg.type === 'video' && chosenBg.url) {
              if (typeof backgroundEngine.setVideo === 'function') {
                await backgroundEngine.setVideo(chosenBg.url);
              }
            }
            console.log('[LiveKit] ✅ Background applied IMMEDIATELY when enabling camera');
          } catch (bgError) {
            console.warn('[LiveKit] Background application failed when enabling camera:', bgError);
            // Continue - track will be published without background
          }
        } else {
          // ✅ CRITICAL: No background selected - do NOT apply any background
          // Ensure no processor is attached to the track
          try {
            // Clear any existing processor that might be attached
            if (vTrack && typeof vTrack.setProcessor === 'function') {
              const currentProcessor = (vTrack as any).processor;
              if (currentProcessor) {
                await vTrack.setProcessor(undefined as any);
                console.log('[LiveKit] Cleared any existing background processor when enabling camera - showing raw camera');
              }
            }
          } catch (clearError) {
            // Ignore errors when clearing processor
            console.log('[LiveKit] No background selected - showing raw camera feed');
          }
        }
        
        await roomRef.current.localParticipant.publishTrack(vTrack, {
          source: Track.Source.Camera,
          simulcast: true, // Enable simulcast for adaptive quality
        });
        
        // ✅ CRITICAL FIX: Set camera state to enabled IMMEDIATELY after publishing
        setIsCameraEnabled(true);
        forceUpdate({});
        setLocalParticipant(roomRef.current.localParticipant);
        console.log('[LiveKit] ✅ setCameraEnabled: Camera track published and state set to enabled');
      } else if (videoTrack) {
        // Just enable/disable existing track
        await roomRef.current.localParticipant.setCameraEnabled(enabled);
        
        // ✅ CRITICAL FIX: Update state immediately
        setIsCameraEnabled(enabled);
        forceUpdate({});
        setLocalParticipant(roomRef.current.localParticipant);
        
        // ✅ CRITICAL: If re-enabling camera, reapply background effect
        if (enabled) {
          const existingTrack = videoTrack.track as LocalVideoTrack | null;
          if (existingTrack) {
            // Read latest background from Firestore
            let latestSavedBackground = userProfile?.savedBackground || null;
            let bgEnabled = userProfile?.preferences?.backgroundEffectsEnabled || false;
            
            if (auth.currentUser) {
              try {
                const { doc, getDoc } = await import('firebase/firestore');
                const { db } = await import('../lib/firebase');
                const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  latestSavedBackground = userData.savedBackground || null;
                  bgEnabled = userData.preferences?.backgroundEffectsEnabled || false;
                }
              } catch (error) {
                // Fall back to userProfile
              }
            }
            
            const chosenBg = latestSavedBackground;
            const hasValidBackground = chosenBg && 
                                     chosenBg.type && 
                                     chosenBg.type !== 'none' && 
                                     chosenBg.type !== null &&
                                     (chosenBg.type === 'blur' || (chosenBg.type === 'image' && chosenBg.url) || (chosenBg.type === 'video' && chosenBg.url));
            const isMobileDeviceCheck = isMobileDevice();
            
            // Reapply background if enabled and valid - with improved retry logic
            if (bgEnabled && hasValidBackground && backgroundEngine && !isMobileDeviceCheck && chosenBg) {
              // ✅ CRITICAL: Improved retry logic with faster retries and track readiness checks
              let retryCount = 0;
              const maxRetries = 8; // Increased retries for better reliability
              const applyBg = async (): Promise<boolean> => {
                try {
              // ✅ CRITICAL: Check if track is ready before applying
              // Check track state via mediaStream
              const tracks = existingTrack.mediaStream?.getVideoTracks();
              if (!tracks || tracks.length === 0 || tracks[0].readyState !== 'live') {
                console.warn('[LiveKit] Track not ready for background, state:', tracks?.[0]?.readyState);
                return false;
              }
                  
                  await backgroundEngine.init(existingTrack);
                  // ✅ CRITICAL: Small delay to ensure initialization is complete
                  await new Promise(resolve => setTimeout(resolve, 50));
                  
                  if (chosenBg.type === 'blur') {
                    if (typeof backgroundEngine.setBlur === 'function') {
                      await backgroundEngine.setBlur();
                      console.log('[LiveKit] ✅ Background blur reapplied when camera re-enabled');
                      return true;
                    }
                  } else if (chosenBg.type === 'image' && chosenBg.url) {
                    if (typeof backgroundEngine.setImage === 'function') {
                      await backgroundEngine.setImage(chosenBg.url);
                      console.log('[LiveKit] ✅ Background image reapplied when camera re-enabled');
                      return true;
                    }
                  } else if (chosenBg.type === 'video' && chosenBg.url) {
                    if (typeof backgroundEngine.setVideo === 'function') {
                      await backgroundEngine.setVideo(chosenBg.url);
                      console.log('[LiveKit] ✅ Background video reapplied when camera re-enabled');
                      return true;
                    }
                  }
                  return false;
                } catch (bgError) {
                  console.warn(`[LiveKit] Background reapplication attempt ${retryCount + 1} failed:`, bgError);
                  return false;
                }
              };
              
              // Try immediately
              let success = await applyBg();
              
              // ✅ CRITICAL: Faster retries with shorter delays for immediate application
              while (!success && retryCount < maxRetries) {
                retryCount++;
                // Faster retries: 100ms, 200ms, 400ms, 800ms, 1s, 1.5s, 2s, 2.5s (max)
                const delay = Math.min(100 * Math.pow(2, retryCount - 1), 2500);
                await new Promise(resolve => setTimeout(resolve, delay));
                success = await applyBg();
              }
            } else if (!bgEnabled || !hasValidBackground) {
              // Clear background if disabled
              try {
                if (backgroundEngine && typeof backgroundEngine.setNone === 'function') {
                  await backgroundEngine.setNone();
                }
              } catch (clearError) {
                // Ignore errors
              }
            }
          }
        }
      }
      
      setIsCameraEnabled(enabled);
      
      // Force a re-render immediately - no delay
      forceUpdate({});
      setLocalParticipant(roomRef.current?.localParticipant || null);
    } catch (error) {
      console.error('Failed to set camera:', error);
      setError('Failed to toggle camera. Please check your browser permissions.');
      setIsCameraEnabled(false);
    }
  }, []);


  // Helper function to detect if screen sharing is supported
  // Computed once using useMemo since device type won't change during session
  const isScreenShareSupported = useMemo(() => {
    // Check if the browser API exists
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      return false;
    }

    // Check if it's a mobile device (phone or tablet)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Check screen size for tablets
    const isTablet = typeof window !== 'undefined' && 
                     window.matchMedia('(max-width: 1024px)').matches && 
                     !window.matchMedia('(max-width: 768px)').matches;
    
    // Check if it's specifically a tablet (iPad detection)
    const isiPad = /iPad/.test(navigator.userAgent) || 
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Screen sharing is not reliably supported on phones and tablets
    // Only enable on desktop/laptop devices
    if (isMobile || isTablet || isiPad) {
      return false;
    }

    // Desktop/laptop devices should support screen sharing
    return true;
  }, []);

  const setScreenShareEnabled = useCallback(async (enabled: boolean) => {
    if (!roomRef.current) return;

    try {
      if (enabled) {
        // Starting screen share
        // Check if screen sharing is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          throw new Error('Screen sharing is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
        }

        // Prepare constraints - optimized for mobile devices
        const isMobile = isMobileDevice();
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        console.log('[ScreenShare] Device detection - Mobile:', isMobile, 'iOS:', isIOS, 'Android:', isAndroid);

        // For mobile devices, use simpler constraints and try without audio first
        // Many mobile browsers don't support audio with screen sharing
        let constraints: MediaStreamConstraints;
        
        if (isMobile) {
          // Mobile-friendly constraints - minimal requirements
          constraints = {
            video: true, // Let browser choose the best settings
          };
        } else {
          // Desktop constraints
          constraints = {
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            } as MediaTrackConstraints,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            } as MediaTrackConstraints,
          };
        }

        // Request screen share with enhanced options
        console.log('[ScreenShare] Requesting display media with constraints:', constraints);
        let stream: MediaStream;
        
        try {
          stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        } catch (initialError: any) {
          // If it fails on mobile, try with even simpler constraints
          if (isMobile && initialError.name !== 'NotAllowedError' && initialError.name !== 'NotFoundError') {
            console.log('[ScreenShare] First attempt failed, trying with minimal constraints:', initialError);
            constraints = {
              video: true,
            };
            stream = await navigator.mediaDevices.getDisplayMedia(constraints);
          } else {
            throw initialError;
          }
        }
        
        // Store the stream for cleanup
        screenShareStreamRef.current = stream;

        // Handle when user stops sharing via browser UI
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          console.log('[ScreenShare] User stopped sharing via browser UI');
          setScreenShareEnabled(false).catch(err => {
            console.error('[ScreenShare] Error stopping screen share:', err);
          });
        });

                // Create video track from the stream
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          throw new Error('No video track found in screen share stream');
        }

        console.log('[ScreenShare] Video track obtained:', {
          id: videoTrack.id,
          label: videoTrack.label,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState,
          settings: videoTrack.getSettings(),
        });

        // Create LiveKit LocalVideoTrack from the MediaStreamTrack
        let localVideoTrack: LocalVideoTrack;
        try {
          localVideoTrack = new LocalVideoTrack(videoTrack);
          console.log('[ScreenShare] LocalVideoTrack created successfully');
        } catch (trackError: any) {
          console.error('[ScreenShare] Failed to create LocalVideoTrack:', trackError);
          throw new Error(`Failed to create video track: ${trackError.message || trackError}`);
        }

        // Store the track for cleanup
        screenShareTrackRef.current = localVideoTrack;

        // Publish the track to the room
        try {
          await roomRef.current.localParticipant.publishTrack(localVideoTrack, {
            source: Track.Source.ScreenShare,
          });
          console.log('[ScreenShare] Track published successfully to room');
        } catch (publishError: any) {
          console.error('[ScreenShare] Failed to publish track:', publishError);
          // Clean up the track if publishing fails
          localVideoTrack.stop();
          screenShareTrackRef.current = null;
          throw new Error(`Failed to publish screen share: ${publishError.message || publishError}`);
        }

        console.log('[ScreenShare] Screen share started successfully');
        setIsScreenSharing(true);

        // Show success message based on device type
        if (isMobile) {
          console.log('[ScreenShare] ✅ Mobile device - Screen sharing active. User can share entire screen or specific apps/tabs.');
        }
      } else {
        // Stopping screen share
        const existingTrack = roomRef.current.localParticipant.getTrack(Track.Source.ScreenShare);
        
        if (existingTrack) {
          // Unpublish the track
          await roomRef.current.localParticipant.unpublishTrack(existingTrack.track as LocalVideoTrack);
          console.log('[ScreenShare] Unpublished screen share track');
        }

        // Stop all tracks in the stream
        if (screenShareStreamRef.current) {
          screenShareStreamRef.current.getTracks().forEach(track => {
            track.stop();
          });
          screenShareStreamRef.current = null;
        }

        // Clean up the track reference
        if (screenShareTrackRef.current) {
          screenShareTrackRef.current.stop();
          screenShareTrackRef.current = null;
        }

                            setIsScreenSharing(false);
          console.log('[ScreenShare] Screen share stopped successfully');
        }
      } catch (error: any) {
        console.error('[ScreenShare] Failed to toggle screen share:', error);
        console.error('[ScreenShare] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
        
        // Clean up on error
        if (screenShareStreamRef.current) {
          screenShareStreamRef.current.getTracks().forEach(track => track.stop());
          screenShareStreamRef.current = null;
        }
        if (screenShareTrackRef.current) {
          screenShareTrackRef.current.stop();
          screenShareTrackRef.current = null;
        }
        setIsScreenSharing(false);

        // Provide user-friendly error messages
        const isMobile = isMobileDevice();
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        let errorMessage = 'Failed to toggle screen share';
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          if (isMobile) {
            errorMessage = 'Screen sharing permission was denied. Please allow screen sharing when prompted. On mobile, you may need to enable it in your browser settings.';
          } else {
            errorMessage = 'Screen sharing permission was denied. Please allow screen sharing in your browser settings.';
          }
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          if (isMobile) {
            errorMessage = 'No screen sharing source found. Please select "Screen" or a specific app/tab to share.';
          } else {
            errorMessage = 'No screen sharing source found. Please select a screen, window, or tab to share.';
          }
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage = 'Screen sharing failed. Another application may be using your screen.';
        } else if (error.name === 'NotSupportedError') {
          if (isIOS) {
            errorMessage = 'Screen sharing may not be fully supported on iOS Safari. Please try using Chrome or another supported browser.';
          } else if (isAndroid) {
            errorMessage = 'Screen sharing requires Android Chrome or a supported browser. Please ensure you are using a recent version.';
          } else {
            errorMessage = 'Screen sharing is not supported in this browser. Please use Chrome, Firefox, or Safari.';
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        setError(errorMessage);
        throw error;
      }
  }, [isMobileDevice]);

  // ✅ STABILITY FIX: Add timeout protection to prevent controls from getting stuck
  const toggleMicrophone = useCallback(async () => {
    try {
      // Add timeout to prevent hanging
      await Promise.race([
        setMicrophoneEnabled(!isMicrophoneEnabled),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Microphone toggle timeout')), 10000)
        )
      ]);
    } catch (error: any) {
      console.error('[LiveKit] Toggle microphone error:', error);
      // Don't let errors disable the control - always allow retry
      if (!error.message.includes('timeout')) {
        setError('Failed to toggle microphone. Please try again.');
      }
    }
  }, [isMicrophoneEnabled, setMicrophoneEnabled]);

  const toggleCamera = useCallback(async () => {
    try {
      // Add timeout to prevent hanging
      await Promise.race([
        setCameraEnabled(!isCameraEnabled),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Camera toggle timeout')), 10000)
        )
      ]);
    } catch (error: any) {
      console.error('[LiveKit] Toggle camera error:', error);
      // Don't let errors disable the control - always allow retry
      if (!error.message.includes('timeout')) {
        setError('Failed to toggle camera. Please try again.');
      }
    }
  }, [isCameraEnabled, setCameraEnabled]);

  // Switch between front and back camera (mobile/tablet only)
  const switchCamera = useCallback(async () => {
    if (!roomRef.current || !isCameraEnabled) return;
    
    const r = roomRef.current;
    const localPart = r.localParticipant;
    if (!localPart) return;

    // Check if mobile/tablet
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = typeof window !== 'undefined' &&
                     window.matchMedia('(max-width: 1024px)').matches &&
                     !window.matchMedia('(max-width: 768px)').matches;
    const isiPad = /iPad/.test(navigator.userAgent) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (!isMobile && !isTablet && !isiPad) {
      console.warn('[LiveKit] Camera switching only available on mobile/tablet');
      return;
    }

    try {
      // Get current video track
      const existingPub = localPart.getTrack(Track.Source.Camera) as LocalTrackPublication | undefined;
      const existingTrack = existingPub?.track as LocalVideoTrack | undefined;
      
      // Get savedBackground from userProfile (Firestore) - this is user-specific
      const chosenBg = userProfile?.savedBackground || null;
      
      // ✅ CRITICAL: Read backgroundEffectsEnabled from Firestore to ensure latest value
      let bgEnabled = userProfile?.preferences?.backgroundEffectsEnabled || false;
      if (auth.currentUser) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('../lib/firebase');
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            bgEnabled = userData.preferences?.backgroundEffectsEnabled || false;
          }
        } catch (error) {
          // Fall back to userProfile
        }
      }

      // Switch facing mode
      const newFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
      setCameraFacingMode(newFacingMode);

      // Unpublish existing track
      if (existingTrack && existingPub) {
        // Clean up background engine first
        try {
          if (backgroundEngine && typeof backgroundEngine.setNone === 'function') {
            await backgroundEngine.setNone();
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (e) {
          console.warn('[LiveKit] Error cleaning up background engine:', e);
        }
        
        await localPart.unpublishTrack(existingTrack);
        existingTrack.stop();
      }

      // Create new track with new facing mode - optimized for device type
      const videoConstraints = getVideoConstraints();
      const newTrack = await createLocalVideoTrack({
        facingMode: newFacingMode,
        resolution: videoConstraints,
      });

      // ✅ CRITICAL: Reapply background effects IMMEDIATELY - no delays
      // ONLY apply if BOTH conditions are met:
      // 1. Background effects are enabled (bgEnabled === true)
      // 2. User has explicitly selected a background (chosenBg is not null)
      if (bgEnabled && chosenBg && backgroundEngine) {
        try {
          await backgroundEngine.init(newTrack);
          
          // Apply immediately - no delays
          // Note: 'none' means no background selected (null), so we only handle 'blur', 'image', 'video'
          if (chosenBg.type === 'blur' && typeof backgroundEngine.setBlur === 'function') {
            await backgroundEngine.setBlur();
          } else if (chosenBg.type === 'image' && chosenBg.url && typeof backgroundEngine.setImage === 'function') {
            await backgroundEngine.setImage(chosenBg.url);
          } else if (chosenBg.type === 'video' && chosenBg.url && typeof backgroundEngine.setVideo === 'function') {
            await backgroundEngine.setVideo(chosenBg.url);
          }
          console.log('[LiveKit] ✅ Background reapplied IMMEDIATELY after camera switch');
        } catch (e) {
          console.warn('[LiveKit] Error reapplying background after camera switch:', e);
        }
      } else {
        // ✅ CRITICAL: No background selected - do NOT apply any background
        // Ensure no processor is attached to the track
        try {
          // Clear any existing processor that might be attached
          if (newTrack && typeof newTrack.setProcessor === 'function') {
            const currentProcessor = (newTrack as any).processor;
            if (currentProcessor) {
              await newTrack.setProcessor(undefined as any);
              console.log('[LiveKit] Cleared any existing background processor after camera switch - showing raw camera');
            }
          }
        } catch (clearError) {
          // Ignore errors when clearing processor
          console.log('[LiveKit] No background selected - showing raw camera feed after camera switch');
        }
      }

      // Publish new track with simulcast
      await localPart.publishTrack(newTrack, {
        source: Track.Source.Camera,
        simulcast: true, // Enable simulcast for adaptive quality
      });

      // Force update to refresh UI
      setTimeout(() => {
        forceUpdate({});
        setLocalParticipant(localPart);
      }, 100);

      console.log('[LiveKit] Camera switched to:', newFacingMode);
    } catch (error: any) {
      console.error('[LiveKit] Error switching camera:', error);
      toast.error('Failed to switch camera: ' + (error.message || 'Unknown error'));
    }
  }, [cameraFacingMode, isCameraEnabled]);

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

  // ✅ Handle incoming remote control events (when someone controls your shared screen)
  const handleRemoteControlEvent = useCallback((event: RemoteControlEvent, senderId: string) => {
    // Only handle if we're the one sharing the screen
    if (!isScreenSharing || !roomRef.current) return;
    
    console.log('[LiveKit] Remote control event received from', senderId, event.type);
    
    // Find the shared screen window and simulate the event
    // Note: This requires the shared window to be accessible
    // We'll use a custom event that the shared window can listen to
    window.dispatchEvent(new CustomEvent('remoteControlInput', {
      detail: { event, senderId }
    }));
  }, [isScreenSharing]);

  // ✅ Send remote control event to the person sharing their screen
  const sendRemoteControlEvent = useCallback(async (targetParticipantId: string, event: RemoteControlEvent) => {
    if (!roomRef.current || !roomRef.current.localParticipant) {
      console.warn('[LiveKit] Cannot send remote control event: not connected');
      return;
    }

    try {
      // Find the target participant
      const targetParticipant = Array.from(roomRef.current.participants.values())
        .find(p => p.identity === targetParticipantId);
      
      if (!targetParticipant) {
        console.warn('[LiveKit] Target participant not found:', targetParticipantId);
        return;
      }

      const payload = new TextEncoder().encode(JSON.stringify(event));
      await roomRef.current.localParticipant.publishData(payload, DataPacket_Kind.RELIABLE, [targetParticipant]);
      console.log('[LiveKit] Remote control event sent to', targetParticipantId, event.type);
    } catch (error: any) {
      console.error('[LiveKit] Failed to send remote control event:', error);
    }
  }, []);

  const publishFromSavedSettings = useCallback(async () => {
    // ✅ STABILITY FIX: Allow retry if previous attempt failed
    // Only skip if we successfully published AND room is still connected
    if (hasPublishedRef.current && roomRef.current && roomRef.current.state === 'connected') {
      const localPart = roomRef.current.localParticipant;
      const hasVideo = localPart?.getTrack(Track.Source.Camera);
      const hasAudio = localPart?.getTrack(Track.Source.Microphone);
      // If we have both tracks, we're good - skip
      if (hasVideo && hasAudio) {
        console.log('[LiveKit] Already published with both tracks, skipping');
        return;
      } else {
        // Missing tracks - allow retry
        console.log('[LiveKit] Missing tracks, allowing retry', { hasVideo: !!hasVideo, hasAudio: !!hasAudio });
        hasPublishedRef.current = false;
      }
    }
    
    const r = roomRef.current;
    if (!r) {
      console.warn('[LiveKit] No room reference, cannot publish');
      return;
    }
    
    // ✅ CRITICAL: Verify room is actually connected before attempting to publish
    if (r.state !== 'connected') {
      console.warn('[LiveKit] Room not connected, cannot publish tracks. State:', r.state);
      throw new Error(`Cannot publish tracks: room is not connected (state: ${r.state})`);
    }
    
    // ✅ CRITICAL: Verify localParticipant exists
    if (!r.localParticipant) {
      console.warn('[LiveKit] No localParticipant, cannot publish');
      throw new Error('Cannot publish tracks: localParticipant not available');
    }
    
    console.log('[LiveKit] ✅ Room verified as connected, proceeding with track publication');

    // ✅ CRITICAL: Read saved background directly from Firestore to ensure we get the latest value
    // userProfile might be stale when entering the room after saving in PreMeetingSetup
    let latestSavedBackground = userProfile?.savedBackground || null;
    let latestPreferences = userProfile?.preferences || {};
    
    // If we have a user, read directly from Firestore to get the most up-to-date values
    if (auth.currentUser) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          latestSavedBackground = userData.savedBackground || null;
          latestPreferences = userData.preferences || {};
          console.log('[LiveKit] ✅ Read latest background from Firestore:', {
            savedBackground: latestSavedBackground,
            backgroundEffectsEnabled: latestPreferences?.backgroundEffectsEnabled,
            preferences: latestPreferences
          });
        } else {
          console.warn('[LiveKit] User document not found in Firestore');
        }
      } catch (error) {
        console.warn('[LiveKit] Failed to read latest background from Firestore, using userProfile:', error);
        // Fall back to userProfile if Firestore read fails
      }
    } else {
      console.warn('[LiveKit] No current user, cannot read from Firestore');
    }

    // ✅ CRITICAL FIX: Default to true for video/audio when joining a meeting
    // Only disable if explicitly set to false in preferences
    // This ensures camera/mic are ON by default when joining
    // ✅ IMPORTANT: If videoEnabled is undefined/null, default to TRUE (camera ON)
    const videoOn = latestPreferences?.videoEnabled !== false; // undefined/null = true, false = false
    const audioOn = latestPreferences?.audioEnabled !== false; // undefined/null = true, false = false
    
    // ✅ CRITICAL FIX: If no preferences exist at all, default to enabled
    // This handles first-time users who haven't set preferences
    const hasPreferences = latestPreferences && Object.keys(latestPreferences).length > 0;
    const finalVideoOn = hasPreferences ? videoOn : true; // Default to true if no preferences
    const finalAudioOn = hasPreferences ? audioOn : true; // Default to true if no preferences
    
    console.log('[LiveKit] 📹 Track publishing preferences:', {
      hasPreferences,
      videoEnabled: latestPreferences?.videoEnabled,
      videoOn: finalVideoOn,
      audioEnabled: latestPreferences?.audioEnabled,
      audioOn: finalAudioOn,
      willPublishVideo: finalVideoOn,
      willPublishAudio: finalAudioOn
    });

    // VIDEO
    if (finalVideoOn) {
      try {
        let vTrack: LocalVideoTrack;
        
        // ✅ CRITICAL FIX: Explicitly start camera device FIRST using getUserMedia
        // This ensures the camera device is actually turned on before creating the track
        console.log('[LiveKit] 📹 Starting camera device explicitly...');
        
        // ✅ Video constraints optimized for device type
        const videoConstraints = getVideoConstraints();
        
        // ✅ CRITICAL: Request camera access and start the device explicitly
        const savedVideoDeviceId = latestPreferences?.videoDeviceId;
        let cameraStream: MediaStream | null = null;
        
        try {
          // Build constraints for getUserMedia
          const getUserMediaConstraints: MediaStreamConstraints = {
            video: savedVideoDeviceId 
              ? { 
                  deviceId: { exact: savedVideoDeviceId },
                  width: videoConstraints.width,
                  height: videoConstraints.height,
                  frameRate: videoConstraints.frameRate
                }
              : {
                  width: videoConstraints.width,
                  height: videoConstraints.height,
                  frameRate: videoConstraints.frameRate
                },
            audio: false // We handle audio separately
          };
          
          // ✅ CRITICAL: Explicitly start camera device via getUserMedia
          console.log('[LiveKit] 📹 Requesting camera access via getUserMedia...');
          cameraStream = await navigator.mediaDevices.getUserMedia(getUserMediaConstraints);
          
          // ✅ CRITICAL: Verify camera is actually on
          const videoTrack = cameraStream.getVideoTracks()[0];
          if (videoTrack) {
            console.log('[LiveKit] ✅ Camera device started successfully:', {
              readyState: videoTrack.readyState,
              enabled: videoTrack.enabled,
              label: videoTrack.label,
              deviceId: videoTrack.getSettings().deviceId
            });
            
            // ✅ CRITICAL: Ensure track is enabled (camera is on)
            if (!videoTrack.enabled) {
              console.log('[LiveKit] ⚠️ Camera track disabled, enabling...');
              videoTrack.enabled = true;
            }
            
            // ✅ CRITICAL FIX: Set camera state to enabled IMMEDIATELY after device starts
            // This ensures UI shows camera as on right away
            setIsCameraEnabled(true);
            forceUpdate({});
            console.log('[LiveKit] ✅ Camera state set to enabled immediately after device start');
            
            // ✅ CRITICAL: Wait for camera to be live
            if (videoTrack.readyState !== 'live') {
              console.log('[LiveKit] ⚠️ Waiting for camera to become live...');
              await new Promise<void>((resolve) => {
                const checkReady = () => {
                  if (videoTrack.readyState === 'live') {
                    console.log('[LiveKit] ✅ Camera is now live!');
                    // ✅ CRITICAL: Update state again when camera becomes live
                    setIsCameraEnabled(true);
                    forceUpdate({});
                    resolve();
                  } else {
                    setTimeout(checkReady, 100);
                  }
                };
                setTimeout(() => {
                  // Even if not live yet, ensure state is set
                  setIsCameraEnabled(true);
                  forceUpdate({});
                  resolve();
                }, 2000); // Max 2 seconds
                checkReady();
              });
            }
          }
          
          // ✅ CRITICAL: Create LiveKit track from the active camera stream
          console.log('[LiveKit] 📹 Creating LiveKit track from active camera stream...');
          const activeVideoTrack = cameraStream.getVideoTracks()[0];
          
          // ✅ CRITICAL: Ensure the track is enabled and live before creating LiveKit track
          if (!activeVideoTrack.enabled) {
            activeVideoTrack.enabled = true;
          }
          
          // ✅ CRITICAL FIX: Create LocalVideoTrack from existing MediaStreamTrack
          // This ensures the camera device stays active - we use the MediaStreamTrack directly
          vTrack = new LocalVideoTrack(activeVideoTrack);
          
          console.log('[LiveKit] ✅ LiveKit track created from active camera device');
          
          // ✅ CRITICAL: Keep the original stream active - don't stop it
          // The LiveKit track will use the same MediaStreamTrack, so the camera stays on
        } catch (getUserMediaError: any) {
          console.warn('[LiveKit] ⚠️ getUserMedia failed, falling back to createLocalVideoTrack:', getUserMediaError);
          
          // Fallback to createLocalVideoTrack if getUserMedia fails
          if (savedVideoDeviceId) {
            try {
              vTrack = await createLocalVideoTrack({
                deviceId: { exact: savedVideoDeviceId },
                resolution: videoConstraints,
              });
            } catch (exactError: any) {
              console.warn('[LiveKit] Failed with exact device, trying ideal:', exactError);
              vTrack = await createLocalVideoTrack({
                deviceId: { ideal: savedVideoDeviceId },
                resolution: videoConstraints,
              });
            }
          } else {
            vTrack = await createLocalVideoTrack({
              resolution: videoConstraints,
            });
          }
          
          // ✅ CRITICAL FIX: Set camera state immediately after track creation in fallback path
          if (vTrack && vTrack.mediaStreamTrack) {
            setIsCameraEnabled(true);
            forceUpdate({});
            console.log('[LiveKit] ✅ Camera state set to enabled after fallback track creation');
          }
        }
        
        // ✅ CRITICAL FIX: Ensure camera device is ACTUALLY STARTED
        // The track might be created but the camera device might not be active
        if (vTrack && vTrack.mediaStreamTrack) {
          // ✅ CRITICAL: Check if the camera device is actually running
          const streamTrack = vTrack.mediaStreamTrack;
          console.log('[LiveKit] 📹 Camera track created, checking device state:', {
            readyState: streamTrack.readyState,
            enabled: streamTrack.enabled,
            muted: streamTrack.muted,
            id: streamTrack.id,
            label: streamTrack.label
          });
          
          // ✅ CRITICAL: Ensure the track is enabled (this starts the camera device)
          if (!streamTrack.enabled) {
            console.log('[LiveKit] ⚠️ Camera track is disabled, enabling it to start the device...');
            streamTrack.enabled = true;
          }
          
          // ✅ CRITICAL: If track is not live, wait for it to become live
          if (streamTrack.readyState !== 'live') {
            console.log('[LiveKit] ⚠️ Camera track is not live yet, waiting for device to start...');
            await new Promise<void>((resolve) => {
              const checkReady = () => {
                if (streamTrack.readyState === 'live') {
                  console.log('[LiveKit] ✅ Camera device is now live!');
                  resolve();
                } else {
                  setTimeout(checkReady, 100);
                }
              };
              // Wait up to 3 seconds for camera to start
              setTimeout(() => {
                if (streamTrack.readyState !== 'live') {
                  console.warn('[LiveKit] ⚠️ Camera device did not become live within 3 seconds');
                }
                resolve();
              }, 3000);
              checkReady();
            });
          }
          
          // ✅ CRITICAL: Ensure track is not muted
          // Note: muted is read-only, we'll handle unmuting via setCameraEnabled after publishing
          if (streamTrack.muted) {
            console.log('[LiveKit] ⚠️ Camera track is muted, will unmute after publishing...');
          }
          
          console.log('[LiveKit] ✅ Camera device verified as active:', {
            readyState: streamTrack.readyState,
            enabled: streamTrack.enabled,
            muted: streamTrack.muted
          });
        }

        // ✅ CRITICAL: Apply background ONLY if user has explicitly selected one AND enabled background effects
        // If chosenBg is null OR backgroundEffectsEnabled is false, do NOT apply any background - show raw camera
        const bgEnabled = latestPreferences?.backgroundEffectsEnabled || false;
        const chosenBg = latestSavedBackground;
        const isMobileDeviceCheck = isMobileDevice();

        // ✅ CRITICAL FIX: Check if background is valid (not null, not 'none', has valid type)
        const hasValidBackground = chosenBg && 
                                   chosenBg.type && 
                                   chosenBg.type !== 'none' && 
                                   chosenBg.type !== null &&
                                   (chosenBg.type === 'blur' || (chosenBg.type === 'image' && chosenBg.url) || (chosenBg.type === 'video' && chosenBg.url));
        
        console.log('[LiveKit] 🔍 Background check:', {
          bgEnabled,
          hasChosenBg: !!chosenBg,
          chosenBgType: chosenBg?.type,
          chosenBgUrl: chosenBg?.url,
          hasBackgroundEngine: !!backgroundEngine,
          isMobile: isMobileDeviceCheck,
          hasValidBackground,
          willApply: bgEnabled && hasValidBackground && !isMobileDeviceCheck,
        });

        // ✅ MOBILE OPTIMIZATION: Skip background processing on mobile devices for better performance
        // Background processing is CPU/GPU intensive and can cause delays and camera/mic issues on mobile
        // ✅ CRITICAL FIX: Apply background ONLY if ALL conditions are met:
        // 1. Background effects are enabled (bgEnabled === true)
        // 2. User has explicitly selected a background (chosenBg is not null AND type is not 'none')
        // 3. NOT a mobile device (for performance)
        if (bgEnabled && hasValidBackground && backgroundEngine && !isMobileDeviceCheck) {
          try {
            // Initialize background engine immediately - don't wait for track state
            await backgroundEngine.init(vTrack);
            
            // Apply background immediately based on type
            if (chosenBg.type === 'blur') {
              if (typeof backgroundEngine.setBlur === 'function') {
                await backgroundEngine.setBlur();
                console.log('[LiveKit] ✅ Background blur applied BEFORE publishing');
              }
            } else if (chosenBg.type === 'image' && chosenBg.url) {
              if (typeof backgroundEngine.setImage === 'function') {
                try {
                  await backgroundEngine.setImage(chosenBg.url);
                  console.log('[LiveKit] ✅ Background image applied BEFORE publishing:', chosenBg.url);
                } catch (imgError: any) {
                  console.warn('[LiveKit] Background image failed before publishing, will retry after:', imgError);
                }
              }
            } else if (chosenBg.type === 'video' && chosenBg.url) {
              if (typeof backgroundEngine.setVideo === 'function') {
                await backgroundEngine.setVideo(chosenBg.url);
                console.log('[LiveKit] ✅ Background video applied BEFORE publishing');
              }
            }
          } catch (bgError) {
            console.warn('[LiveKit] Background application before publishing failed:', bgError);
            // Continue - we'll retry after publishing
          }
        } else {
          // ✅ CRITICAL: No background selected - do NOT apply any background
          if (!bgEnabled) {
            console.log('[LiveKit] Background effects disabled - showing raw camera feed');
          } else if (!hasValidBackground) {
            console.log('[LiveKit] No valid background selected - showing raw camera feed');
          } else if (isMobileDeviceCheck) {
            console.log('[LiveKit] Mobile device - skipping background for performance');
          }
        }
        
        // ✅ CRITICAL: Double-check room is still connected before publishing
        if (r.state !== 'connected' || !r.localParticipant) {
          console.error('[LiveKit] Room disconnected before publishing video track, stopping track');
          vTrack.stop();
          throw new Error('Room disconnected before publishing video track');
        }
        
        // ✅ CRITICAL FIX: Final verification that camera device is active before publishing
        if (vTrack && vTrack.mediaStreamTrack) {
          const streamTrack = vTrack.mediaStreamTrack;
          if (streamTrack.readyState !== 'live' || !streamTrack.enabled) {
            console.warn('[LiveKit] ⚠️ Camera device not fully active before publishing, ensuring it is...');
            streamTrack.enabled = true;
            // Wait a moment for device to activate
            await new Promise(resolve => setTimeout(resolve, 200));
            console.log('[LiveKit] ✅ Camera device state after activation:', {
              readyState: streamTrack.readyState,
              enabled: streamTrack.enabled,
              muted: streamTrack.muted
            });
          }
        }
        
        // ✅ CRITICAL: Publish track with background already applied (if successful)
        // This ensures users never see their raw camera feed
        // ✅ MOBILE OPTIMIZATION: Add timeout and disable simulcast for mobile devices
        const isMobileForPublish = isMobileDevice();
        const networkQuality = getNetworkQuality();
        const shouldUseSimulcast = !isMobileForPublish && networkQuality !== 'poor';
        
        const publishPromise = r.localParticipant.publishTrack(vTrack, {
          source: Track.Source.Camera,
          simulcast: shouldUseSimulcast, // Disable simulcast on mobile/poor networks for better performance
        });
        
        try {
          // Add timeout for mobile devices (10 seconds) to prevent indefinite hanging
          if (isMobileForPublish) {
            await Promise.race([
              publishPromise,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Publish timeout on mobile device')), 10000)
              )
            ]);
          } else {
            await publishPromise;
          }
          
          // ✅ CRITICAL FIX: Ensure track is UNMUTED after publishing
          // Tracks might be muted by default, so we explicitly unmute them
          try {
            const publishedTrack = r.localParticipant.getTrack(Track.Source.Camera);
            if (publishedTrack && publishedTrack.track) {
              // Unmute the track to ensure video is visible
              await r.localParticipant.setCameraEnabled(true);
              console.log('[LiveKit] ✅ Camera track explicitly unmuted after publishing');
            }
          } catch (unmuteError) {
            console.warn('[LiveKit] Failed to unmute camera track:', unmuteError);
          }
          
          // ✅ CRITICAL FIX: Set camera state to enabled IMMEDIATELY after publishing
          // This ensures UI shows camera as on right away
          setIsCameraEnabled(true);
          forceUpdate({});
          setLocalParticipant(r.localParticipant);
          
          console.log('[LiveKit] ✅ Video track published successfully, camera state set to enabled');
          
          // ✅ CRITICAL FIX: Ensure track is UNMUTED after publishing
          // Tracks might be muted by default, so we explicitly unmute them
          try {
            const publishedTrack = r.localParticipant.getTrack(Track.Source.Camera);
            if (publishedTrack && publishedTrack.track) {
              // ✅ CRITICAL: Check if track is muted and unmute if needed
              const isMuted = publishedTrack.isMuted || (publishedTrack.track as any).isMuted;
              if (isMuted) {
                console.log('[LiveKit] ⚠️ Track is muted after publishing, unmuting...');
                await r.localParticipant.setCameraEnabled(true);
                console.log('[LiveKit] ✅ Camera track explicitly unmuted after publishing');
              } else {
                console.log('[LiveKit] ✅ Camera track is already unmuted');
              }
              
              // ✅ CRITICAL: Update state again after unmuting
              setIsCameraEnabled(true);
              forceUpdate({});
            }
          } catch (unmuteError) {
            console.warn('[LiveKit] Failed to unmute camera track:', unmuteError);
            // Still ensure state is set even if unmute fails
            setIsCameraEnabled(true);
            forceUpdate({});
          }
          
          // ✅ CRITICAL FIX: Verify track is actually published and visible to others
          // This fixes the bug where track exists locally but isn't visible to other participants
          // Check if the track is actually published in the room
          const camPub = r.localParticipant.getTrack(Track.Source.Camera);
          if (!camPub || !camPub.track) {
            console.warn('[LiveKit] ⚠️ Camera track not properly published, force-publishing...');
            try {
              // Force-publish the track to ensure it's visible to all participants
              await r.localParticipant.publishTrack(vTrack, {
                source: Track.Source.Camera,
                simulcast: shouldUseSimulcast,
              });
              console.log('[LiveKit] ✅ Camera track force-published successfully');
            } catch (forcePublishError: any) {
              console.error('[LiveKit] ❌ Failed to force-publish camera track:', forcePublishError);
              // Don't throw - track might still work, just log the error
            }
          } else {
            console.log('[LiveKit] ✅ Camera track verified as published');
          }
          
          // ✅ CRITICAL FIX: Additional verification after a short delay
          // Sometimes the track is published but not immediately visible to others
          // This ensures the track is actually visible to all participants
          setTimeout(async () => {
            if (!r || r.state !== 'connected' || !r.localParticipant) {
              return; // Room disconnected, skip verification
            }
            
            const verifiedPub = r.localParticipant.getTrack(Track.Source.Camera);
            if (!verifiedPub || !verifiedPub.track) {
              console.warn('[LiveKit] ⚠️ Camera track still not visible after delay, force-publishing again...');
              try {
                // Use the track we just created (vTrack) since verifiedPub doesn't exist
                if (vTrack && vTrack.mediaStreamTrack && vTrack.mediaStreamTrack.readyState === 'live') {
                  await r.localParticipant.publishTrack(vTrack, {
                    source: Track.Source.Camera,
                    simulcast: shouldUseSimulcast,
                  });
                  console.log('[LiveKit] ✅ Camera track force-published after delay - now visible to all participants');
                  // ✅ CRITICAL: Ensure camera state is set to enabled
                  setIsCameraEnabled(true);
                  forceUpdate({});
                  setLocalParticipant(r.localParticipant);
                } else {
                  console.warn('[LiveKit] ⚠️ Cannot force-publish: video track not available or not live');
                }
              } catch (delayedPublishError: any) {
                console.error('[LiveKit] ❌ Failed to force-publish camera track after delay:', delayedPublishError);
              }
            } else {
              console.log('[LiveKit] ✅ Camera track verified as visible to all participants after delay');
              // ✅ CRITICAL: Ensure camera state is enabled even if track was already there
              setIsCameraEnabled(true);
              forceUpdate({});
            }
          }, 500); // Reduced delay to 500ms for faster UI update
        } catch (publishError: any) {
          // If publishing fails, stop the track to free resources
          console.error('[LiveKit] ❌ Failed to publish video track:', publishError);
          vTrack.stop();
          throw publishError; // Re-throw so caller knows it failed
        }
        
        // Background should already be applied before publishing
        // If it wasn't applied, it means it failed - don't retry here to avoid delays
        
        // ✅ CRITICAL FIX: Force multiple re-renders to ensure VideoTile picks up the track
        // Sometimes React needs multiple updates to detect the new track
        forceUpdate({});
        setLocalParticipant(r.localParticipant);
        
        // ✅ CRITICAL FIX: Additional state update after a brief delay to ensure UI syncs
        setTimeout(() => {
          if (r && r.state === 'connected' && r.localParticipant) {
            const camTrack = r.localParticipant.getTrack(Track.Source.Camera);
            if (camTrack && camTrack.track) {
              setIsCameraEnabled(true);
              forceUpdate({});
              setLocalParticipant(r.localParticipant);
              console.log('[LiveKit] ✅ Camera state synchronized after track publication');
            }
          }
        }, 200);
      } catch (error: any) {
        console.error('[LiveKit] Failed to create/publish video track:', error);
        
        // ✅ CRITICAL: Reset hasPublishedRef on error to allow retry
        hasPublishedRef.current = false;
        
        // ✅ CRITICAL: Only disable camera if it's a REAL error (permission denied, device unavailable)
        // DO NOT disable for connection issues - keep camera enabled and retry
        const errorMsg = error?.message || String(error);
        const isConnectionIssue = errorMsg.includes('not connected') || 
                                  errorMsg.includes('Cannot publish') ||
                                  errorMsg.includes('closed') ||
                                  errorMsg.includes('timeout') ||
                                  errorMsg.includes('timed out');
        
        if (!isConnectionIssue) {
          // Real error (permission denied, device unavailable) - disable camera
          setIsCameraEnabled(false);
          setError(`Camera access denied or unavailable: ${error.message}. Please check your browser permissions and click the camera button.`);
        } else {
          // Connection issue - KEEP camera enabled, will retry
          console.warn('[LiveKit] Video track publishing failed due to connection issue, will retry. Camera remains enabled.');
          throw error; // Re-throw to prevent hasPublishedRef from being set
        }
      }
    }

    // AUDIO - ✅ Optimized for LOW LATENCY and ECHO CANCELLATION
    if (finalAudioOn) {
      try {
        // Get audio device preference from userProfile (Firestore) - user-specific
        const audioDeviceId = userProfile?.preferences?.audioDeviceId;
        // ✅ CRITICAL: Double-check room is still connected before publishing audio
        if (r.state !== 'connected' || !r.localParticipant) {
          console.error('[LiveKit] Room disconnected before publishing audio track, stopping track');
          throw new Error('Room disconnected before publishing audio track');
        }
        
        const isMobileForAudio = isMobileDevice();
        
        const aTrack = await createLocalAudioTrack({
          deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
          // ✅ MOBILE OPTIMIZATION: Simplified audio constraints for mobile devices
          echoCancellation: true,
          noiseSuppression: !isMobileForAudio, // Disable on mobile for better performance
          autoGainControl: !isMobileForAudio, // Disable on mobile for better performance
          sampleRate: isMobileForAudio ? 16000 : 48000, // Lower sample rate on mobile
          channelCount: 1, // Mono for better echo cancellation
          sampleSize: 16,
          // ✅ Optimize for real-time communication (low latency)
          latency: isMobileForAudio ? 0.05 : 0.01, // Higher latency tolerance on mobile
        });
        
        try {
          const publishPromise = r.localParticipant.publishTrack(aTrack);
          
          // ✅ MOBILE OPTIMIZATION: Add timeout for mobile devices
          if (isMobileForAudio) {
            await Promise.race([
              publishPromise,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Audio publish timeout on mobile device')), 10000)
              )
            ]);
          } else {
            await publishPromise;
          }
          
          setIsMicrophoneEnabled(true);
          console.log('[LiveKit] ✅ Audio track published successfully');
        } catch (publishError: any) {
          // If publishing fails, stop the track to free resources
          console.error('[LiveKit] ❌ Failed to publish audio track:', publishError);
          aTrack.stop();
          throw publishError; // Re-throw so caller knows it failed
        }
      } catch (error: any) {
        console.error('[LiveKit] Failed to create/publish audio track:', error);
        
        // ✅ CRITICAL: Reset hasPublishedRef on error to allow retry
        hasPublishedRef.current = false;
        
        // ✅ CRITICAL: Only disable mic if it's a REAL error (permission denied, device unavailable)
        // DO NOT disable for connection issues - keep mic enabled and retry
        const errorMsg = error?.message || String(error);
        const isConnectionIssue = errorMsg.includes('not connected') || 
                                  errorMsg.includes('Cannot publish') ||
                                  errorMsg.includes('closed') ||
                                  errorMsg.includes('timeout') ||
                                  errorMsg.includes('timed out');
        
        if (!isConnectionIssue) {
          // Real error (permission denied, device unavailable) - disable mic
          setIsMicrophoneEnabled(false);
          console.warn('[LiveKit] Audio track failed:', errorMsg);
        } else {
          // Connection issue - KEEP mic enabled, will retry
          console.warn('[LiveKit] Audio track publishing failed due to connection issue, will retry. Microphone remains enabled.');
          throw error; // Re-throw to prevent hasPublishedRef from being set
        }
      }
    }
    
    // ✅ CRITICAL: Only set hasPublishedRef to true if we successfully published at least one track
    // This allows retries if publishing failed due to connection issues
    const videoPublished = finalVideoOn && r.localParticipant?.getTrack(Track.Source.Camera);
    const audioPublished = finalAudioOn && r.localParticipant?.getTrack(Track.Source.Microphone);
    
    if (videoPublished || audioPublished) {
      hasPublishedRef.current = true;
      console.log('[LiveKit] ✅ Tracks published successfully, hasPublishedRef set to true');
    } else {
      console.warn('[LiveKit] ⚠️ No tracks published, hasPublishedRef remains false (will allow retry)');
    }
  }, []);

  // ✅ CRITICAL: Re-apply background when savedBackground changes (e.g., user changes it in PreMeetingSetup or room)
  // This ensures background is applied even if userProfile loads after room connection
  useEffect(() => {
    if (!room || !isConnected || !localParticipant) {
      console.log('[LiveKit] Background re-application skipped: room not ready', {
        hasRoom: !!room,
        isConnected,
        hasLocalParticipant: !!localParticipant
      });
      return;
    }
    
    const vTrack = localParticipant.getTrack(Track.Source.Camera)?.track as LocalVideoTrack | null;
    if (!vTrack) {
      console.log('[LiveKit] No video track available for background application');
      return;
    }

    // ✅ CRITICAL: Read directly from Firestore to get latest background (userProfile might be stale)
    const applyBackgroundFromFirestore = async () => {
      try {
        let chosenBg = userProfile?.savedBackground || null;
        let bgEnabled = userProfile?.preferences?.backgroundEffectsEnabled || false;
        
        // ✅ CRITICAL: Always read directly from Firestore to ensure we have the latest values
        // This is especially important when user selects background during meeting
        if (auth.currentUser) {
          try {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              chosenBg = userData.savedBackground || null;
              bgEnabled = userData.preferences?.backgroundEffectsEnabled || false;
              console.log('[LiveKit] ✅ Read latest background from Firestore for re-application:', {
                savedBackground: chosenBg,
                backgroundEffectsEnabled: bgEnabled,
                type: chosenBg?.type,
                url: chosenBg?.url
              });
            } else {
              console.warn('[LiveKit] User document not found in Firestore');
            }
          } catch (firestoreError) {
            console.warn('[LiveKit] Failed to read from Firestore, using userProfile:', firestoreError);
            // Fall back to userProfile
          }
        }
        
        const isMobileDeviceCheck = isMobileDevice();
        
        const hasValidBackground = chosenBg && 
                                   chosenBg.type && 
                                   chosenBg.type !== 'none' && 
                                   chosenBg.type !== null &&
                                   (chosenBg.type === 'blur' || (chosenBg.type === 'image' && chosenBg.url) || (chosenBg.type === 'video' && chosenBg.url));

        console.log('[LiveKit] Background application check:', {
          bgEnabled,
          hasValidBackground,
          hasBackgroundEngine: !!backgroundEngine,
          isMobile: isMobileDeviceCheck,
          chosenBgType: chosenBg?.type,
          chosenBgUrl: chosenBg?.url
        });

        if (bgEnabled && hasValidBackground && backgroundEngine && !isMobileDeviceCheck && chosenBg) {
          // ✅ CRITICAL: Improved retry logic with faster retries and better track readiness checks
          let retryCount = 0;
          const maxRetries = 8; // Increased retries for better reliability
          const applyBackground = async (): Promise<boolean> => {
            try {
              // ✅ CRITICAL: Check if track is ready before applying
              // Check track state via mediaStream
              const tracks = vTrack.mediaStream?.getVideoTracks();
              if (!tracks || tracks.length === 0 || tracks[0].readyState !== 'live') {
                console.warn('[LiveKit] Track not ready, state:', tracks?.[0]?.readyState);
                return false;
              }
              
              // Re-initialize background engine to ensure it's ready
              console.log('[LiveKit] Initializing background engine for track:', vTrack.id, 'readyState:', tracks[0].readyState);
              await backgroundEngine.init(vTrack);
              
              // ✅ CRITICAL: Small delay to ensure initialization is complete
              await new Promise(resolve => setTimeout(resolve, 50));
              
              if (chosenBg.type === 'blur') {
                if (typeof backgroundEngine.setBlur === 'function') {
                  await backgroundEngine.setBlur();
                  console.log('[LiveKit] ✅ Background blur re-applied after change');
                  return true;
                }
              } else if (chosenBg.type === 'image' && chosenBg.url) {
                if (typeof backgroundEngine.setImage === 'function') {
                  console.log('[LiveKit] Applying background image:', chosenBg.url);
                  await backgroundEngine.setImage(chosenBg.url);
                  console.log('[LiveKit] ✅ Background image re-applied after change:', chosenBg.url);
                  return true;
                }
              } else if (chosenBg.type === 'video' && chosenBg.url) {
                if (typeof backgroundEngine.setVideo === 'function') {
                  console.log('[LiveKit] Applying background video:', chosenBg.url);
                  await backgroundEngine.setVideo(chosenBg.url);
                  console.log('[LiveKit] ✅ Background video re-applied after change');
                  return true;
                }
              }
              console.warn('[LiveKit] Background type not supported or function not available:', chosenBg.type);
              return false;
            } catch (bgError) {
              console.warn(`[LiveKit] Background re-application attempt ${retryCount + 1} failed:`, bgError);
              return false;
            }
          };
          
          // Try immediately first
          let success = await applyBackground();
          
          // ✅ CRITICAL: Faster retries with shorter delays for immediate application
          while (!success && retryCount < maxRetries) {
            retryCount++;
            // Faster retries: 100ms, 200ms, 400ms, 800ms, 1s, 1.5s, 2s, 2.5s (max)
            const delay = Math.min(100 * Math.pow(2, retryCount - 1), 2500);
            console.log(`[LiveKit] Retrying background application in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            success = await applyBackground();
          }
          
          if (!success) {
            console.error('[LiveKit] ❌ Background application failed after all retries');
            toast.error('Failed to apply background effect. Please try again.');
          } else {
            console.log('[LiveKit] ✅ Background successfully applied after change');
          }
        } else if (!bgEnabled || !hasValidBackground) {
          // Remove background if disabled or invalid
          console.log('[LiveKit] Removing background - disabled or invalid:', {
            bgEnabled,
            hasValidBackground,
            chosenBgType: chosenBg?.type
          });
          if (backgroundEngine && typeof backgroundEngine.setNone === 'function') {
            await backgroundEngine.setNone();
            console.log('[LiveKit] ✅ Background removed');
          }
        }
      } catch (error) {
        console.error('[LiveKit] Error in background re-application effect:', error);
        toast.error('Error applying background effect. Please try again.');
      }
    };
    
    // ✅ CRITICAL: Apply immediately - no delays to prevent 5+ minute delays
    // Apply synchronously to ensure background appears immediately
    // Use a small timeout to ensure the track is fully ready
    const timeoutId = setTimeout(() => {
      applyBackgroundFromFirestore();
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [room, isConnected, localParticipant, userProfile?.savedBackground, userProfile?.preferences?.backgroundEffectsEnabled]);

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
    switchCamera,
    setMicrophoneEnabled,
    setCameraEnabled,
    setScreenShareEnabled,
    
    // Status
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenSharing,
    isConnectingToRoom,
    isScreenShareSupported: isScreenShareSupported,
    
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
    
    // Remote control
    sendRemoteControlEvent,
  };

  return <LiveKitContext.Provider value={value}>{children}</LiveKitContext.Provider>;
};
