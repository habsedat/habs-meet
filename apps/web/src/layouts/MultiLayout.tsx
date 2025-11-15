import React, { useMemo } from 'react';
import { LocalParticipant, RemoteParticipant } from 'livekit-client';
import { ParticipantWithScore } from '../types/viewModes';
import { VideoTile } from '../components/VideoGrid';

interface MultiLayoutProps {
  allParticipants: (LocalParticipant | RemoteParticipant)[];
  primaryId: string | null;
  speakerScores: Map<string, ParticipantWithScore>;
  currentUserUid?: string;
  onPin?: (participantId: string | null) => void;
  pinnedId: string | null;
}

const MultiLayout: React.FC<MultiLayoutProps> = ({
  allParticipants,
  primaryId,
  speakerScores,
  currentUserUid,
  onPin,
  pinnedId,
}) => {
  // Find primary participant
  const primaryParticipant =
    allParticipants.find((p) => p.identity === primaryId) || allParticipants[0];

  // Get top 3-4 active speakers (excluding primary)
  const activeSpeakers = useMemo(() => {
    const sorted = Array.from(speakerScores.entries())
      .filter(([id]) => id !== primaryParticipant?.identity)
      .sort(([, a], [, b]) => b.score - a.score)
      .slice(0, 3) // Top 3 others
      .map(([id]) => {
        return allParticipants.find((p) => p.identity === id);
      })
      .filter((p): p is LocalParticipant | RemoteParticipant => p !== undefined);

    // Fill remaining slots with other participants if needed
    const remaining = allParticipants.filter(
      (p) =>
        p.identity !== primaryParticipant?.identity &&
        !sorted.some((a) => a && a.identity === p.identity)
    );
    
    return [...sorted, ...remaining].slice(0, 3);
  }, [speakerScores, allParticipants, primaryParticipant]);

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
      <div className="flex-1 min-h-0 flex items-center justify-center mb-2">
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

      {/* Secondary speakers - grid below - NO BORDERS */}
      {activeSpeakers.length > 0 && (
        <div className="h-32 grid grid-cols-3 gap-2 px-2 pb-2">
          {activeSpeakers.map((participant) => (
            <div
              key={participant.identity || participant.sid}
              className="overflow-hidden transition-transform hover:scale-105"
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
      )}
    </div>
  );
};

export default MultiLayout;

