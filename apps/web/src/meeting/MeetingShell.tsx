import React, { useState, useEffect, useMemo } from 'react';
import { useLiveKit } from '../contexts/LiveKitContext';
import { useAuth } from '../contexts/AuthContext';
import { LocalParticipant, RemoteParticipant, Track, TrackPublication, ParticipantEvent, RoomEvent } from 'livekit-client';
import { ViewMode, SpotlightData } from '../types/viewModes';
import { useActiveSpeaker } from '../hooks/useActiveSpeaker';
import { usePrimarySelection } from '../hooks/usePrimarySelection';
import SpeakerLayout from '../layouts/SpeakerLayout';
import GalleryLayout from '../layouts/GalleryLayout';
import MultiLayout from '../layouts/MultiLayout';
import ImmersiveLayout from '../layouts/ImmersiveLayout';
import VideoGrid from '../components/VideoGrid';

interface ActiveScreenShare {
  participant: LocalParticipant | RemoteParticipant;
  publication: TrackPublication;
}

interface MeetingShellProps {
  viewMode: ViewMode;
}

const MeetingShell: React.FC<MeetingShellProps> = ({ viewMode }) => {
  const { room, participants, localParticipant } = useLiveKit();
  const { user } = useAuth();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [activeScreenShares, setActiveScreenShares] = useState<ActiveScreenShare[]>([]);

  // Combine all participants
  const allParticipants = useMemo(() => {
    const all: (LocalParticipant | RemoteParticipant)[] = [];
    if (localParticipant) {
      all.push(localParticipant);
    }
    participants.forEach((p) => {
      all.push(p);
    });
    return all;
  }, [localParticipant, participants]);

  // Active speaker detection
  const speakerScores = useActiveSpeaker(room, localParticipant, participants);

  // Primary selection with hysteresis
  const primaryId = usePrimarySelection(speakerScores, pinnedId, spotlightId, allParticipants);

  // Track screen shares
  useEffect(() => {
    if (!room) return;

    const updateScreenShares = () => {
      const screenShares: ActiveScreenShare[] = [];
      
      if (localParticipant) {
        const screenPub = localParticipant.getTrack(Track.Source.ScreenShare) as TrackPublication | null;
        if (screenPub && screenPub.track) {
          screenShares.push({ participant: localParticipant, publication: screenPub });
        }
      }

      for (const participant of participants.values()) {
        if (screenShares.length >= 2) break;
        const screenPub = participant.getTrack(Track.Source.ScreenShare) as TrackPublication | null;
        if (screenPub && screenPub.track && screenPub.isSubscribed) {
          if (!screenShares.some(ss => ss.participant.identity === participant.identity)) {
            screenShares.push({ participant, publication: screenPub });
          }
        }
      }

      setActiveScreenShares(screenShares.slice(0, 2));
    };

    updateScreenShares();

    const handleTrackPublished = (publication: TrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) {
        updateScreenShares();
      }
    };

    const handleTrackUnpublished = (publication: TrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) {
        updateScreenShares();
      }
    };

    if (localParticipant) {
      localParticipant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
      localParticipant.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
    }

    const unsubscribeFunctions: (() => void)[] = [];
    participants.forEach((participant) => {
      participant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
      participant.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
      unsubscribeFunctions.push(() => {
        participant.off(ParticipantEvent.TrackPublished, handleTrackPublished);
        participant.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
      });
    });

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

  // Listen for spotlight data channel messages (host can spotlight participants)
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as SpotlightData;
        if (data.participantId && data.timestamp) {
          setSpotlightId(data.participantId);
        }
      } catch (err) {
        // Not a spotlight message, ignore
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  // Handle screen share - screen share becomes primary
  // When screen share is active, use VideoGrid which handles screen share layout
  const hasScreenShare = activeScreenShares.length > 0;

  if (allParticipants.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400">
          <p>Waiting for participants to join...</p>
        </div>
      </div>
    );
  }

  // If screen share is active, use the existing VideoGrid layout (handles screen share + cameras)
  if (hasScreenShare) {
    return <VideoGrid />;
  }

  // Render based on view mode
  const renderLayout = () => {
    switch (viewMode) {
      case 'speaker':
        return (
          <SpeakerLayout
            allParticipants={allParticipants}
            primaryId={primaryId}
            currentUserUid={user?.uid}
            onPin={setPinnedId}
            pinnedId={pinnedId}
          />
        );
      case 'gallery':
        return (
          <GalleryLayout
            allParticipants={allParticipants}
            currentUserUid={user?.uid}
            onPin={setPinnedId}
            pinnedId={pinnedId}
          />
        );
      case 'multi-speaker':
        return (
          <MultiLayout
            allParticipants={allParticipants}
            primaryId={primaryId}
            speakerScores={speakerScores}
            currentUserUid={user?.uid}
            onPin={setPinnedId}
            pinnedId={pinnedId}
          />
        );
      case 'immersive':
        return (
          <ImmersiveLayout
            allParticipants={allParticipants}
            primaryId={primaryId}
            currentUserUid={user?.uid}
            onPin={setPinnedId}
            pinnedId={pinnedId}
          />
        );
      default:
        return (
          <GalleryLayout
            allParticipants={allParticipants}
            currentUserUid={user?.uid}
            onPin={setPinnedId}
            pinnedId={pinnedId}
          />
        );
    }
  };

  return (
    <div className="h-full w-full relative">
      {renderLayout()}
    </div>
  );
};

export default MeetingShell;

