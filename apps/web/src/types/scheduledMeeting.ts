import { Timestamp } from 'firebase/firestore';

export type MeetingStatus = 'scheduled' | 'live' | 'ended' | 'canceled';

export interface ScheduledMeeting {
  id: string;
  ownerUid: string;
  status: MeetingStatus;
  title: string;
  description: string;
  startAt: Timestamp;
  durationMin: number;
  endAt: Timestamp;
  timezone: string; // IANA timezone string
  allowEarlyJoinMin: number; // default 10
  requirePasscode: boolean; // default false
  passcodeHash: string | null;
  lobbyEnabled: boolean; // default true
  createdAt: Timestamp;
  updatedAt: Timestamp;
  roomName: string; // LiveKit room name == meetingId
  hostJoinKey: string; // random 32-40 char
  participantJoinKey: string; // random 32-40 char
  expiresAt: Timestamp | null; // set when host ends or auto-expiry
  attendees?: Array<{
    email: string;
    name?: string;
    role: 'host' | 'participant';
  }>;
}

export interface MeetingLog {
  id: string;
  type: 'created' | 'updated' | 'canceled' | 'started' | 'ended' | 'tokenIssued' | 'joinAttempt' | 'denied';
  at: Timestamp;
  byUid?: string;
  meta?: any;
}

export interface CreateMeetingRequest {
  title: string;
  description: string;
  startAt: string; // ISO 8601 string
  durationMin: number;
  timezone: string;
  allowEarlyJoinMin?: number;
  requirePasscode?: boolean;
  passcode?: string; // plaintext, will be hashed on server
  lobbyEnabled?: boolean;
  attendees?: Array<{
    email: string;
    name?: string;
    role: 'host' | 'participant';
  }>;
}

export interface CreateMeetingResponse {
  meetingId: string;
  hostLink: string;
  participantLink: string;
  icsData: string; // ICS file content
}

export interface GetJoinTokenRequest {
  meetingId: string;
  key: string; // from query param
  displayName: string;
  passcode?: string; // if requirePasscode is true
}

export interface GetJoinTokenResponse {
  status: 'ok' | 'waiting' | 'denied' | 'expired';
  role?: 'host' | 'participant';
  token?: string;
  roomName?: string;
  meeting?: ScheduledMeeting;
  remainingMs?: number; // if status is 'waiting'
  message?: string;
}

export interface EndMeetingRequest {
  meetingId: string;
  key?: string; // hostJoinKey
}
















