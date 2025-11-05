import React, { useMemo } from 'react';
import { LocalParticipant, RemoteParticipant } from 'livekit-client';
import { VideoTile } from '../components/VideoGrid';

interface GalleryLayoutProps {
  allParticipants: (LocalParticipant | RemoteParticipant)[];
  currentUserUid?: string;
  onPin?: (participantId: string | null) => void;
  pinnedId: string | null;
}

const GalleryLayout: React.FC<GalleryLayoutProps> = ({
  allParticipants,
  currentUserUid,
  onPin,
  pinnedId,
}) => {
  // Calculate grid columns based on participant count
  const gridCols = useMemo(() => {
    const count = allParticipants.length;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 2;
    if (count <= 9) return 3;
    if (count <= 16) return 4;
    return 5;
  }, [allParticipants.length]);

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
    <div
      className="h-full w-full grid gap-2 p-2"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
      }}
    >
      {allParticipants.map((participant) => (
        <div
          key={participant.identity || participant.sid}
          className="relative rounded-lg overflow-hidden transition-all duration-300 hover:ring-2 hover:ring-techBlue"
        >
          <VideoTile
            participant={participant}
            currentUserUid={currentUserUid}
            onPin={onPin}
            pinnedId={pinnedId}
          />
        </div>
      ))}
    </div>
  );
};

export default GalleryLayout;

