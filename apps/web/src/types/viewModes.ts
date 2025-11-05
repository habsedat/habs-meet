import { LocalParticipant, RemoteParticipant } from 'livekit-client';

export type ViewMode = 'speaker' | 'gallery' | 'multi-speaker' | 'immersive';

export interface ParticipantWithScore {
  participant: LocalParticipant | RemoteParticipant;
  score: number;
  isSpeaking: boolean;
}

export interface SpotlightData {
  participantId: string;
  timestamp: number;
}

export interface PinData {
  participantId: string | null;
  timestamp: number;
}

// Hysteresis constants
export const HYSTERESIS_CONFIG = {
  DECAY: 0.85,
  BOOST: 1.0,
  SWITCH_THRESHOLD: 1.25, // New speaker must be 1.25x the current to switch
  DWELL_TIME: 1500, // 1.5 seconds
  COOLDOWN: 2000, // 2 seconds
  SILENCE_TIMEOUT: 5000, // 5 seconds - keep current if no one speaks
} as const;

