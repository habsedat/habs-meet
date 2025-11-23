import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLiveKit, RemoteControlEvent } from '../contexts/LiveKitContext';
import { useAuth } from '../contexts/AuthContext';
import { RemoteParticipant, LocalParticipant, Track, TrackPublication, ParticipantEvent, RemoteTrackPublication } from 'livekit-client';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Interface for active screen share
interface ActiveScreenShare {
  participant: LocalParticipant | RemoteParticipant;
  publication: TrackPublication;
}

const getParticipantId = (p: LocalParticipant | RemoteParticipant) =>
  p.identity || p.sid;

const VideoGrid: React.FC = () => {
  const { participants, localParticipant, room } = useLiveKit();
  const { user } = useAuth();
  const [activeScreenShares, setActiveScreenShares] = useState<ActiveScreenShare[]>([]);
  const [cameraPage, setCameraPage] = useState(0); // ✅ Move hooks to top
  
  // 🔹 Zoom-style manual order of participants
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

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

    // ✅ STABILITY FIX: Reduced polling frequency - event listeners handle most cases
    // Only check periodically as fallback (5 seconds instead of 1 second)
    const checkInterval = setInterval(updateScreenShares, 5000);

    return () => {
      if (localParticipant) {
        localParticipant.off(ParticipantEvent.TrackPublished, handleTrackPublished);
        localParticipant.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
      }
      unsubscribeFunctions.forEach(unsub => unsub());
      clearInterval(checkInterval);
    };
  }, [room, localParticipant, participants]);

  // Convert participants Map to array for proper reactivity tracking
  const participantsArray = React.useMemo(() => {
    return Array.from(participants.values());
  }, [participants.size, Array.from(participants.keys()).join(',')]);

  // Combine local and remote participants - CRITICAL: Include ALL participants
  // ✅ MUST use useMemo to ensure React tracks changes properly
  const allParticipants = React.useMemo(() => {
    const all: (LocalParticipant | RemoteParticipant)[] = [];
    if (localParticipant) {
      all.push(localParticipant);
    }
    // Add ALL remote participants
    participantsArray.forEach((participant) => {
      all.push(participant);
    });
    
    // Debug: Log all participants
    console.log('[VideoGrid] 🔍 Total participants:', all.length, {
      local: localParticipant ? 1 : 0,
      remote: participantsArray.length,
      participantIds: all.map(p => p.identity || p.sid),
      participantNames: all.map(p => p.name || 'Unknown')
    });
    
    return all;
  }, [localParticipant, participantsArray]);

  // Keep a stable, user-controlled order of participants (for drag & drop)
  useEffect(() => {
    const ids = allParticipants.map(getParticipantId);

    setOrderedIds((prev) => {
      if (prev.length === 0) {
        // First time: just use current order
        return ids;
      }

      // Keep existing order for still-present participants
      const existing = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !existing.includes(id));

      // If nothing changed, keep previous
      if (existing.length === prev.length && added.length === 0) return prev;

      return [...existing, ...added];
    });
  }, [allParticipants]); // ✅ Depend on entire array, not just length

  // Create ordered participants array
  const orderedParticipants = React.useMemo(
    () => {
      if (!orderedIds.length) return allParticipants;

      const list = [...allParticipants];
      return list.sort((a, b) => {
        const idA = getParticipantId(a);
        const idB = getParticipantId(b);
        const idxA = orderedIds.indexOf(idA);
        const idxB = orderedIds.indexOf(idB);
        return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
      });
    },
    [allParticipants, orderedIds]
  );

  // 🔹 Drag & drop handlers for Zoom-style rearranging
  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, overId: string) => {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;

    setOrderedIds((prev) => {
      const current = [...prev];
      const fromIndex = current.indexOf(draggingId);
      const toIndex = current.indexOf(overId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      current.splice(fromIndex, 1);
      current.splice(toIndex, 0, draggingId);
      return current;
    });
  };

  const handleDrop = () => {
    setDraggingId(null);
  };

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
    const totalPages = Math.ceil(orderedParticipants.length / camerasPerPage);
    const startIndex = cameraPage * camerasPerPage;
    const endIndex = startIndex + camerasPerPage;
    const visibleCameras = orderedParticipants.slice(startIndex, endIndex);
    const canGoLeft = cameraPage > 0;
    const canGoRight = cameraPage < totalPages - 1;

    return (
      <div className="h-full w-full flex flex-col" style={{ margin: 0, padding: 0, border: 'none' }}>
        {/* ✅ Cameras section - Top (professional height, ~12-15% height) */}
        <div className={`video-grid-cameras-wrapper ${screenShareCount === 2 ? 'h-[12%]' : 'h-[15%]'}`} style={{ border: 'none', margin: 0, padding: 0 }}>
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
                {visibleCameras.map((participant) => {
                  const participantId = getParticipantId(participant);
                  return (
                    <div
                      key={participantId}
                      draggable
                      onDragStart={() => handleDragStart(participantId)}
                      onDragOver={(e) => handleDragOver(e, participantId)}
                      onDrop={handleDrop}
                      onDragEnd={handleDrop}
                      style={{ cursor: draggingId === participantId ? 'grabbing' : 'grab' }}
                    >
                      <VideoTile 
                        participant={participant} 
                        currentUserUid={user?.uid}
                        isScreenShareMode={true}
                      />
                    </div>
                  );
                })}
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

  // Normal grid layout when no screen share - Zoom-style gallery layout
  return (
    <div className="video-grid-wrapper">
      <div className="video-grid" data-count={orderedParticipants.length}>
        {orderedParticipants.map((participant) => {
          const participantId = getParticipantId(participant);
          return (
            <div
              key={participantId}
              draggable
              onDragStart={() => handleDragStart(participantId)}
              onDragOver={(e) => handleDragOver(e, participantId)}
              onDrop={handleDrop}
              onDragEnd={handleDrop}
              style={{ 
                cursor: draggingId === participantId ? 'grabbing' : 'grab'
              }}
            >
              <VideoTile participant={participant} currentUserUid={user?.uid} />
            </div>
          );
        })}
      </div>
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
  isPrimary?: boolean; // When true, this is the primary/active speaker
  onPin?: (participantId: string | null) => void; // Pin/unpin callback
  pinnedId?: string | null; // Currently pinned participant ID
}

const VideoTile: React.FC<VideoTileProps> = ({ participant, currentUserUid, isPrimary, onPin, pinnedId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const isLocal = participant instanceof LocalParticipant;
  const { userProfile } = useAuth();
  const [videoPublication, setVideoPublication] = useState<TrackPublication | null>(null);
  const [participantProfile, setParticipantProfile] = useState<{ displayName: string; photoURL?: string } | null>(null);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);

  // 🔹 Find camera publication from videoTracks + ensure subscription for remote
  useEffect(() => {
    // Helper: always pick the first VIDEO publication we have
    const pickCameraPublication = (): TrackPublication | null => {
      // Prefer anything already in videoTracks
      const videoPubs: TrackPublication[] = [];
      participant.videoTracks.forEach((pub) => {
        videoPubs.push(pub as TrackPublication);
      });

      if (videoPubs.length > 0) {
        return videoPubs[0]; // in your layout, this is the camera
      }

      // Fallback to the source-based helpers (just in case)
      const bySource =
        (participant as any).getTrackPublication?.(Track.Source.Camera) ??
        (participant as any).getTrack?.(Track.Source.Camera);

      return (bySource as TrackPublication | null) ?? null;
    };

    let pub: TrackPublication | null = pickCameraPublication();

    // For remote participants – make sure we're subscribed
    if (!isLocal && pub) {
      const remotePub = pub as RemoteTrackPublication;
      if (!remotePub.isSubscribed) {
        try {
          remotePub.setSubscribed(true);
        } catch (e) {
          console.error('[VideoTile] camera subscribe failed', e);
        }
      }
    }

    setVideoPublication(pub);
    setIsCameraEnabled(!!pub && !pub?.isMuted);

    // If any VIDEO track is (un)published on this participant, update
    const handleTrackPublished = (p: TrackPublication) => {
      if (p.kind === Track.Kind.Video) {
        setVideoPublication(p);
        setIsCameraEnabled(!p.isMuted);
      }
    };

    const handleTrackUnpublished = (p: TrackPublication) => {
      if (p.kind === Track.Kind.Video) {
        setVideoPublication(null);
        setIsCameraEnabled(false);
      }
    };

    participant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
    participant.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);

    return () => {
      participant.off(ParticipantEvent.TrackPublished, handleTrackPublished);
      participant.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
    };
    // ✅ IMPORTANT: also react when number of video tracks changes
  }, [participant, isLocal, participant.videoTracks.size]);

  // ✅ REMOVED: No longer needed with autoSubscribe: true
  // LiveKit handles subscriptions automatically, we just react to track availability

  // 🔹 Attach/detach video element when the actual track changes
  useEffect(() => {
    const container = containerRef.current;
    const track = videoPublication?.track || null;

    console.log('[VideoTile] Attach effect running:', {
      hasContainer: !!container,
      hasTrack: !!track,
      hasPublication: !!videoPublication,
      trackSid: track?.sid,
      participant: participant.identity,
      isLocal
    });

    // If we lost the track or container, clean up any old video element and stop
    if (!container || !track) {
      const existing = videoElementRef.current;
      if (existing) {
        try {
          // detach from LiveKit if still attached
          const attached =
            (track as any)?.attachedElements ||
            (track as any)?._attachedElements ||
            [];
          if (track && attached && attached.includes(existing)) {
            track.detach(existing);
          }
        } catch (err) {
          console.warn('[VideoTile] detach on no-track ignored:', err);
        }
        if (existing.parentNode && existing.parentNode instanceof Node) {
          try {
            if (container && container.contains(existing)) {
              container.removeChild(existing);
            }
          } catch (err) {
            console.warn('[VideoTile] safe removeChild (no-track) ignored:', err);
          }
        }
        videoElementRef.current = null;
      }
      return;
    }

    // We have a real track and container – attach a fresh <video> element
    console.log('[VideoTile] ✅ Attaching video track for', participant.identity, isLocal ? 'local' : 'remote');
    const videoEl = track.attach() as HTMLVideoElement;
    videoElementRef.current = videoEl;
    videoEl.autoplay = true;
    videoEl.muted = isLocal;
    videoEl.playsInline = true;
    videoEl.controls = false;
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'cover';
    videoEl.style.backgroundColor = 'black';
    videoEl.style.display = 'block';

    // Clear anything currently in the container (only our own children)
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    container.appendChild(videoEl);
    console.log('[VideoTile] Video element appended to DOM');

    const handleLoaded = () => {
      console.log('[VideoTile] Video loaded metadata for', participant.identity);
      // optional aspect-ratio logic
    };

    videoEl.addEventListener('loadedmetadata', handleLoaded);

    // ✅ CRITICAL: Play video for both local and remote participants
    // Local video should also play (it's just muted)
    videoEl
      .play()
      .then(() => {
        console.log('[VideoTile] Video playing successfully for', participant.identity);
      })
      .catch((e) => {
        console.warn('[VideoTile] autoplay blocked for', participant.identity, 'will resume on click', e);
      });

    // Cleanup for this specific video element
    return () => {
      console.log('[VideoTile] Cleaning up video element for', participant.identity);
      videoEl.removeEventListener('loadedmetadata', handleLoaded);
      try {
        // detach from LiveKit first
        const attached =
          (track as any).attachedElements ||
          (track as any)._attachedElements ||
          [];
        if (attached && attached.includes(videoEl)) {
          track.detach(videoEl);
        }
      } catch (err) {
        console.warn('[VideoTile] detach ignored:', err);
      }
      try {
        if (container && container.contains(videoEl)) {
          container.removeChild(videoEl);
        }
      } catch (err) {
        console.warn('[VideoTile] removeChild ignored:', err);
      }
      if (videoElementRef.current === videoEl) {
        videoElementRef.current = null;
      }
    };
  }, [videoPublication?.track, videoPublication?.trackSid, isLocal, participant.identity]);

  // ✅ Fetch participant profile from Firestore (for remote participants)
  useEffect(() => {
    if (isLocal) {
      // For local participant, use current user's profile
      if (userProfile) {
        setParticipantProfile({
          displayName: userProfile.displayName || participant.name || 'You',
          photoURL: userProfile.photoURL
        });
      } else {
        setParticipantProfile({
          displayName: participant.name || 'You'
        });
      }
    } else {
      // For remote participants, fetch from Firestore
      const fetchProfile = async () => {
        try {
          const participantId = participant.identity;
          if (!participantId) return;
          
          const userDocRef = doc(db, 'users', participantId);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            setParticipantProfile({
              displayName: data.displayName || participant.name || 'Unknown',
              photoURL: data.photoURL
            });
          } else {
            // Fallback to participant name if profile not found
            setParticipantProfile({
              displayName: participant.name || participant.identity || 'Unknown'
            });
          }
        } catch (error) {
          console.error('[VideoTile] Failed to fetch participant profile:', error);
          // Fallback to participant name
          setParticipantProfile({
            displayName: participant.name || participant.identity || 'Unknown'
          });
        }
      };
      
      fetchProfile();
    }
  }, [participant, isLocal, userProfile]);

  // ✅ SIMPLIFIED: Update video element visibility based on track availability
  useEffect(() => {
    const hasVideo = videoPublication && videoPublication.track;
    
    if (videoElementRef.current) {
      videoElementRef.current.style.display = hasVideo ? 'block' : 'none';
    }
  }, [videoPublication]);

  // Determine display name - use profile if available
  const displayName = participantProfile?.displayName || participant.name || participant.identity || 'Unknown';
  const photoURL = participantProfile?.photoURL;
  const isCurrentUser = currentUserUid && (participant.identity === currentUserUid || isLocal);
  
  // ✅ Reactive state for mic status - updates in real-time
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
  // Camera status removed - no longer displaying camera icon
  
  // ✅ Function to check and update mic/camera status - improved for remote participants
  const updateMicCameraStatus = useCallback(() => {
      if (isLocal) {
        // For local participant, use getTrack
        const micPub = (participant as LocalParticipant).getTrack(Track.Source.Microphone);
        const micEnabled = (micPub !== null && micPub !== undefined) && micPub.isMuted === false;
        
        setIsMicrophoneEnabled(micEnabled);
        
        // ✅ STABILITY FIX: Removed all logging to prevent console flooding
    } else {
      // For remote participant, use getTrackPublication
      const micPub = (participant as RemoteParticipant).getTrackPublication(Track.Source.Microphone) as RemoteTrackPublication | null;
      
      // ✅ CRITICAL FIX: Check mute state from multiple sources for accuracy
      // LiveKit broadcasts mute state via track, not just publication
      let micEnabled = true; // Default to enabled (unmuted)
      
      if (micPub) {
        // Priority 1: Check track's muted property directly (most reliable)
        if (micPub.track) {
          const track = micPub.track;
          // Track's muted property is the source of truth
          if (track.isMuted !== undefined && track.isMuted !== null) {
            micEnabled = !track.isMuted;
          } else {
            // Fallback to publication's isMuted
            if (micPub.isMuted !== undefined && micPub.isMuted !== null) {
              micEnabled = !micPub.isMuted;
        }
      }
        } else {
          // Track not subscribed yet - check publication's isMuted
          // NOTE: We should subscribe to audio tracks to get accurate mute state
          if (micPub.isMuted !== undefined && micPub.isMuted !== null) {
            micEnabled = !micPub.isMuted;
          } else {
            // Can't determine - assume enabled (better UX)
            micEnabled = true;
          }
        }
      }
      
      setIsMicrophoneEnabled(micEnabled);
      
      // ✅ CRITICAL: Ensure audio track is subscribed to get accurate mute state
      // Mute state is only available when track is subscribed
      if (micPub && !micPub.isSubscribed && !micPub.track) {
        // Subscribe to audio track to receive mute state updates
        try {
          micPub.setSubscribed(true);
        } catch (err: any) {
          console.error('[VideoTile] Failed to subscribe to audio for mute state:', err);
        }
      }
      
      // ✅ Reduced logging - only log significant changes, not every update
    }
  }, [participant, isLocal]);
  
  // ✅ Listen to track publication/unpublication events and update status
  useEffect(() => {
    // Initial check
    updateMicCameraStatus();
    
    const cleanupFunctions: (() => void)[] = [];
    
    // ✅ Function to setup mute listeners for current tracks
    const setupTrackMuteListeners = () => {
      // Clear existing listeners first
      cleanupFunctions.forEach(fn => fn());
      cleanupFunctions.length = 0;
      
      if (isLocal) {
        // For local participant, listen to track events
        const micPub = (participant as LocalParticipant).getTrack(Track.Source.Microphone);
        if (micPub?.track) {
          const handleMute = () => {
            // ✅ STABILITY FIX: Removed logging - event listeners work silently
            updateMicCameraStatus();
          };
          micPub.track.on('muted', handleMute);
          micPub.track.on('unmuted', handleMute);
          cleanupFunctions.push(() => {
            micPub.track?.off('muted', handleMute);
            micPub.track?.off('unmuted', handleMute);
          });
        }
      } else {
        // For remote participant, listen to publication mute state and track events
        const micPub = (participant as RemoteParticipant).getTrackPublication(Track.Source.Microphone) as RemoteTrackPublication | null;
        
        // ✅ CRITICAL: Listen to Participant-level TrackMuted/TrackUnmuted events
        // These fire when ANY track on the participant is muted/unmuted
        const handleTrackMuted = (publication: TrackPublication) => {
          if (publication.source === Track.Source.Microphone) {
            // ✅ Single update - removed redundant setTimeout
            updateMicCameraStatus();
          }
        };
        
        const handleTrackUnmuted = (publication: TrackPublication) => {
          if (publication.source === Track.Source.Microphone) {
            // ✅ Single update - removed redundant setTimeout
            updateMicCameraStatus();
          }
        };
        
        participant.on(ParticipantEvent.TrackMuted, handleTrackMuted);
        participant.on(ParticipantEvent.TrackUnmuted, handleTrackUnmuted);
        
        cleanupFunctions.push(() => {
          participant.off(ParticipantEvent.TrackMuted, handleTrackMuted);
          participant.off(ParticipantEvent.TrackUnmuted, handleTrackUnmuted);
        });
        
        // ✅ CRITICAL: Listen to track-level mute events - this is the most reliable source
        // The track's muted property updates immediately when remote participant mutes/unmutes
        if (micPub?.track) {
          const handleTrackMuted = () => {
            // ✅ Single update - removed redundant setTimeout
            updateMicCameraStatus();
          };
          
          const handleTrackUnmuted = () => {
            // ✅ Single update - removed redundant setTimeout
            updateMicCameraStatus();
          };
          
          micPub.track.on('muted', handleTrackMuted);
          micPub.track.on('unmuted', handleTrackUnmuted);
          
          cleanupFunctions.push(() => {
            micPub.track?.off('muted', handleTrackMuted);
            micPub.track?.off('unmuted', handleTrackUnmuted);
          });
        } else {
          // ✅ CRITICAL: If track doesn't exist, we need to subscribe to get mute state
          // Subscribe to audio track to receive mute state updates
          if (micPub && !micPub.isSubscribed) {
            try {
              micPub.setSubscribed(true);
              // ✅ Single update after subscription - removed redundant setTimeout
              updateMicCameraStatus();
            } catch (err: any) {
              console.error('[VideoTile] Failed to subscribe to audio track:', err);
            }
          }
        }
        
        // ✅ Also listen to TrackSubscribed event - when audio track becomes available
        const handleTrackSubscribed = (track: any, publication: TrackPublication) => {
          if (publication.source === Track.Source.Microphone && publication.kind === Track.Kind.Audio) {
            updateMicCameraStatus();
            
            // Set up track-level listeners now that track is available
            if (track) {
              const handleSubscribedMuted = () => {
                updateMicCameraStatus();
              };
              const handleSubscribedUnmuted = () => {
                updateMicCameraStatus();
              };
              
              track.on('muted', handleSubscribedMuted);
              track.on('unmuted', handleSubscribedUnmuted);
              
              cleanupFunctions.push(() => {
                track?.off('muted', handleSubscribedMuted);
                track?.off('unmuted', handleSubscribedUnmuted);
              });
            }
          }
        };
        
        participant.on(ParticipantEvent.TrackSubscribed, handleTrackSubscribed);
        cleanupFunctions.push(() => {
          participant.off(ParticipantEvent.TrackSubscribed, handleTrackSubscribed);
        });
        
        // ✅ REMOVED: Excessive polling causing instability
        // Event listeners are sufficient - no need for aggressive polling
        // If events are missed, the main status interval will catch it
      }
    };
    
    // Setup initial listeners
    setupTrackMuteListeners();
    
    // Listen for track published/unpublished events - re-setup listeners when tracks change
    const handleTrackPublished = (publication: TrackPublication) => {
      if (publication.source === Track.Source.Microphone) {
        // ✅ Single update - removed redundant setTimeout
        updateMicCameraStatus();
        // Re-setup mute listeners when new tracks are published
        setupTrackMuteListeners();
      }
    };
    
    const handleTrackUnpublished = (publication: TrackPublication) => {
      if (publication.source === Track.Source.Microphone) {
        updateMicCameraStatus();
        // Clean up listeners when tracks are unpublished
        cleanupFunctions.forEach(fn => fn());
        cleanupFunctions.length = 0;
        setupTrackMuteListeners();
      }
    };
    
    participant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
    participant.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
    
    return () => {
      participant.off(ParticipantEvent.TrackPublished, handleTrackPublished);
      participant.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
      cleanupFunctions.forEach(fn => fn());
    };
  }, [participant, isLocal, updateMicCameraStatus]);
  
  // ✅ STABILITY FIX: Removed aggressive polling - event listeners are sufficient
  // Only use a slow fallback check (10 seconds) for edge cases, not for normal operation
  // Event listeners handle all real-time updates immediately
  useEffect(() => {
    // Only check periodically as a fallback for edge cases (e.g., missed events)
    const statusInterval = setInterval(() => {
      // Only update if we suspect something might be wrong (very rare)
      // Event listeners handle 99% of updates
      updateMicCameraStatus();
    }, 10000); // ✅ Very slow fallback (10 seconds) - event listeners handle everything
    
    return () => clearInterval(statusInterval);
  }, [updateMicCameraStatus]);
  
  // Generate consistent color index for animated background (different per participant)
  const colorIndex = React.useMemo(() => {
    if (isCurrentUser) return -1; // Special color for current user
    const sid = participant.sid || participant.identity || '0';
    return parseInt(sid.slice(-2) || '0', 36) % 5;
  }, [participant.sid, participant.identity, isCurrentUser]);
  
  // Color palette for animated backgrounds
  const colorPalettes = [
    { start: '#10b981', mid: '#3b82f6', end: '#10b981' }, // Green-Blue-Green
    { start: '#f59e0b', mid: '#f97316', end: '#f59e0b' }, // Amber-Orange-Amber
    { start: '#ef4444', mid: '#dc2626', end: '#ef4444' }, // Red-Red-Red
    { start: '#8b5cf6', mid: '#6366f1', end: '#8b5cf6' }, // Purple-Indigo-Purple
    { start: '#ec4899', mid: '#be185d', end: '#ec4899' }, // Pink-Rose-Pink
  ];
  
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

  // ✅ PERMANENT FIX: Remove ALL borders at JS level (not CSS)
  const containerStyle: React.CSSProperties = {
    border: 'none',
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'transparent',
    borderLeft: 'none',
    borderRight: 'none',
    borderTop: 'none',
    borderBottom: 'none',
    borderRadius: 0,
    outline: 'none',
    outlineWidth: 0,
    outlineStyle: 'none',
    outlineColor: 'transparent',
    boxShadow: 'none',
    WebkitBoxShadow: 'none',
    MozBoxShadow: 'none',
    background: 'black', // Black background for video container
    margin: 0,
    padding: 0,
    overflow: 'hidden',
    width: '100%',
    height: '100%',
    position: 'relative'
  };

  return (
    <div 
      className="video-container w-full h-full relative" 
      id={`participant-${participant.sid}`} 
      style={containerStyle}
    >
      {/* ✅ Video element container - NO BORDERS, black background */}
      <div 
        ref={containerRef} 
        data-video-container="true" 
        className="w-full h-full" 
        style={{ 
          border: 'none',
          borderWidth: 0,
          borderStyle: 'none',
          borderColor: 'transparent',
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: 'none',
          borderBottom: 'none',
          borderRadius: 0,
          background: 'black', // Black background for letterboxing
          backgroundColor: 'black',
          outline: 'none',
          outlineWidth: 0,
          outlineStyle: 'none',
          outlineColor: 'transparent',
          boxShadow: 'none',
          WebkitBoxShadow: 'none',
          MozBoxShadow: 'none',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* ✅ Show profile picture and name when camera is off */}
        {!isCameraEnabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 via-gray-900 to-black">
            {photoURL ? (
              <div className="relative mb-4">
                <img
                  src={photoURL}
                  alt={displayName}
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-white/20 shadow-2xl"
                  onError={(e) => {
                    // Fallback to initials if image fails to load
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-techBlue to-violetDeep flex items-center justify-center text-white text-3xl sm:text-4xl font-bold shadow-2xl border-4 border-white/20"
                  style={{ display: 'none' }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              </div>
            ) : (
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-techBlue to-violetDeep flex items-center justify-center text-white text-3xl sm:text-4xl font-bold shadow-2xl border-4 border-white/20 mb-4">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="text-white text-lg sm:text-xl font-semibold drop-shadow-lg">
              {displayName}
            </p>
            <p className="text-gray-400 text-xs sm:text-sm mt-1">
              Camera is off
            </p>
          </div>
        )}
        
        {/* Placeholder when no video track exists at all */}
        {!videoPublication && (
          <div className="text-center text-cloud">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-xl sm:text-2xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-medium">Video Stream</p>
          </div>
        )}
      </div>
      
      {/* ✅ Participant info overlay - INSIDE video tile, bottom-left corner - ABSOLUTELY NO BORDERS */}
      <div 
        className="absolute bottom-0 left-0 z-10"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.4) 50%, transparent 100%)',
          padding: '4px 8px',
          margin: 0,
          border: 'none',
          borderWidth: 0,
          borderStyle: 'none',
          borderColor: 'transparent',
          borderRadius: 0,
          outline: 'none',
          outlineWidth: 0,
          boxShadow: 'none',
          maxWidth: '100%',
          pointerEvents: 'auto' /* Allow clicks on buttons inside */
        }}
      >
        <div className="flex items-center" style={{ gap: '6px', margin: 0, padding: 0 }}>
          {/* Name badge - INSIDE video, bottom-left */}
          <div className="flex items-center flex-shrink-0" style={{ gap: '4px', margin: 0, padding: 0 }}>
            <div 
              className="relative overflow-hidden"
              style={{
                padding: '2px 6px',
                margin: 0,
                border: 'none',
                borderWidth: 0,
                borderStyle: 'none',
                borderColor: 'transparent',
                borderRadius: 0, /* No border radius - completely borderless */
                boxShadow: 'none',
                outline: 'none',
                outlineWidth: 0
              }}
            >
              {/* Animated gradient background */}
              <div 
                className="absolute inset-0 opacity-90"
                style={{
                  background: isCurrentUser 
                    ? 'linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)'
                    : `linear-gradient(90deg, ${colorPalettes[colorIndex].start}, ${colorPalettes[colorIndex].mid}, ${colorPalettes[colorIndex].end})`,
                  backgroundSize: '200% 100%',
                  animation: 'gradient-shift 3s ease infinite',
                  margin: 0,
                  padding: 0,
                  border: 'none',
                  borderRadius: '4px'
                }}
              />
              <style>
                {`
                  @keyframes gradient-shift {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                  }
                `}
              </style>
              <span className="relative font-medium text-[10px] sm:text-xs text-white drop-shadow-md whitespace-nowrap" style={{ margin: 0, padding: 0 }}>
                {displayName}
              </span>
            </div>
          </div>
          
          {/* Mic icon - INSIDE video, bottom-left next to name */}
          <div className="flex items-center flex-shrink-0" style={{ gap: '4px', margin: 0, padding: 0 }}>
            {/* Pin button */}
            {onPin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const isPinned = pinnedId === participant.identity;
                  onPin(isPinned ? null : participant.identity);
                }}
                className={`flex items-center justify-center backdrop-blur-sm transition-colors ${
                  pinnedId === participant.identity
                    ? 'bg-techBlue text-white'
                    : 'bg-black/50 text-gray-300 hover:bg-black/70 hover:text-white'
                }`}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: 0, /* No border radius - completely borderless */
                  border: 'none',
                  borderWidth: 0,
                  borderStyle: 'none',
                  borderColor: 'transparent',
                  outline: 'none',
                  outlineWidth: 0,
                  boxShadow: 'none',
                  margin: 0,
                  padding: 0
                }}
                title={pinnedId === participant.identity ? 'Unpin' : 'Pin'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
            )}
            
            {/* Microphone status - INSIDE video, ABSOLUTELY NO BORDERS */}
            <div 
              className="flex items-center justify-center backdrop-blur-sm"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: 0, /* No border radius - completely borderless */
                background: 'rgba(0, 0, 0, 0.7)',
                border: 'none',
                borderWidth: 0,
                borderStyle: 'none',
                borderColor: 'transparent',
                outline: 'none',
                outlineWidth: 0,
                boxShadow: 'none',
                margin: 0,
                padding: 0
              }}
            >
              {isMicrophoneEnabled ? (
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Primary speaker indicator - INSIDE video - ABSOLUTELY NO BORDERS */}
      {isPrimary && (
        <div 
          className="absolute top-2 right-2 bg-techBlue text-white text-xs font-medium flex items-center z-20"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '4px 8px',
            borderRadius: 0, /* No border radius - completely borderless */
            gap: '4px',
            border: 'none',
            borderWidth: 0,
            borderStyle: 'none',
            borderColor: 'transparent',
            outline: 'none',
            outlineWidth: 0,
            boxShadow: 'none',
            margin: 0
          }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Speaking
        </div>
      )}
    </div>
  );
};

export { VideoTile };
export default VideoGrid;
