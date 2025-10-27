import React from 'react';

interface Participant {
  id: string;
  uid: string;
  role: 'host' | 'speaker' | 'viewer';
  joinedAt: any;
  leftAt?: any;
}

interface VideoGridProps {
  participants: Participant[];
}

const VideoGrid: React.FC<VideoGridProps> = ({ participants }) => {
  const activeParticipants = participants.filter(p => !p.leftAt);

  if (activeParticipants.length === 0) {
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
    <div className="video-grid gap-4 h-full">
      {activeParticipants.map((participant) => (
        <VideoTile key={participant.id} participant={participant} />
      ))}
    </div>
  );
};

interface VideoTileProps {
  participant: Participant;
}

const VideoTile: React.FC<VideoTileProps> = ({ participant }) => {
  // TODO: Integrate with LiveKit to show actual video streams
  const isLocalParticipant = participant.uid === 'local'; // This would be determined by LiveKit
  
  return (
    <div className="video-container aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Placeholder for video element */}
      <div className="w-full h-full bg-gradient-to-br from-techBlue to-violetDeep flex items-center justify-center">
        <div className="text-center text-cloud">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-2xl font-bold">
              {participant.uid.charAt(0).toUpperCase()}
            </span>
          </div>
          <p className="text-sm font-medium">Video Stream</p>
        </div>
      </div>
      
      {/* Participant info overlay */}
      <div className="participant-info">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm">
              {participant.uid} {isLocalParticipant && '(You)'}
            </span>
            {participant.role === 'host' && (
              <span className="bg-goldBright text-midnight px-2 py-1 rounded text-xs font-medium">
                Host
              </span>
            )}
          </div>
          
          <div className="participant-status">
            <div className="status-indicator"></div>
            <div className="status-indicator muted"></div>
            <div className="status-indicator camera-off"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoGrid;



