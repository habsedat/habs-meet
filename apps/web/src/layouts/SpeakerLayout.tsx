import React from 'react';
import { LocalParticipant, RemoteParticipant } from 'livekit-client';
import { VideoTile } from '../components/VideoGrid';

interface SpeakerLayoutProps {
  allParticipants: (LocalParticipant | RemoteParticipant)[];
  primaryId: string | null;
  currentUserUid?: string;
  onPin?: (participantId: string | null) => void;
  pinnedId: string | null;
}

const SpeakerLayout: React.FC<SpeakerLayoutProps> = ({
  allParticipants,
  primaryId,
  currentUserUid,
  onPin,
  pinnedId,
}) => {
  // Find primary participant (default to first if none)
  const primaryParticipant =
    allParticipants.find((p) => p.identity === primaryId) || allParticipants[0];
  
  // Other participants (filmstrip)
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
    <div className="h-full w-full flex flex-col">
      {/* Primary speaker - reduced width, centered */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {primaryParticipant && (
          <div 
            className="relative transition-opacity duration-300"
            style={{
              width: '70%', /* Reduced width - 70% of container */
              maxWidth: '1200px', /* Maximum width for very large screens */
              height: '100%',
              margin: '0 auto' /* Center horizontally */
            }}
          >
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

      {/* Filmstrip - horizontal scrollable row at bottom - NO BORDERS */}
      {otherParticipants.length > 0 && (
        <div className="h-24 bg-gray-900/50 overflow-x-auto overflow-y-hidden" style={{ border: 'none', borderTop: 'none' }}>
          <div className="flex items-center h-full gap-2 px-2 py-2">
            {otherParticipants.map((participant) => (
              <div
                key={participant.identity || participant.sid}
                className="flex-shrink-0 w-32 h-full overflow-hidden transition-transform hover:scale-105"
                style={{ borderRadius: 0, border: 'none' }}
              >
                <VideoTile
                  participant={participant}
                  currentUserUid={currentUserUid}
                  isPrimary={false}
                  onPin={onPin}
                  pinnedId={pinnedId}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeakerLayout;


