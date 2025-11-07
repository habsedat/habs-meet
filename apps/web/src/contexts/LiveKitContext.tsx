import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { Room, RoomEvent, Track, RemoteParticipant, LocalParticipant, LocalTrackPublication, LocalVideoTrack, createLocalVideoTrack, createLocalAudioTrack, ParticipantEvent, TrackPublication, RemoteTrackPublication, DataPacket_Kind } from 'livekit-client';

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
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnectingToRoom, setIsConnectingToRoom] = useState(false);
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
      
      // ✅ Clear participants map to prevent duplicates from previous connections
      setParticipants(new Map());
      setLocalParticipant(null);
    
    try {
      const newRoom = new Room(LIVEKIT_CONFIG.roomConfig);
      roomRef.current = newRoom;

      // Set up comprehensive event listeners
      // SIMPLIFIED, DIRECT subscription helper - uses the most reliable method
      const subscribeToParticipantTracks = async (participant: RemoteParticipant) => {
        const participantId = participant.identity || participant.sid;
        console.log('[LiveKit] 📹 Subscribing to ALL tracks from:', participantId, 'Name:', participant.name);
        
        try {
          // Direct method: Get trackPublications map and subscribe to everything
          const trackPublications = (participant as any).trackPublications as Map<string, RemoteTrackPublication> | undefined;
          
          if (trackPublications && trackPublications.size > 0) {
            console.log('[LiveKit] Found', trackPublications.size, 'publications for', participantId);
            
            for (const [, pub] of trackPublications.entries()) {
              if (!pub) continue;
              
              // ✅ Subscribe to video, audio, AND screen share tracks
              if (pub.kind !== Track.Kind.Video && pub.kind !== Track.Kind.Audio) continue;
              // Note: ScreenShare tracks are also Track.Kind.Video with source ScreenShare
              
              // Skip if already subscribed
              if (pub.isSubscribed) {
                console.log('[LiveKit] Already subscribed to', pub.kind, 'from', participantId);
                continue;
              }
              
              // Subscribe!
              try {
                await pub.setSubscribed(true);
                console.log('[LiveKit] ✅✅✅ SUCCESSFULLY SUBSCRIBED to', pub.kind, 'track from', participantId);
              } catch (err: any) {
                console.error('[LiveKit] ❌❌❌ FAILED to subscribe to', pub.kind, 'from', participantId, ':', err?.message || err);
              }
            }
          } else {
            // Fallback: Try Camera and Microphone sources directly
            console.log('[LiveKit] No trackPublications map, trying direct sources for', participantId);
            
            const videoPub = participant.getTrackPublication(Track.Source.Camera) as RemoteTrackPublication | null;
            if (videoPub && !videoPub.isSubscribed) {
              try {
                await videoPub.setSubscribed(true);
                console.log('[LiveKit] ✅✅✅ SUBSCRIBED to video (fallback) from', participantId);
              } catch (err: any) {
                console.error('[LiveKit] ❌ Failed video subscription (fallback):', err);
              }
            }
            
            const audioPub = participant.getTrackPublication(Track.Source.Microphone) as RemoteTrackPublication | null;
            if (audioPub && !audioPub.isSubscribed) {
              try {
                await audioPub.setSubscribed(true);
                console.log('[LiveKit] ✅✅✅ SUBSCRIBED to audio (fallback) from', participantId);
              } catch (err: any) {
                console.error('[LiveKit] ❌ Failed audio subscription (fallback):', err);
              }
            }
          }
        } catch (err: any) {
          console.error('[LiveKit] ❌❌❌ CRITICAL ERROR subscribing to', participantId, ':', err?.message || err);
        }
      };

      // Helper function to set up track published listener for a participant (backup)
      const setupTrackPublishedListener = (participant: RemoteParticipant) => {
        const handleTrackPublished = async (publication: TrackPublication) => {
          console.log('[LiveKit] Participant-level track published:', publication.kind, 'from', participant.identity);
          if ((publication.kind === Track.Kind.Video || publication.kind === Track.Kind.Audio)) {
            const remotePub = publication as RemoteTrackPublication;
            if (!remotePub.isSubscribed) {
              try {
                await remotePub.setSubscribed(true);
                console.log('[LiveKit] ✅ Participant-level auto-subscribed to', publication.kind, 'from', participant.identity);
              } catch (err) {
                console.warn('[LiveKit] Participant-level subscription failed:', err);
                // Retry
                setTimeout(async () => {
                  try {
                    await remotePub.setSubscribed(true);
                  } catch (e) {
                    console.error('[LiveKit] Retry failed:', e);
                  }
                }, 300);
              }
            }
          }
        };
        
        participant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
        return handleTrackPublished;
      };

      newRoom.on(RoomEvent.Connected, () => {
        console.log('✅✅✅ CONNECTED to room:', newRoom.name);
        console.log('✅ Existing participants in room:', newRoom.participants.size);
        newRoom.participants.forEach((p) => {
          const trackCount = (p as any).trackPublications?.size || 0;
          console.log('  - Participant:', p.identity, 'Name:', p.name, 'Tracks:', trackCount);
          
          // Log all track publications
          if (trackCount > 0) {
            (p as any).trackPublications.forEach((pub: any, key: string) => {
              console.log('    Track:', key, 'Kind:', pub.kind, 'Subscribed:', pub.isSubscribed);
            });
          }
        });
        
          setIsConnected(true);
          setIsConnecting(false);
          setIsConnectingToRoom(false);
          setRoomName(newRoom.name);
          setLocalParticipant(newRoom.localParticipant);
          
          // ✅ Filter out local participant and only include RemoteParticipants
          const remoteParticipantsMap = new Map<string, RemoteParticipant>();
          newRoom.participants.forEach((participant) => {
            // Only add RemoteParticipants, exclude LocalParticipant
            if (participant instanceof RemoteParticipant) {
              remoteParticipantsMap.set(participant.identity, participant);
            }
          });
          setParticipants(remoteParticipantsMap);
          setParticipantCount(newRoom.participants.size + 1);

        // ✅ SIMPLIFIED AND DIRECT: Subscribe to ALL tracks from ALL participants
        const subscribeToAll = () => {
          console.log('[LiveKit] 🔄 CONNECTED EVENT: Subscribing to ALL participants');
          
          newRoom.participants.forEach((participant) => {
            const trackPublications = Array.from((participant as any).trackPublications?.values() || []);
            console.log('[LiveKit] Participant', participant.identity, 'has', trackPublications.length, 'publications');
            
            trackPublications.forEach((pub: any) => {
              // ✅ Subscribe to video, audio, AND screen share tracks
              if (pub && ((pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio) || 
                          (pub.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare))) {
                if (!pub.isSubscribed) {
                  console.log('[LiveKit] ⚡ SUBSCRIBING to', pub.kind, pub.source === Track.Source.ScreenShare ? '(ScreenShare)' : '', 'from', participant.identity);
                  pub.setSubscribed(true).catch((err: any) => {
                    console.error('[LiveKit] Subscription error:', err);
                  });
                } else {
                  console.log('[LiveKit] Already subscribed to', pub.kind, pub.source === Track.Source.ScreenShare ? '(ScreenShare)' : '', 'from', participant.identity);
                }
              }
            });
            
            setupTrackPublishedListener(participant);
          });
        };
        
        // Immediate
        subscribeToAll();
        
        // Aggressive retries
        const retries = [100, 300, 500, 800, 1000, 1500, 2000, 3000, 5000];
        retries.forEach((delay) => {
          setTimeout(subscribeToAll, delay);
        });
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
        
        roomRef.current = null;
        hasPublishedRef.current = false;
      });

      newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('[LiveKit] ✅✅✅ NEW PARTICIPANT CONNECTED:', participant.identity, 'Name:', participant.name);
        
        // ✅ Only add RemoteParticipants, exclude LocalParticipant
        // ✅ Replace if exists (handles refresh scenarios where same identity reconnects)
        if (participant instanceof RemoteParticipant) {
          setParticipants(prev => {
            const newMap = new Map(prev);
            // Replace if exists to handle refresh scenarios
            newMap.set(participant.identity, participant);
            return newMap;
          });
        }
        
        setParticipantCount(newRoom.participants.size + 1);

        // ✅ SIMPLIFIED: Make NEW participant subscribe to ALL EXISTING participants
        const newJoinerSubscribe = () => {
          console.log('[LiveKit] 🔑 NEW JOINER subscribing to existing participants');
          
          newRoom.participants.forEach((existing) => {
            if (existing.identity === participant.identity) return; // Skip self
            
            const tracks = Array.from((existing as any).trackPublications?.values() || []);
            tracks.forEach((pub: any) => {
              // ✅ Subscribe to video, audio, AND screen share tracks
              if (pub && ((pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio) || 
                          (pub.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare))) {
                if (!pub.isSubscribed) {
                  console.log('[LiveKit] ⚡ New joiner subscribing to', pub.kind, pub.source === Track.Source.ScreenShare ? '(ScreenShare)' : '', 'from', existing.identity);
                  pub.setSubscribed(true).catch((err: any) => console.error('Subscribe error:', err));
                }
              }
            });
          });
        };
        
        // ✅ Make ALL existing participants subscribe to NEW participant
        const existingSubscribeToNew = () => {
          console.log('[LiveKit] 🔄 Existing participants subscribing to NEW joiner');
          const tracks = Array.from((participant as any).trackPublications?.values() || []);
          tracks.forEach((pub: any) => {
            if (pub && (pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio)) {
              if (!pub.isSubscribed) {
                console.log('[LiveKit] ⚡ Existing subscribing to new joiner', pub.kind);
                pub.setSubscribed(true).catch((err: any) => console.error('Subscribe error:', err));
              }
            }
          });
        };
        
        // Immediate subscriptions
        newJoinerSubscribe();
        existingSubscribeToNew();
        
        // Aggressive retries
        [200, 400, 600, 1000, 1500, 2000, 3000, 5000].forEach((delay) => {
          setTimeout(newJoinerSubscribe, delay);
          setTimeout(existingSubscribeToNew, delay);
        });
        
        setupTrackPublishedListener(participant);
      });

      newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        setParticipants(prev => {
          const newMap = new Map(prev);
          newMap.delete(participant.identity);
          return newMap;
        });
        setParticipantCount(newRoom.participants.size + 1);
      });

      // ✅ CRITICAL: Listen for TrackPublished - when ANY participant publishes a track
      // This ensures automatic subscription to newly published tracks
      newRoom.on(RoomEvent.TrackPublished, (publication, participant) => {
        console.log('[LiveKit] 🎥📢 TRACK PUBLISHED:', publication.kind, 'from', participant.identity, 'Name:', participant.name);
        
        // Only handle remote participants (not our own tracks)
        if (participant instanceof RemoteParticipant) {
          const remotePub = publication as RemoteTrackPublication;
          
          // ✅ Subscribe to video, audio, AND screen share tracks
          if (publication.kind === Track.Kind.Video || publication.kind === Track.Kind.Audio) {
            if (!remotePub.isSubscribed) {
              const sourceInfo = publication.source === Track.Source.ScreenShare ? ' (ScreenShare)' : '';
              console.log('[LiveKit] ⚡ AUTO-SUBSCRIBING to newly published', publication.kind + sourceInfo, 'from', participant.identity);
              (async () => {
                try {
                  await remotePub.setSubscribed(true);
                  console.log('[LiveKit] ✅✅✅ AUTO-SUBSCRIBED to', publication.kind, publication.source === Track.Source.ScreenShare ? '(ScreenShare)' : '', 'from', participant.identity);
                } catch (err: any) {
                  console.error('[LiveKit] ❌ Auto-subscribe failed:', err);
                  // Retry after delay
                  setTimeout(async () => {
                    try {
                      await remotePub.setSubscribed(true);
                    } catch (e: any) {
                      console.error('[LiveKit] Retry failed:', e);
                    }
                  }, 500);
                }
              })();
            } else {
              console.log('[LiveKit] Already subscribed to', publication.kind, publication.source === Track.Source.ScreenShare ? '(ScreenShare)' : '', 'from', participant.identity);
            }
          }
        }
      });

      newRoom.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        console.log('[LiveKit] ✅ Track subscribed:', track.kind, 'from', participant.identity, 'Name:', participant.name);
        
        // Handle VIDEO tracks
        if (track.kind === Track.Kind.Video) {
          const el = track.attach() as HTMLVideoElement;

          // ✅ universal video settings
          el.autoplay = true;
          (el as any).playsInline = true;
          el.setAttribute('playsinline', 'true'); // iOS Safari requires lowercase too
          el.muted = false;
          el.controls = false;
          (el as any).disablePictureInPicture = true;
          el.style.width = '100%';
          el.style.height = '100%';
          // Use 'contain' to show full video without cropping - ensures everyone sees the same thing
          el.style.objectFit = 'contain';
          el.style.objectPosition = 'center';

          // ✅ mobile-safe auto play: retry once if blocked
          const tryPlay = () => {
            const playPromise = el.play();
            if (playPromise !== undefined) {
              playPromise.catch(() => {
                // user gesture may be required
                console.warn('[LiveKit] Mobile autoplay blocked, waiting for tap');
                el.addEventListener('touchstart', () => el.play(), { once: true });
                el.addEventListener('click', () => el.play(), { once: true });
              });
            }
          };
          tryPlay();

          // Find the inner video container (not the outer one that has the name overlay)
          const outerContainer = document.getElementById(`participant-${participant.sid}`);
          if (outerContainer) {
            // Find the inner div using data attribute for precise targeting
            const innerContainer = outerContainer.querySelector('[data-video-container="true"]') as HTMLElement;
            if (innerContainer) {
              innerContainer.innerHTML = '';
              innerContainer.appendChild(el);
              console.log('[LiveKit] ✅ Video attached to inner container, name overlay preserved');
            } else {
              // Fallback: Try finding by gradient class
              const fallbackContainer = outerContainer.querySelector('div[class*="bg-gradient"]') as HTMLElement;
              if (fallbackContainer) {
                fallbackContainer.innerHTML = '';
                fallbackContainer.appendChild(el);
                console.log('[LiveKit] ✅ Video attached via fallback method');
              } else {
                console.error('[LiveKit] ❌ Could not find video container!');
              }
            }
          }
        }
        
        // Handle AUDIO tracks - attach and play them with LOW LATENCY settings
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach() as HTMLAudioElement;
          el.autoplay = true;
          el.muted = false;
          el.volume = 1.0;
          
          // ✅ CRITICAL: Optimize audio element for low latency
          // Reduce preload and buffer settings
          el.preload = 'none'; // Don't preload - reduces latency
          el.crossOrigin = 'anonymous'; // Help with audio processing
          
          // Play audio track immediately (no delay)
          const tryPlayAudio = () => {
            const playPromise = el.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log('[LiveKit] ✅ Audio track playing from', participant.identity, '(low latency)');
                })
                .catch((err) => {
                  console.warn('[LiveKit] Audio autoplay blocked, waiting for user interaction:', err);
                  // Audio will play after user interaction
                  document.addEventListener('click', () => {
                    el.play().catch(e => console.warn('Audio play failed:', e));
                  }, { once: true });
                });
            }
          };
          tryPlayAudio();
        }
      });

      newRoom.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        console.log('[LiveKit] Track unsubscribed:', track.kind, 'from', participant.identity);
        track.detach().forEach((el) => el.remove());
      });

      newRoom.on(RoomEvent.TrackMuted, (publication, participant) => {
        // Track muted - force update to reflect mute status changes
        console.log('[LiveKit] Track muted:', publication.kind, 'from', participant.identity);
        if (publication.kind === Track.Kind.Audio) {
          // Force re-render to update mic status indicators
          forceUpdate({});
        }
      });

      newRoom.on(RoomEvent.TrackUnmuted, (publication, participant) => {
        // Track unmuted - force update to reflect mute status changes
        console.log('[LiveKit] Track unmuted:', publication.kind, 'from', participant.identity);
        if (publication.kind === Track.Kind.Audio) {
          // Force re-render to update mic status indicators
          forceUpdate({});
        }
      });

      newRoom.on(RoomEvent.LocalTrackPublished, (publication) => {
        // Force re-render by setting a new object
        console.log('[LiveKit] Local track published:', publication.kind, publication.source);
        forceUpdate({});
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

      // Connect to room with autoSubscribe enabled
      console.log('[LiveKit] 🔄 Connecting to room with autoSubscribe: true');
      
      // ✅ CRITICAL: Use the most reliable connection options
      await newRoom.connect(LIVEKIT_CONFIG.serverUrl, token, { 
        autoSubscribe: true,
        // Explicitly subscribe to all tracks on connect
      });
      
      setRoom(newRoom);
      console.log('[LiveKit] ✅ Connection established! Participants:', newRoom.participants.size);
      
      // ✅ FORCE subscription to all existing participants' tracks immediately after connect
      // This happens BEFORE the Connected event, so it's the earliest possible subscription
      const forceSubscribeAllTracks = () => {
        console.log('[LiveKit] 🚀 FORCE SUBSCRIBE ALL TRACKS - Participants:', newRoom.participants.size);
        
        newRoom.participants.forEach((participant) => {
          console.log('[LiveKit] Force subscribing to participant:', participant.identity, participant.name);
          
          // Get ALL track publications for this participant
          const trackPublications = Array.from((participant as any).trackPublications?.values() || []);
          console.log('[LiveKit] Found', trackPublications.length, 'track publications for', participant.identity);
          
          trackPublications.forEach((pub: any) => {
            if (pub && (pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio)) {
              if (!pub.isSubscribed) {
                console.log('[LiveKit] ⚡ FORCE SUBSCRIBING to', pub.kind, 'from', participant.identity);
                pub.setSubscribed(true).catch((err: any) => {
                  console.error('[LiveKit] ❌ Force subscribe failed:', err);
                });
              }
            }
          });
        });
      };
      
      // Immediate force subscribe (before Connected event)
      forceSubscribeAllTracks();
      
      // ✅ CRITICAL: Post-connect subscription (before Connected event fires)
      // This ensures we subscribe immediately after connection
      const postConnectSubscribe = async () => {
        console.log('[LiveKit] 🔄 POST-CONNECT: Subscribing to all existing participants');
        const subscriptions: Promise<void>[] = [];
        
        newRoom.participants.forEach((participant) => {
          console.log('[LiveKit] Post-connect subscribing to:', participant.identity, 'Name:', participant.name);
          subscriptions.push(subscribeToParticipantTracks(participant));
          setupTrackPublishedListener(participant);
        });
        
        await Promise.allSettled(subscriptions);
        console.log('[LiveKit] ✅ Post-connect subscriptions completed');
      };
      
      // Multiple attempts (aggressive)
      setTimeout(() => postConnectSubscribe(), 100);
      setTimeout(() => postConnectSubscribe(), 300);
      setTimeout(() => postConnectSubscribe(), 600);
      setTimeout(() => postConnectSubscribe(), 1000);
      setTimeout(() => postConnectSubscribe(), 2000);
      setTimeout(() => postConnectSubscribe(), 3000);
      setTimeout(() => postConnectSubscribe(), 5000);
      
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

    if (roomRef.current) {
      roomRef.current.disconnect();
    }
  }, []);

  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    if (!roomRef.current) return;
    
    try {
      // Check if audio track exists
      const audioTrack = roomRef.current.localParticipant.getTrack(Track.Source.Microphone);
      
      if (enabled && !audioTrack) {
        // Need to create and publish audio track
        const raw = localStorage.getItem('preMeetingSettings');
        const saved = raw ? JSON.parse(raw) : {};
        
        // ✅ Enhanced audio constraints for echo cancellation and low latency
        const aTrack = await createLocalAudioTrack({
          deviceId: saved.audioDeviceId ? { exact: saved.audioDeviceId } : undefined,
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
        // Need to create and publish video track
        const raw = localStorage.getItem('preMeetingSettings');
        const saved = raw ? JSON.parse(raw) : {};
        
        // ✅ Video constraints optimized for low latency
        const vTrack = await createLocalVideoTrack({
          deviceId: saved.videoDeviceId ? { exact: saved.videoDeviceId } : undefined,
          resolution: { 
            width: 1280, 
            height: 720,
            frameRate: 30, // Lower frame rate = lower latency
          },
        });
        
        await roomRef.current.localParticipant.publishTrack(vTrack, {
          source: Track.Source.Camera,
        });
      } else if (videoTrack) {
        // Just enable/disable existing track
        await roomRef.current.localParticipant.setCameraEnabled(enabled);
      }
      
      setIsCameraEnabled(enabled);
      
      // Force a re-render
      if (enabled) {
        setTimeout(() => {
          forceUpdate({});
          setLocalParticipant(roomRef.current?.localParticipant || null);
        }, 100);
      }
    } catch (error) {
      console.error('Failed to set camera:', error);
      setError('Failed to toggle camera. Please check your browser permissions.');
      setIsCameraEnabled(false);
    }
  }, []);

    // Helper function to detect mobile devices
  const isMobileDevice = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
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

  const toggleMicrophone = useCallback(async () => {
    await setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [isMicrophoneEnabled, setMicrophoneEnabled]);

  const toggleCamera = useCallback(async () => {
    await setCameraEnabled(!isCameraEnabled);
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
      
      // Get saved background settings
      const saved = localStorage.getItem('preMeetingSettings') 
        ? JSON.parse(localStorage.getItem('preMeetingSettings')!)
        : {};
      const bgEnabled = saved.backgroundEffectsEnabled || 
        localStorage.getItem('backgroundEffectsEnabled') === 'true';
      const chosenBg = saved.savedBackground || 
        (localStorage.getItem('savedBackground') && 
         JSON.parse(localStorage.getItem('savedBackground')!));

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

      // Create new track with new facing mode
      const newTrack = await createLocalVideoTrack({
        facingMode: newFacingMode,
        resolution: { width: 1280, height: 720, frameRate: 30 },
      });

      // Reapply background effects if enabled
      if (bgEnabled) {
        try {
          await backgroundEngine.init(newTrack);
          await new Promise(resolve => setTimeout(resolve, 100));
          
          if (chosenBg) {
            if (chosenBg.type === 'blur' && typeof backgroundEngine.setBlur === 'function') {
              await backgroundEngine.setBlur();
            } else if (chosenBg.type === 'image' && chosenBg.url && typeof backgroundEngine.setImage === 'function') {
              await backgroundEngine.setImage(chosenBg.url);
            } else if (chosenBg.type === 'video' && chosenBg.url && typeof backgroundEngine.setVideo === 'function') {
              await backgroundEngine.setVideo(chosenBg.url);
            }
          } else if (typeof backgroundEngine.setBlur === 'function') {
            // Default to blur if no specific background
            await backgroundEngine.setBlur();
          }
        } catch (e) {
          console.warn('[LiveKit] Error reapplying background after camera switch:', e);
        }
      }

      // Publish new track
      await localPart.publishTrack(newTrack, {
        source: Track.Source.Camera,
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
    if (hasPublishedRef.current) {
      return;
    }
    
    const r = roomRef.current;
    if (!r) {
      return;
    }

    const raw = localStorage.getItem('preMeetingSettings');
    const saved = raw ? JSON.parse(raw) : {};
    const videoOn = saved.videoEnabled !== false;
    const audioOn = saved.audioEnabled !== false;

    // VIDEO
    if (videoOn) {
      try {
        let vTrack: LocalVideoTrack;
        
        // ✅ Video constraints optimized for low latency
        const videoConstraints = {
          width: 1280,
          height: 720,
          frameRate: 30, // Lower frame rate = lower latency
        };
        
        // Try with saved device first
        if (saved.videoDeviceId) {
          try {
            vTrack = await createLocalVideoTrack({
              deviceId: { exact: saved.videoDeviceId },
              resolution: videoConstraints,
            });
          } catch (exactError: any) {
            console.warn('[LiveKit] Failed with exact device, trying ideal:', exactError);
            // If exact device fails, try ideal constraint
            vTrack = await createLocalVideoTrack({
              deviceId: { ideal: saved.videoDeviceId },
              resolution: videoConstraints,
            });
          }
        } else {
          // No device saved, use default
          vTrack = await createLocalVideoTrack({
            resolution: videoConstraints,
          });
        }

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
      } catch (error: any) {
        console.error('[LiveKit] Failed to create/publish video track:', error);
        setIsCameraEnabled(false);
        setError(`Camera access denied or unavailable: ${error.message}. Please check your browser permissions and click the camera button.`);
      }
    }

    // AUDIO - ✅ Optimized for LOW LATENCY and ECHO CANCELLATION
    if (audioOn) {
      try {
        const aTrack = await createLocalAudioTrack({
          deviceId: saved.audioDeviceId ? { exact: saved.audioDeviceId } : undefined,
          // ✅ Enhanced audio constraints for echo cancellation and low latency
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000, // Higher sample rate for lower latency
          channelCount: 1, // Mono for better echo cancellation
          sampleSize: 16,
          // ✅ Optimize for real-time communication (low latency)
          latency: 0.01, // 10ms latency target
        });
        await r.localParticipant.publishTrack(aTrack);
        setIsMicrophoneEnabled(true);
        console.log('[LiveKit] ✅ Audio track published with echo cancellation enabled');
      } catch (error: any) {
        console.error('[LiveKit] Failed to create/publish audio track:', error);
        setIsMicrophoneEnabled(false);
        // Don't show error for audio as it's less critical
      }
    }
    
    // Only set hasPublishedRef to true if we attempted both video and audio
    // This prevents retries if both were attempted, even if one failed
    if (videoOn || audioOn) {
      hasPublishedRef.current = true;
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
