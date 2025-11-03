import React, { useEffect, useRef, useState } from 'react';
import { useLiveKit, RemoteControlEvent } from '../contexts/LiveKitContext';
import { useAuth } from '../contexts/AuthContext';
import { RemoteParticipant, LocalParticipant, Track, TrackPublication, ParticipantEvent, RemoteTrackPublication } from 'livekit-client';

// Interface for active screen share
interface ActiveScreenShare {
  participant: LocalParticipant | RemoteParticipant;
  publication: TrackPublication;
}

const VideoGrid: React.FC = () => {
  const { participants, localParticipant, room } = useLiveKit();
  const { user } = useAuth();
  const [activeScreenShares, setActiveScreenShares] = useState<ActiveScreenShare[]>([]);
  const [cameraPage, setCameraPage] = useState(0); // ✅ Move hooks to top

  // ✅ Track screen shares from all participants (max 2)
  useEffect(() => {
    if (!room) return;

    const updateScreenShares = () => {
      const screenShares: ActiveScreenShare[] = [];
      
      // Check local participant
      if (localParticipant) {
        const screenPub = localParticipant.getTrack(Track.Source.ScreenShare) as TrackPublication | null;
        if (screenPub && screenPub.track) {
          screenShares.push({ participant: localParticipant, publication: screenPub });
        }
      }

      // Check remote participants (max 2 total)
      for (const participant of participants.values()) {
        if (screenShares.length >= 2) break; // Max 2 screen shares
        
        const screenPub = participant.getTrack(Track.Source.ScreenShare) as TrackPublication | null;
        if (screenPub && screenPub.track && screenPub.isSubscribed) {
          // Skip if this participant already added (local)
          if (!screenShares.some(ss => ss.participant.identity === participant.identity)) {
            screenShares.push({ participant, publication: screenPub });
          }
        }
      }

      setActiveScreenShares(screenShares.slice(0, 2)); // Ensure max 2
    };

    // Initial check
    updateScreenShares();

    // Listen for track published/unpublished events on all participants
    // The event handlers receive only the publication, participant is from closure
    const handleTrackPublished = (publication: TrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) {
        console.log('[VideoGrid] Screen share published');
        updateScreenShares();
      }
    };

    const handleTrackUnpublished = (publication: TrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) {
        console.log('[VideoGrid] Screen share unpublished');
        updateScreenShares();
      }
    };

    // Subscribe to local participant events
    if (localParticipant) {
      localParticipant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
      localParticipant.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
    }

    // Subscribe to remote participant events
    const unsubscribeFunctions: (() => void)[] = [];
    participants.forEach((participant) => {
      participant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
      participant.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
      unsubscribeFunctions.push(() => {
        participant.off(ParticipantEvent.TrackPublished, handleTrackPublished);
        participant.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
      });
    });

    // Periodic check as fallback
    const checkInterval = setInterval(updateScreenShares, 1000);

    return () => {
      if (localParticipant) {
        localParticipant.off(ParticipantEvent.TrackPublished, handleTrackPublished);
        localParticipant.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
      }
      unsubscribeFunctions.forEach(unsub => unsub());
      clearInterval(checkInterval);
    };
  }, [room, localParticipant, participants]);

  // Combine local and remote participants
  const allParticipants: (LocalParticipant | RemoteParticipant)[] = [];
  if (localParticipant) {
    allParticipants.push(localParticipant);
  }
  participants.forEach((participant) => {
    allParticipants.push(participant);
  });

  const hasScreenShare = activeScreenShares.length > 0;
  const screenShareCount = activeScreenShares.length;
  const camerasPerPage = 3;

  // ✅ Reset to first page when participants change or screen share toggles
  // ✅ Also force a re-render when screen share state changes to recover camera tracks
  useEffect(() => {
    setCameraPage(0);
    
    // When screen share stops, wait a bit and force update to ensure camera tracks recover
    if (!hasScreenShare && activeScreenShares.length === 0) {
      setTimeout(() => {
        // Trigger a re-check by causing a small state update
        // The periodic check in VideoTile will pick up the camera tracks
        console.log('[VideoGrid] Screen share stopped, camera tracks should recover');
      }, 300);
    }
  }, [allParticipants.length, hasScreenShare, activeScreenShares.length]);

  if (allParticipants.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-gray-500">Waiting for participants to join...</p>
        </div>
      </div>
    );
  }

  // ✅ Zoom-style layout: cameras on top, screen shares on bottom
  if (hasScreenShare) {
    const totalPages = Math.ceil(allParticipants.length / camerasPerPage);
    const startIndex = cameraPage * camerasPerPage;
    const endIndex = startIndex + camerasPerPage;
    const visibleCameras = allParticipants.slice(startIndex, endIndex);
    const canGoLeft = cameraPage > 0;
    const canGoRight = cameraPage < totalPages - 1;

    return (
      <div className="h-full w-full flex flex-col">
        {/* ✅ Cameras section - Top (professional height, ~12-15% height) */}
        <div className={`video-grid-cameras-wrapper ${screenShareCount === 2 ? 'h-[12%]' : 'h-[15%]'}`}>
          <div className="video-grid-cameras-container">
            {/* Left navigation button */}
            {canGoLeft && (
              <button
                onClick={() => setCameraPage(cameraPage - 1)}
                className="camera-nav-btn camera-nav-left"
                aria-label="Previous cameras"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Camera tiles container */}
            <div className="video-grid-cameras-content">
              <div className="video-grid" data-count={visibleCameras.length} data-screen-share="true">
                {visibleCameras.map((participant) => (
                  <VideoTile 
                    key={participant.identity || participant.sid} 
                    participant={participant} 
                    currentUserUid={user?.uid}
                    isScreenShareMode={true}
                  />
                ))}
              </div>
            </div>

            {/* Right navigation button */}
            {canGoRight && (
              <button
                onClick={() => setCameraPage(cameraPage + 1)}
                className="camera-nav-btn camera-nav-right"
                aria-label="Next cameras"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {/* Page indicator (if more than 1 page) */}
          {totalPages > 1 && (
            <div className="camera-page-indicator">
              {cameraPage + 1} / {totalPages}
            </div>
          )}
        </div>

        {/* ✅ Screen share section - Bottom (centered, professional width, full content visible) */}
        <div className="flex-1 flex items-center justify-center gap-2 p-4 overflow-auto">
          <div className={`screen-share-container ${screenShareCount === 2 ? 'flex-row' : 'flex-col'} gap-2`}>
            {activeScreenShares.map((screenShare, index) => (
              <ScreenShareTile
                key={`${screenShare.participant.identity}-${index}`}
                participant={screenShare.participant}
                publication={screenShare.publication}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Normal grid layout when no screen share
  return (
    <div className="video-grid" data-count={allParticipants.length}>
      {allParticipants.map((participant) => (
        <VideoTile key={participant.identity || participant.sid} participant={participant} currentUserUid={user?.uid} />
      ))}
    </div>
  );
};

// Screen Share Tile Component
interface ScreenShareTileProps {
  participant: LocalParticipant | RemoteParticipant;
  publication: TrackPublication;
}

const ScreenShareTile: React.FC<ScreenShareTileProps> = ({ participant, publication }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [track, setTrack] = useState(publication.track || null);

  // ✅ Ensure screen share track is subscribed for remote participants
  useEffect(() => {
    if (!publication.track && publication instanceof RemoteTrackPublication && !publication.isSubscribed) {
      (async () => {
        try {
          await publication.setSubscribed(true);
          console.log('[ScreenShareTile] Subscribed to screen share from', participant.identity);
        } catch (err: any) {
          console.error('[ScreenShareTile] Failed to subscribe:', err);
        }
      })();
    }
  }, [publication, participant.identity]);

  useEffect(() => {
    if (publication.track) {
      setTrack(publication.track);
    }

    const handleTrackChanged = () => {
      setTrack(publication.track || null);
    };

    // Listen for track changes
    if (publication.track) {
      publication.track.on('ended', handleTrackChanged);
    }

    return () => {
      if (publication.track) {
        publication.track.off('ended', handleTrackChanged);
      }
    };
  }, [publication]);

  useEffect(() => {
    if (!containerDivRef.current || !track) return;

    const element = track.attach() as HTMLVideoElement;
    element.autoplay = true;
    element.muted = false;
    element.controls = false;
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.objectFit = 'contain'; // Show full screen, not cropped
    element.style.maxWidth = '100%';
    element.style.maxHeight = '100%';

    const container = containerDivRef.current;
    
    // ✅ Safe DOM manipulation - check if element is already attached
    if (container && !container.contains(element)) {
      // Clear existing content first
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      container.appendChild(element);
    }

    element.play().catch(err => {
      console.warn('[ScreenShareTile] Autoplay blocked:', err);
    });

    return () => {
      if (track && element) {
        try {
          // ✅ Safe detach - check if element is still in DOM before removing
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
          track.detach();
        } catch (err) {
          console.warn('[ScreenShareTile] Error during detach:', err);
          // Still try to detach the track
          try {
            track.detach();
          } catch (e) {
            console.error('[ScreenShareTile] Failed to detach track:', e);
          }
        }
      }
    };
  }, [track]);

  const displayName = participant.name || participant.identity || 'Unknown';
  const isLocal = participant instanceof LocalParticipant;
  const containerDivRef = useRef<HTMLDivElement>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const { sendRemoteControlEvent } = useLiveKit();
  const [isRemoteControlActive, setIsRemoteControlActive] = useState(false);

  // ✅ Capture pointer events on screen share and forward them for remote control
  useEffect(() => {
    if (!isLocal || !track || !containerDivRef.current) return;

    const container = containerDivRef.current;
    const video = container.querySelector('video') as HTMLVideoElement;
    if (!video) return;

    videoElementRef.current = video;

    const handlePointerEvent = (e: PointerEvent | WheelEvent) => {
      if (!isRemoteControlActive || !video) return;

      const rect = video.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width; // Normalized 0-1
      const y = (e.clientY - rect.top) / rect.height; // Normalized 0-1

      let event: RemoteControlEvent | null = null;

      if (e instanceof PointerEvent) {
        if (e.type === 'mousemove') {
          event = { type: 'mousemove', x, y };
        } else if (e.type === 'mousedown') {
          event = { type: 'mousedown', x, y, button: e.button };
        } else if (e.type === 'mouseup') {
          event = { type: 'mouseup', x, y, button: e.button };
        } else if (e.type === 'click') {
          event = { type: 'click', x, y, button: e.button };
        }
      } else if (e instanceof WheelEvent) {
        event = { type: 'wheel', x, y, deltaY: e.deltaY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey };
      }

      if (event) {
        sendRemoteControlEvent(participant.identity, event).catch(err => {
          console.error('[ScreenShareTile] Failed to send remote control event:', err);
        });
      }
    };

    const handleKeyboardEvent = (e: KeyboardEvent) => {
      if (!isRemoteControlActive || !video) return;

      // For keyboard events, use center of video as coordinates
      const x = 0.5;
      const y = 0.5;

      const event: RemoteControlEvent = {
        type: e.type as 'keydown' | 'keyup',
        x,
        y,
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      };

      sendRemoteControlEvent(participant.identity, event).catch(err => {
        console.error('[ScreenShareTile] Failed to send remote control event:', err);
      });
    };

    // Add event listeners for remote control
    if (isRemoteControlActive) {
      container.addEventListener('pointermove', handlePointerEvent);
      container.addEventListener('pointerdown', handlePointerEvent);
      container.addEventListener('pointerup', handlePointerEvent);
      container.addEventListener('click', handlePointerEvent);
      container.addEventListener('wheel', handlePointerEvent);
      window.addEventListener('keydown', handleKeyboardEvent);
      window.addEventListener('keyup', handleKeyboardEvent);
      
      container.style.pointerEvents = 'auto';
      container.style.cursor = 'crosshair';
    } else {
      container.style.pointerEvents = 'none';
      container.style.cursor = 'default';
    }

    return () => {
      container.removeEventListener('pointermove', handlePointerEvent);
      container.removeEventListener('pointerdown', handlePointerEvent);
      container.removeEventListener('pointerup', handlePointerEvent);
      container.removeEventListener('click', handlePointerEvent);
      container.removeEventListener('wheel', handlePointerEvent);
      window.removeEventListener('keydown', handleKeyboardEvent);
      window.removeEventListener('keyup', handleKeyboardEvent);
    };
  }, [isLocal, track, isRemoteControlActive, participant.identity, sendRemoteControlEvent]);

  // ✅ Listen for remote control events from the shared window (when someone controls it)
  useEffect(() => {
    if (!isLocal || !track) return;

    const handleRemoteControlInput = (e: CustomEvent) => {
      const { event, senderId } = e.detail;
      console.log('[ScreenShareTile] Remote control input received from', senderId, event.type);
      
      // Simulate the event on the shared screen
      // This is a simplified version - full implementation would map coordinates
      // to the actual shared window coordinates
      if (videoElementRef.current) {
        // Dispatch a custom event that the shared window can listen to
        // Note: Browser security prevents direct control, but we can provide hooks
        window.dispatchEvent(new CustomEvent('simulateRemoteControl', {
          detail: { event, screenShareElement: videoElementRef.current }
        }));
      }
    };

    window.addEventListener('remoteControlInput' as any, handleRemoteControlInput);
    return () => {
      window.removeEventListener('remoteControlInput' as any, handleRemoteControlInput);
    };
  }, [isLocal, track]);

  // ✅ Toggle remote control mode
  const handleToggleRemoteControl = () => {
    setIsRemoteControlActive(!isRemoteControlActive);
  };

  return (
    <div ref={containerRef} className="screen-share-tile bg-black rounded-lg relative flex items-center justify-center">
      {/* Forward ref for remote control */}
      <div ref={containerDivRef} className="w-full h-full">
        {/* Container content */}
      </div>

      {/* Placeholder while loading */}
      {!track && (
        <div className="text-center text-cloud absolute inset-0 flex items-center justify-center">
          <div>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-techBlue mx-auto mb-2"></div>
            <p className="text-sm">Loading screen share...</p>
          </div>
        </div>
      )}
      
      {/* Participant name and controls overlay */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
        <div className="bg-black/70 text-white px-3 py-1 rounded-lg text-sm font-medium">
          {displayName}'s screen
        </div>
        
        {/* ✅ Remote Control button - only show for local participant who is sharing */}
        {isLocal && track && (
          <button
            onClick={handleToggleRemoteControl}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors pointer-events-auto ${
              isRemoteControlActive 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-techBlue hover:bg-blue-600 text-white'
            }`}
            title={isRemoteControlActive ? 'Disable remote control' : 'Enable remote control - click on your shared screen to control it'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            {isRemoteControlActive ? 'Remote Control ON' : 'Enable Control'}
          </button>
        )}
      </div>
      
      {/* ✅ Remote control indicator */}
      {isLocal && isRemoteControlActive && (
        <div className="absolute bottom-4 left-4 bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-medium z-10">
          🎮 Click on your shared screen to control it
        </div>
      )}
    </div>
  );
};

interface VideoTileProps {
  participant: LocalParticipant | RemoteParticipant;
  currentUserUid?: string;
  isScreenShareMode?: boolean; // When true, cameras are shown smaller at top
}

const VideoTile: React.FC<VideoTileProps> = ({ participant, currentUserUid }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isLocal = participant instanceof LocalParticipant;
  const [videoPublication, setVideoPublication] = useState<TrackPublication | null>(null);

  // Listen for track publications
  useEffect(() => {
    // Get initial video publication - accept Camera or Unknown
    const vidPub: TrackPublication | null = 
      (participant.getTrack(Track.Source.Camera) as TrackPublication) ||
      (participant.getTrack(Track.Source.Unknown) as TrackPublication) ||
      null;
    setVideoPublication(vidPub);

    // Listen for track published/unpublished events
    const handleTrackPublished = (publication: TrackPublication) => {
      console.log('[VideoTile] Track published:', publication.kind, 'from', participant.identity);
      // ✅ Only handle camera tracks, NOT screen share
      if (publication.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
        setVideoPublication(publication);
      }
    };

    const handleTrackUnpublished = (publication: TrackPublication) => {
      console.log('[VideoTile] Track unpublished:', publication.kind, 'from', participant.identity);
      // ✅ Only clear if it's the current publication (to avoid clearing when screen share stops)
      if (publication.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
        if (videoPublication === publication) {
          setVideoPublication(null);
        }
        // Re-check for camera track after a delay (in case screen share stopped)
        setTimeout(() => {
          const newVidPub = (participant.getTrack(Track.Source.Camera) as TrackPublication) || null;
          if (newVidPub && newVidPub !== videoPublication) {
            setVideoPublication(newVidPub);
          }
        }, 100);
      }
    };

    participant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
    participant.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);

    return () => {
      participant.off(ParticipantEvent.TrackPublished, handleTrackPublished);
      participant.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
    };
  }, [participant, isLocal]);

  // Periodic check for video track (in case it's published after initial render)
  // Also check if track is subscribed for remote participants
  // ✅ CRITICAL: This also recovers camera tracks after screen share stops
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const vidPub: TrackPublication | null = 
        (participant.getTrack(Track.Source.Camera) as TrackPublication) ||
        null;
      
      // ✅ If we don't have a track, or our current track is invalid, try to get a new one
      if (!videoPublication?.track || (vidPub && vidPub !== videoPublication)) {
        if (vidPub && vidPub.track) {
          // For remote participants, make sure track is subscribed
          if (!isLocal) {
            const remotePub = vidPub as any as RemoteTrackPublication;
            if (remotePub && !remotePub.isSubscribed) {
              console.log('[VideoTile] Found unsubscribed remote track, subscribing...');
              (async () => {
                try {
                  await remotePub.setSubscribed(true);
                  setVideoPublication(vidPub);
                } catch (err: any) {
                  console.error('[VideoTile] Failed to subscribe:', err);
                }
              })();
              return;
            }
          }
          
          // ✅ Set the publication (this will trigger re-attachment)
          if (vidPub !== videoPublication) {
            console.log('[VideoTile] Found camera track, updating publication');
            setVideoPublication(vidPub);
          }
        }
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [participant, videoPublication, isLocal]);

  // Attach video track when publication changes - for BOTH local AND remote participants
  useEffect(() => {
    if (!containerRef.current) return;
    if (!videoPublication?.track) return;
    
    console.log('[VideoTile] Attaching video track for', isLocal ? 'local' : 'remote', 'participant:', participant.identity);
    
    // Attach video for BOTH local and remote participants
    const element = videoPublication.track.attach() as HTMLVideoElement;
    element.autoplay = true;
    element.setAttribute('playsInline', 'true');
    element.setAttribute('playsinline', 'true');
    element.muted = isLocal; // Local is muted, remote is not
    element.controls = false;
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.objectFit = 'cover';

    // ✅ Safe DOM manipulation - clear and append video element
    const container = containerRef.current;
    if (!container) return;
    
    // ✅ Check if element is already attached to avoid duplicate attachment
    const existingVideo = container.querySelector('video');
    if (existingVideo) {
      // Remove existing video if it's different from the new one
      if (existingVideo !== element) {
        try {
          container.removeChild(existingVideo);
        } catch (err) {
          console.warn('[VideoTile] Error removing existing video:', err);
        }
      } else {
        // Same element already attached, skip re-attachment
        return () => {
          // Cleanup will be handled by the main return below
        };
      }
    }
    
    // Clear any remaining children safely
    while (container.firstChild) {
      try {
        container.removeChild(container.firstChild);
      } catch (err) {
        console.warn('[VideoTile] Error clearing container:', err);
        break;
      }
    }
    
    // Append the new element
    try {
      container.appendChild(element);
      
      // Try to play (for remote tracks)
      if (!isLocal) {
        element.play().catch((err) => {
          console.warn('[VideoTile] Autoplay blocked for remote video:', err);
          // Will play on user interaction
        });
      }
    } catch (err) {
      console.error('[VideoTile] Error appending video element:', err);
    }

    return () => {
      if (videoPublication?.track && element) {
        console.log('[VideoTile] Detaching video track for', isLocal ? 'local' : 'remote');
        try {
          // ✅ Safe detach - check if element is still in DOM before removing
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
          videoPublication.track.detach();
        } catch (err) {
          console.warn('[VideoTile] Error during detach:', err);
          // Still try to detach the track
          try {
            videoPublication.track.detach();
          } catch (e) {
            console.error('[VideoTile] Failed to detach track:', e);
          }
        }
      }
    };
  }, [videoPublication, isLocal, participant.identity]);

  // Determine display name - log for debugging
  const displayName = participant.name || participant.identity || 'Unknown';
  const isCurrentUser = currentUserUid && (participant.identity === currentUserUid || isLocal);
  
  // Debug logging for missing names
  useEffect(() => {
    if (!participant.name && !isLocal) {
      console.warn('[VideoTile] Participant missing name:', {
        identity: participant.identity,
        name: participant.name,
        sid: participant.sid,
        metadata: (participant as any).metadata
      });
    }
  }, [participant, isLocal]);

  return (
    <div className="video-container w-full h-full bg-gray-900 rounded-lg overflow-hidden relative" id={`participant-${participant.sid}`}>
      {/* Video element container - add data attribute for easy finding */}
      <div ref={containerRef} data-video-container="true" className="w-full h-full bg-gradient-to-br from-techBlue to-violetDeep flex items-center justify-center">
        {/* Placeholder when no video */}
        <div className="text-center text-cloud">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-xl sm:text-2xl font-bold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium">Video Stream</p>
        </div>
      </div>
      
      {/* Participant info overlay */}
      {isCurrentUser && (
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10">
          <div className="relative bg-gradient-to-r from-techBlue via-violetDeep to-techBlue bg-[length:200%_100%] animate-[gradient_3s_ease_infinite] px-2 py-1 sm:px-4 sm:py-2 rounded-lg shadow-lg">
            <style>
              {`
                @keyframes gradient {
                  0%, 100% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                }
              `}
            </style>
            <span className="font-semibold text-xs sm:text-sm text-cloud drop-shadow-md">
              {displayName}
            </span>
          </div>
        </div>
      )}
      {!isCurrentUser && (
        <div className="participant-info absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="font-medium text-sm text-white">
                {displayName}
              </span>
            </div>
            
            <div className="flex items-center space-x-1">
              {/* Mic status */}
              {participant.isMicrophoneEnabled ? (
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              ) : (
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              )}
              {/* Camera status */}
              {participant.isCameraEnabled ? (
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              ) : (
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoGrid;
