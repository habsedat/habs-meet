import { useEffect, useState, useRef } from 'react';
import { Room, RoomEvent, Participant, LocalParticipant, RemoteParticipant } from 'livekit-client';
import { ParticipantWithScore } from '../types/viewModes';

/**
 * Hook to detect active speakers using LiveKit's ActiveSpeakersChanged event
 * and compute per-participant speaking scores with decay
 */
export const useActiveSpeaker = (
  room: Room | null,
  localParticipant: LocalParticipant | null,
  participants: Map<string, RemoteParticipant>
): Map<string, ParticipantWithScore> => {
  const [speakerScores, setSpeakerScores] = useState<Map<string, ParticipantWithScore>>(new Map());
  const scoresRef = useRef<Map<string, number>>(new Map());
  const decayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update scores with decay
  useEffect(() => {
    if (!room) return;

    const decayScores = () => {
      scoresRef.current.forEach((score, participantId) => {
        const newScore = score * 0.85; // DECAY constant
        if (newScore < 0.01) {
          scoresRef.current.delete(participantId);
        } else {
          scoresRef.current.set(participantId, newScore);
        }
      });

      // Update state with new scores
      const updated = new Map<string, ParticipantWithScore>();
      
      // Add local participant
      if (localParticipant) {
        const localScore = scoresRef.current.get(localParticipant.identity) || 0;
        updated.set(localParticipant.identity, {
          participant: localParticipant,
          score: localScore,
          isSpeaking: localScore > 0.1,
        });
      }

      // Add remote participants
      participants.forEach((participant) => {
        const score = scoresRef.current.get(participant.identity) || 0;
        updated.set(participant.identity, {
          participant,
          score,
          isSpeaking: score > 0.1,
        });
      });

      setSpeakerScores(updated);
    };

    // Run decay every 100ms for smooth updates
    decayIntervalRef.current = setInterval(decayScores, 100);

    return () => {
      if (decayIntervalRef.current) {
        clearInterval(decayIntervalRef.current);
      }
    };
  }, [room, localParticipant, participants]);

  // Listen for ActiveSpeakersChanged event
  useEffect(() => {
    if (!room) return;

    const handleActiveSpeakersChanged = (speakers: Participant[]) => {
      // Reset all current scores
      const allParticipants = new Map<string, Participant>();
      
      if (localParticipant) {
        allParticipants.set(localParticipant.identity, localParticipant);
      }
      participants.forEach((p) => {
        allParticipants.set(p.identity, p);
      });

      // Boost scores for active speakers
      speakers.forEach((speaker) => {
        const currentScore = scoresRef.current.get(speaker.identity) || 0;
        const boostedScore = currentScore * 1.0 + 1.0; // BOOST constant
        scoresRef.current.set(speaker.identity, boostedScore);
      });

      // Update state immediately
      const updated = new Map<string, ParticipantWithScore>();
      
      if (localParticipant) {
        const localScore = scoresRef.current.get(localParticipant.identity) || 0;
        updated.set(localParticipant.identity, {
          participant: localParticipant,
          score: localScore,
          isSpeaking: speakers.some(s => s.identity === localParticipant.identity),
        });
      }

      participants.forEach((participant) => {
        const score = scoresRef.current.get(participant.identity) || 0;
        updated.set(participant.identity, {
          participant,
          score,
          isSpeaking: speakers.some(s => s.identity === participant.identity),
        });
      });

      setSpeakerScores(updated);
    };

    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
    };
  }, [room, localParticipant, participants]);

  return speakerScores;
};

