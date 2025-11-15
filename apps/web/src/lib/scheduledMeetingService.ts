import { auth } from './firebase';
import { CreateMeetingRequest, CreateMeetingResponse, GetJoinTokenRequest, GetJoinTokenResponse } from '../types/scheduledMeeting';

const API_BASE = (import.meta as any).env.VITE_API_BASE || '/api';

export async function createScheduledMeeting(data: CreateMeetingRequest): Promise<CreateMeetingResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE}/schedule/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getScheduledMeetingToken(data: GetJoinTokenRequest): Promise<GetJoinTokenResponse> {
  const response = await fetch(`${API_BASE}/schedule/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}
