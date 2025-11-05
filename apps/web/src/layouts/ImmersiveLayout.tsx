import React from 'react';
import { LocalParticipant, RemoteParticipant } from 'livekit-client';
import { VideoTile } from '../components/VideoGrid';

interface ImmersiveLayoutProps {
  allParticipants: (LocalParticipant | RemoteParticipant)[];
  primaryId: string | null;
  currentUserUid?: string;
  onPin?: (participantId: string | null) => void;
  pinnedId: string | null;
}

const ImmersiveLayout: React.FC<ImmersiveLayoutProps> = ({
  allParticipants,
  primaryId,
  currentUserUid,
  onPin,
  pinnedId,
}) => {
  // Find primary participant (center stage)
  const primaryParticipant =
    allParticipants.find((p) => p.identity === primaryId) || allParticipants[0];
  
  // Other participants (curved row below)
  const otherParticipants = allParticipants.filter(
    (p) => p.identity !== primaryParticipant?.identity
  );

  if (allParticipants.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400">
          <p>Waiting for participants to join...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      {/* Blurred background effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-midnight via-techBlue to-violetDeep opacity-50 blur-3xl" />
      
      {/* Main content */}
      <div className="relative h-full flex flex-col">
        {/* Primary speaker - center stage */}
        <div className="flex-1 flex items-center justify-center p-4">
          {primaryParticipant && (
            <div className="w-full max-w-4xl h-full rounded-2xl overflow-hidden shadow-2xl transition-all duration-500">
              <VideoTile
                participant={primaryParticipant}
                currentUserUid={currentUserUid}
                isPrimary={true}
                onPin={onPin}
                pinnedId={pinnedId}
              />
            </div>
          )}
        </div>

        {/* Secondary participants - curved row below */}
        {otherParticipants.length > 0 && (
          <div className="h-40 bg-gray-900/30 backdrop-blur-md border-t border-gray-700/50">
            <div className="flex items-center justify-center h-full gap-3 px-4 py-3">
              {otherParticipants.map((participant, index) => {
                // Create curved positioning effect
                const offset = index - (otherParticipants.length - 1) / 2;
                const rotation = offset * 5; // Slight rotation
                const scale = 1 - Math.abs(offset) * 0.1; // Scale based on position
                
                return (
                  <div
                    key={participant.identity || participant.sid}
                    className="flex-shrink-0 w-32 h-full rounded-xl overflow-hidden transition-all duration-300 hover:scale-110"
                    style={{
                      transform: `rotateY(${rotation}deg) scale(${scale})`,
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    <VideoTile
                      participant={participant}
                      currentUserUid={currentUserUid}
                      isPrimary={false}
                      onPin={onPin}
                      pinnedId={pinnedId}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImmersiveLayout;

