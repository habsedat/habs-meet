import React, { useEffect, useRef, useState } from 'react';
import { useLiveKit } from '../contexts/LiveKitContext';
import { useAuth } from '../contexts/AuthContext';
import { RemoteParticipant, LocalParticipant, Track, TrackPublication, ParticipantEvent } from 'livekit-client';

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
    <div className="video-grid gap-4 h-full p-4">
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
      if (publication.kind === Track.Kind.Video) {
        setVideoPublication(publication);
      }
    };

    const handleTrackUnpublished = (publication: TrackPublication) => {
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
  useEffect(() => {
    if (!isLocal || videoPublication) return; // Only check for local if no track yet
    
    const checkInterval = setInterval(() => {
      const vidPub: TrackPublication | null = 
        (participant.getTrack(Track.Source.Camera) as TrackPublication) ||
        (participant.getTrack(Track.Source.Unknown) as TrackPublication) ||
        null;
      
      if (vidPub && !videoPublication) {
        setVideoPublication(vidPub);
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [participant, isLocal, videoPublication]);

  // Attach video track when publication changes
  useEffect(() => {
    if (!containerRef.current) return;
    
    if (videoPublication && videoPublication.track) {
      const element = videoPublication.track.attach();
      element.autoplay = true;
      element.setAttribute('playsInline', 'true');
      element.muted = isLocal; // Mute local video to prevent feedback
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.objectFit = 'cover';

      // Clear existing content and append video element
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(element);
      }
    }

    return () => {
      if (videoPublication?.track && containerRef.current) {
        videoPublication.track.detach();
      }
    };
  }, [videoPublication, isLocal]);

  // Determine display name
  const displayName = participant.name || participant.identity || 'Unknown';
  const isCurrentUser = currentUserUid && (participant.identity === currentUserUid || isLocal);

  return (
    <div className="video-container aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Video element container */}
      <div ref={containerRef} className="w-full h-full bg-gradient-to-br from-techBlue to-violetDeep flex items-center justify-center">
        {/* Placeholder when no video */}
        <div className="text-center text-cloud">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-2xl font-bold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <p className="text-sm font-medium">Video Stream</p>
        </div>
      </div>
      
      {/* Participant info overlay */}
      {isCurrentUser && (
        <div className="absolute top-4 left-4 z-10">
          <div className="relative bg-gradient-to-r from-techBlue via-violetDeep to-techBlue bg-[length:200%_100%] animate-[gradient_3s_ease_infinite] px-4 py-2 rounded-lg shadow-lg">
            <style>
              {`
                @keyframes gradient {
                  0%, 100% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                }
              `}
            </style>
            <span className="font-semibold text-sm text-cloud drop-shadow-md">
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
