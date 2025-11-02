import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Room, RoomEvent, Track, RemoteParticipant, LocalParticipant, LocalTrackPublication, LocalVideoTrack, createLocalVideoTrack, createLocalAudioTrack, ParticipantEvent, TrackPublication, RemoteTrackPublication } from 'livekit-client';
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
              
              // Only subscribe to video and audio
              if (pub.kind !== Track.Kind.Video && pub.kind !== Track.Kind.Audio) continue;
              
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
        setParticipantCount(newRoom.participants.size + 1);
        setParticipants(new Map(newRoom.participants));

        // ✅ SIMPLIFIED AND DIRECT: Subscribe to ALL tracks from ALL participants
        const subscribeToAll = () => {
          console.log('[LiveKit] 🔄 CONNECTED EVENT: Subscribing to ALL participants');
          
          newRoom.participants.forEach((participant) => {
            const trackPublications = Array.from((participant as any).trackPublications?.values() || []);
            console.log('[LiveKit] Participant', participant.identity, 'has', trackPublications.length, 'publications');
            
            trackPublications.forEach((pub: any) => {
              if (pub && (pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio)) {
                if (!pub.isSubscribed) {
                  console.log('[LiveKit] ⚡ SUBSCRIBING to', pub.kind, 'from', participant.identity);
                  pub.setSubscribed(true).catch((err: any) => {
                    console.error('[LiveKit] Subscription error:', err);
                  });
                } else {
                  console.log('[LiveKit] Already subscribed to', pub.kind, 'from', participant.identity);
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
        roomRef.current = null;
        hasPublishedRef.current = false;
      });

      newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('[LiveKit] ✅✅✅ NEW PARTICIPANT CONNECTED:', participant.identity, 'Name:', participant.name);
        setParticipants(prev => new Map(prev.set(participant.identity, participant)));
        setParticipantCount(newRoom.participants.size + 1);

        // ✅ SIMPLIFIED: Make NEW participant subscribe to ALL EXISTING participants
        const newJoinerSubscribe = () => {
          console.log('[LiveKit] 🔑 NEW JOINER subscribing to existing participants');
          
          newRoom.participants.forEach((existing) => {
            if (existing.identity === participant.identity) return; // Skip self
            
            const tracks = Array.from((existing as any).trackPublications?.values() || []);
            tracks.forEach((pub: any) => {
              if (pub && (pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio)) {
                if (!pub.isSubscribed) {
                  console.log('[LiveKit] ⚡ New joiner subscribing to', pub.kind, 'from', existing.identity);
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
          
          if ((publication.kind === Track.Kind.Video || publication.kind === Track.Kind.Audio)) {
            if (!remotePub.isSubscribed) {
              console.log('[LiveKit] ⚡ AUTO-SUBSCRIBING to newly published', publication.kind, 'from', participant.identity);
              (async () => {
                try {
                  await remotePub.setSubscribed(true);
                  console.log('[LiveKit] ✅✅✅ AUTO-SUBSCRIBED to', publication.kind, 'from', participant.identity);
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
              console.log('[LiveKit] Already subscribed to', publication.kind, 'from', participant.identity);
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
          el.style.objectFit = 'cover';

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
        // Just enable/disable existing track
        await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
      }
      
      setIsMicrophoneEnabled(enabled);
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
