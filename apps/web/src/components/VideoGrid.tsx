import React, { useEffect, useRef, useState } from 'react';
import { useLiveKit } from '../contexts/LiveKitContext';
import { useAuth } from '../contexts/AuthContext';
import { RemoteParticipant, LocalParticipant, Track, TrackPublication, ParticipantEvent, RemoteTrackPublication } from 'livekit-client';

const VideoGrid: React.FC = () => {
  const { participants, localParticipant } = useLiveKit();
  const { user } = useAuth();

  // Combine local and remote participants
  const allParticipants: (LocalParticipant | RemoteParticipant)[] = [];
  if (localParticipant) {
    allParticipants.push(localParticipant);
  }
  participants.forEach((participant) => {
    allParticipants.push(participant);
  });

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

  return (
    <div className="video-grid" data-count={allParticipants.length}>
      {allParticipants.map((participant) => (
        <VideoTile key={participant.identity || participant.sid} participant={participant} currentUserUid={user?.uid} />
      ))}
    </div>
  );
};

interface VideoTileProps {
  participant: LocalParticipant | RemoteParticipant;
  currentUserUid?: string;
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
      if (publication.kind === Track.Kind.Video) {
        setVideoPublication(publication);
      }
    };

    const handleTrackUnpublished = (publication: TrackPublication) => {
      console.log('[VideoTile] Track unpublished:', publication.kind, 'from', participant.identity);
      if (publication.kind === Track.Kind.Video) {
        setVideoPublication(null);
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
  useEffect(() => {
    if (videoPublication?.track) return; // Skip if we already have a track
    
    const checkInterval = setInterval(() => {
      const vidPub: TrackPublication | null = 
        (participant.getTrack(Track.Source.Camera) as TrackPublication) ||
        (participant.getTrack(Track.Source.Unknown) as TrackPublication) ||
        null;
      
      if (vidPub) {
        // For remote participants, make sure track is subscribed
        if (!isLocal) {
          const remotePub = vidPub as any as RemoteTrackPublication;
          if (remotePub && !remotePub.isSubscribed && vidPub.track) {
            console.log('[VideoTile] Found unsubscribed remote track, subscribing...');
            (async () => {
              try {
                await remotePub.setSubscribed(true);
              } catch (err: any) {
                console.error('[VideoTile] Failed to subscribe:', err);
              }
            })();
          }
        }
        
        if (vidPub.track && !videoPublication) {
          setVideoPublication(vidPub);
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

    // Clear existing content and append video element
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(element);
      
      // Try to play (for remote tracks)
      if (!isLocal) {
        element.play().catch((err) => {
          console.warn('[VideoTile] Autoplay blocked for remote video:', err);
          // Will play on user interaction
        });
      }
    }

    return () => {
      if (videoPublication?.track) {
        console.log('[VideoTile] Detaching video track for', isLocal ? 'local' : 'remote');
        videoPublication.track.detach();
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
