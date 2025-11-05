import { useState, useEffect, useRef } from 'react';
import { LocalParticipant, RemoteParticipant } from 'livekit-client';
import { ParticipantWithScore, HYSTERESIS_CONFIG } from '../types/viewModes';

interface PrimarySelectionState {
  primaryId: string | null;
  timestamp: number;
  lastSwitchTime: number;
  lastActivityTime: number;
}

/**
 * Hook to select primary speaker using hysteresis logic:
 * - Switch only if new speaker's score ≥ 1.25 × current
 * - Dwell time: 1.5s before switching
 * - Cooldown: 2s between switches
 * - Silence timeout: 5s - keep current if no one speaks
 */
export const usePrimarySelection = (
  speakerScores: Map<string, ParticipantWithScore>,
  pinnedId: string | null,
  spotlightId: string | null,
  allParticipants: (LocalParticipant | RemoteParticipant)[]
): string | null => {
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const stateRef = useRef<PrimarySelectionState>({
    primaryId: null,
    timestamp: Date.now(),
    lastSwitchTime: 0,
    lastActivityTime: Date.now(),
  });

  // Priority: Pinned > Spotlight > Active Speaker
  useEffect(() => {
    if (pinnedId) {
      const pinned = allParticipants.find(p => p.identity === pinnedId);
      if (pinned) {
        setPrimaryId(pinnedId);
        stateRef.current.primaryId = pinnedId;
        stateRef.current.lastActivityTime = Date.now();
        return;
      }
    }

    if (spotlightId) {
      const spotlight = allParticipants.find(p => p.identity === spotlightId);
      if (spotlight) {
        setPrimaryId(spotlightId);
        stateRef.current.primaryId = spotlightId;
        stateRef.current.lastActivityTime = Date.now();
        return;
      }
    }

    // Active speaker selection with hysteresis
    const now = Date.now();
    const currentPrimary = speakerScores.get(stateRef.current.primaryId || '');
    const currentScore = currentPrimary?.score || 0;

    // Find the best candidate
    let bestCandidate: ParticipantWithScore | null = null;
    let bestScore = 0;

    speakerScores.forEach((data: ParticipantWithScore) => {
      if (data.score > bestScore) {
        bestScore = data.score;
        bestCandidate = data;
      }
    });

    // Update activity time if someone is speaking
    if (bestScore > 0.1) {
      stateRef.current.lastActivityTime = now;
    }

    // Check if we've had silence for too long
    const timeSinceActivity = now - stateRef.current.lastActivityTime;
    if (timeSinceActivity > HYSTERESIS_CONFIG.SILENCE_TIMEOUT && stateRef.current.primaryId) {
      // Keep current primary during silence
      return;
    }

    if (!bestCandidate) {
      // No active speakers - keep current or select first participant
      if (!stateRef.current.primaryId && allParticipants.length > 0) {
        const first = allParticipants[0];
        setPrimaryId(first.identity);
        stateRef.current.primaryId = first.identity;
      }
      return;
    }

    // TypeScript type narrowing - bestCandidate is guaranteed to be ParticipantWithScore here
    const candidate: ParticipantWithScore = bestCandidate;
    const bestParticipant = candidate.participant;

    // If we don't have a primary yet, set it immediately
    if (!stateRef.current.primaryId) {
      setPrimaryId(bestParticipant.identity);
      stateRef.current.primaryId = bestParticipant.identity;
      stateRef.current.lastSwitchTime = now;
      stateRef.current.timestamp = now;
      return;
    }

    // Check if this is a different participant
    if (bestParticipant.identity === stateRef.current.primaryId) {
      // Same participant - reset timestamp if it was tracking a different candidate
      if (stateRef.current.timestamp !== 0) {
        stateRef.current.timestamp = 0;
      }
      return; // Same participant, no switch needed
    }

    // Check cooldown
    const timeSinceSwitch = now - stateRef.current.lastSwitchTime;
    if (timeSinceSwitch < HYSTERESIS_CONFIG.COOLDOWN) {
      return;
    }

    // Check threshold: new speaker must be 1.25x the current
    const threshold = currentScore * HYSTERESIS_CONFIG.SWITCH_THRESHOLD;
    if (bestScore < threshold) {
      // Reset timestamp if threshold not met
      stateRef.current.timestamp = 0;
      return; // Not significant enough
    }

    // Check if we've been tracking this candidate
    const isTrackingCandidate = stateRef.current.timestamp > 0;
    
    // Check dwell time: wait 1.5s before switching
    if (!isTrackingCandidate) {
      // Start tracking this candidate
      stateRef.current.timestamp = now;
      return;
    }

    const timeSinceCandidateAppeared = now - stateRef.current.timestamp;
    if (timeSinceCandidateAppeared < HYSTERESIS_CONFIG.DWELL_TIME) {
      return; // Still waiting for dwell time
    }

    // All conditions met - switch!
    setPrimaryId(bestParticipant.identity);
    stateRef.current.primaryId = bestParticipant.identity;
    stateRef.current.lastSwitchTime = now;
    stateRef.current.timestamp = 0;
  }, [speakerScores, pinnedId, spotlightId, allParticipants]);

  return primaryId;
};

