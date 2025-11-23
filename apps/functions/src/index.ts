import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import cors from 'cors';
import { AccessToken, RoomServiceClient as RoomService } from 'livekit-server-sdk';
import * as crypto from 'crypto';

// Initialize Firebase Admin
admin.initializeApp();

const corsHandler = cors({ origin: true });

// Types
interface InviteData {
  roomId: string;
  role: 'viewer' | 'speaker';
  maxUses: number;
  expiresAt: string;
}

interface RedeemInviteData {
  token: string;
}

interface MeetingTokenData {
  roomId: string;
  joinGrant?: string;
}

interface WebhookData {
  event: string;
  room: {
    name: string;
    sid: string;
  };
  egress?: {
    id: string;
    status: string;
    url?: string;
  };
}

// Helper functions
const getConfig = () => {
  return {
    livekitApiKey: functions.config().livekit?.apikey,
    livekitApiSecret: functions.config().livekit?.apisecret,
    livekitWsUrl: functions.config().livekit?.ws_url,
    webhookSecret: functions.config().webhook?.secret,
    invitesSigningSecret: functions.config().invites?.signing_secret,
  };
};

const verifyAuth = async (req: functions.Request): Promise<admin.auth.DecodedIdToken> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing or invalid authorization header');
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid token');
  }
};

const verifyHost = async (roomId: string, uid: string): Promise<boolean> => {
  const participantDoc = await admin.firestore()
    .collection('rooms')
    .doc(roomId)
    .collection('participants')
    .doc(uid)
    .get();

  if (!participantDoc.exists) {
    return false;
  }

  const participantData = participantDoc.data();
  // Both 'host' and 'cohost' have full host privileges
  return participantData?.role === 'host' || participantData?.role === 'cohost';
};

const signInviteToken = (inviteId: string, roomId: string, role: string, expiresAt: string): string => {
  const config = getConfig();
  const payload = `${inviteId}:${roomId}:${role}:${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', config.invitesSigningSecret!)
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
};

const verifyInviteToken = (token: string): { inviteId: string; roomId: string; role: string; expiresAt: string } => {
  const config = getConfig();
  const decoded = Buffer.from(token, 'base64url').toString('utf-8');
  const [inviteId, roomId, role, expiresAt, signature] = decoded.split(':');

  if (!inviteId || !roomId || !role || !expiresAt || !signature) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid token format');
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.invitesSigningSecret!)
    .update(`${inviteId}:${roomId}:${role}:${expiresAt}`)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid token signature');
  }

  if (new Date(expiresAt) < new Date()) {
    throw new functions.https.HttpsError('deadline-exceeded', 'Token has expired');
  }

  return { inviteId, roomId, role, expiresAt };
};

// API Endpoints

// POST /api/invites/create
export const createInvite = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId, role, maxUses, expiresAt }: InviteData = req.body;

      if (!roomId || !role || !maxUses || !expiresAt) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can create invites' });
      }

      // Create invite document
      const inviteRef = await admin.firestore().collection('invites').add({
        roomId,
        createdBy: user.uid,
        role,
        maxUses: parseInt(maxUses.toString()),
        used: 0,
        expiresAt: new Date(expiresAt),
        revoked: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Generate signed token
      const token = signInviteToken(inviteRef.id, roomId, role, expiresAt);
      const link = `${req.headers.origin}/invite/${inviteRef.id}?token=${token}`;

      return res.json({
        inviteId: inviteRef.id,
        link,
      });
    } catch (error: any) {
      console.error('Error creating invite:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/invites/redeem
export const redeemInvite = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { token }: RedeemInviteData = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Missing token' });
      }

      // Verify token
      const { inviteId, roomId, role } = verifyInviteToken(token);

      // Get invite document
      const inviteDoc = await admin.firestore().collection('invites').doc(inviteId).get();
      if (!inviteDoc.exists) {
        return res.status(404).json({ error: 'Invite not found' });
      }

      const inviteData = inviteDoc.data()!;

      // Check if invite is revoked
      if (inviteData.revoked) {
        return res.status(403).json({ error: 'Invite has been revoked' });
      }

      // Check usage limit
      if (inviteData.used >= inviteData.maxUses) {
        return res.status(403).json({ error: 'Invite usage limit exceeded' });
      }

      // Increment usage
      await inviteDoc.ref.update({
        used: admin.firestore.FieldValue.increment(1),
      });

      // Create or update participant document
      const participantRef = admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(user.uid);

      await participantRef.set({
        uid: user.uid,
        role,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Generate join grant (short-lived server-issued grant)
      const joinGrant = crypto.randomBytes(32).toString('hex');

      return res.json({
        roomId,
        joinGrant,
      });
    } catch (error: any) {
      console.error('Error redeeming invite:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/invites/revoke
export const revokeInvite = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { inviteId } = req.body;

      if (!inviteId) {
        return res.status(400).json({ error: 'Missing inviteId' });
      }

      // Get invite document
      const inviteDoc = await admin.firestore().collection('invites').doc(inviteId).get();
      if (!inviteDoc.exists) {
        return res.status(404).json({ error: 'Invite not found' });
      }

      const inviteData = inviteDoc.data()!;

      // Verify user is the creator
      if (inviteData.createdBy !== user.uid) {
        return res.status(403).json({ error: 'Only the creator can revoke invites' });
      }

      // Revoke invite
      await inviteDoc.ref.update({
        revoked: true,
      });

      return res.json({ success: true });
    } catch (error: any) {
      console.error('Error revoking invite:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/token
export const getMeetingToken = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId }: MeetingTokenData = req.body;

      if (!roomId) {
        return res.status(400).json({ error: 'Missing roomId' });
      }

      // Check if room exists
      const roomDoc = await admin.firestore().collection('rooms').doc(roomId).get();
      if (!roomDoc.exists) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const roomData = roomDoc.data()!;

      // ✅ CRITICAL: Check if room is ended - reject token requests for ended meetings
      if (roomData.status === 'ended') {
        return res.status(403).json({ error: 'This meeting has ended. The meeting link has expired.' });
      }

      // Check if user is the room creator (host) - allow them even if participant doc doesn't exist yet
      const isRoomCreator = roomData.createdBy === user.uid;

      // Verify user is participant OR is room creator
      const participantDoc = await admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(user.uid)
        .get();

      // If not room creator and not a participant, deny access
      if (!isRoomCreator && !participantDoc.exists) {
        return res.status(403).json({ error: 'User is not a participant in this room' });
      }

      // Check if participant is banned (only if participant doc exists)
      if (participantDoc.exists) {
        const participantData = participantDoc.data()!;
        if (participantData.isBanned === true) {
          return res.status(403).json({ error: 'You have been removed from this meeting and cannot rejoin' });
        }
      }

      // Get LiveKit config
      const config = getConfig();
      
      // Validate LiveKit configuration - check for both existence and non-empty strings
      const apiKey = config.livekitApiKey?.trim();
      const apiSecret = config.livekitApiSecret?.trim();
      
      if (!apiKey || !apiSecret || apiKey.length === 0 || apiSecret.length === 0) {
        console.error('LiveKit configuration missing or invalid:', {
          hasApiKey: !!config.livekitApiKey,
          apiKeyLength: config.livekitApiKey?.length || 0,
          hasApiSecret: !!config.livekitApiSecret,
          apiSecretLength: config.livekitApiSecret?.length || 0,
          hasWsUrl: !!config.livekitWsUrl,
          configKeys: Object.keys(functions.config()),
          livekitConfig: functions.config().livekit ? Object.keys(functions.config().livekit) : 'missing',
        });
        return res.status(500).json({ 
          error: 'LiveKit configuration is missing or invalid. Please configure LiveKit API key and secret in Firebase Functions config.',
          details: {
            hasApiKey: !!apiKey && apiKey.length > 0,
            hasApiSecret: !!apiSecret && apiSecret.length > 0,
            hasWsUrl: !!config.livekitWsUrl,
          }
        });
      }

      // Log configuration (without exposing secrets)
      console.log('LiveKit config check:', {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey.length,
        apiKeyPrefix: apiKey.substring(0, 5) + '...',
        hasApiSecret: !!apiSecret,
        apiSecretLength: apiSecret.length,
        wsUrl: config.livekitWsUrl,
      });

      // Create LiveKit access token
      let token: string;
      try {
        const at = new AccessToken(apiKey, apiSecret, {
          identity: user.uid,
          name: user.name || user.email || 'Anonymous',
        });

        at.addGrant({
          room: roomId,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          canUpdateOwnMetadata: true,
        });

        token = await at.toJwt();
        console.log('LiveKit token generated successfully for room:', roomId, 'user:', user.uid, 'expires in 6 hours');
      } catch (tokenError: any) {
        console.error('Failed to generate LiveKit token:', tokenError);
        return res.status(500).json({ 
          error: 'Failed to generate LiveKit access token',
          details: tokenError.message || 'Unknown error during token generation'
        });
      }

      // ✅ Fix 2: Add rate-limit protection with Cache-Control header
      res.set('Cache-Control', 'private, max-age=10');
      
      return res.json({ token });
    } catch (error: any) {
      console.error('Error getting meeting token:', error);
      console.error('Error stack:', error.stack);
      
      // Provide more detailed error messages
      if (error.code === 'unauthenticated') {
        return res.status(401).json({ error: 'Authentication failed: ' + error.message });
      }
      
      return res.status(500).json({ 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });
});

// GET /api/meet/rooms/:roomId/guard
export const getRoomGuard = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const roomId = req.params.roomId;

      if (!roomId) {
        return res.status(400).json({ error: 'Missing roomId' });
      }

      // Get room document
      const roomDoc = await admin.firestore().collection('rooms').doc(roomId).get();
      if (!roomDoc.exists) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const roomData = roomDoc.data()!;

      // Check if user is participant
      const participantDoc = await admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(user.uid)
        .get();

      const isParticipant = participantDoc.exists;
      
      // Check if participant is banned
      let isBanned = false;
      if (isParticipant) {
        const participantData = participantDoc.data();
        isBanned = participantData?.isBanned === true;
      }
      
      // If room is locked, only existing participants can join
      // If room is open, anyone can join (unless banned)
      // If room is ended, no one can join
      // Banned participants cannot join even if room is open
      let canJoin = false;
      if (roomData.status === 'ended') {
        canJoin = false;
      } else if (isBanned) {
        // Banned participants cannot rejoin
        canJoin = false;
      } else if (roomData.status === 'locked') {
        // Locked: only existing participants can join
        canJoin = isParticipant;
      } else {
        // Open: anyone can join (unless banned, checked above)
        canJoin = true;
      }
      
      const needsAdmission = roomData.waitingRoom && !isParticipant;

      return res.json({
        status: roomData.status,
        waitingRoom: roomData.waitingRoom,
        canJoin,
        needsAdmission,
      });
    } catch (error: any) {
      console.error('Error getting room guard:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/webhooks/livekit
export const livekitWebhook = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const config = getConfig();
      const signature = req.headers['x-livekit-signature'] as string;

      if (!signature) {
        return res.status(401).json({ error: 'Missing signature' });
      }

      // Verify webhook signature (simplified - in production, use proper verification)
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', config.webhookSecret!)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const data: WebhookData = req.body;

      // Handle egress ended event
      if (data.event === 'egress.ended' && data.egress) {
        const { room } = data;

        // Get room document to find the host
        const roomDoc = await admin.firestore().collection('rooms').doc(room.name).get();
        if (!roomDoc.exists) {
          console.error('Room not found:', room.name);
          return res.status(404).json({ error: 'Room not found' });
        }

        // Create recording document
        const recordingRef = await admin.firestore().collection('recordings').add({
          roomId: room.name,
          storagePath: `recordings/${room.name}/${Date.now()}.mp4`,
          size: 0, // Will be updated when file is uploaded
          duration: 0, // Will be calculated from egress data
          layout: 'speaker',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log('Recording created:', recordingRef.id);
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error('Error handling webhook:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// ============================================
// SCHEDULED MEETING FUNCTIONS
// ============================================

// Generate random secure key
const generateSecureKey = (): string => {
  return crypto.randomBytes(32).toString('base64url');
};

// Hash passcode
const hashPasscode = (passcode: string): string => {
  return crypto.createHash('sha256').update(passcode).digest('hex');
};

// Verify passcode
const verifyPasscode = (passcode: string, hash: string): boolean => {
  return hashPasscode(passcode) === hash;
};

// Helper to generate ICS content
function generateICSContent(data: {
  uid: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  organizer: { name: string; email: string };
  url?: string;
  passcode?: string;
}): string {
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escape = (text: string): string => {
    return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  };

  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Habs Meet//Meeting Scheduler//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:REQUEST');
  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${data.uid}@habs-meet.com`);
  lines.push(`DTSTAMP:${formatDate(new Date())}`);
  lines.push(`DTSTART;TZID=${data.timezone}:${formatDate(data.startTime).replace('Z', '')}`);
  lines.push(`DTEND;TZID=${data.timezone}:${formatDate(data.endTime).replace('Z', '')}`);
  lines.push(`SUMMARY:${escape(data.title)}`);

  let fullDescription = data.description;
  if (data.url) {
    fullDescription += `\n\nJoin Link: ${data.url}`;
  }
  if (data.passcode) {
    fullDescription += `\nPasscode: ${data.passcode}`;
  }
  lines.push(`DESCRIPTION:${escape(fullDescription)}`);

  if (data.url) {
    lines.push(`URL:${data.url}`);
  }

  lines.push(`ORGANIZER;CN=${escape(data.organizer.name)}:mailto:${escape(data.organizer.email)}`);
  lines.push('STATUS:CONFIRMED');
  lines.push('SEQUENCE:0');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

// POST /api/schedule/create
export const createScheduledMeeting = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const {
        title,
        description,
        startAt,
        durationMin,
        timezone,
        allowEarlyJoinMin = 10,
        requirePasscode = false,
        passcode,
        lobbyEnabled = true,
        attendees = [],
      } = req.body;

      // Validation
      if (!title || !startAt || !durationMin || !timezone) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const startDate = new Date(startAt);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid start date' });
      }

      if (startDate < new Date()) {
        return res.status(400).json({ error: 'Cannot schedule meetings in the past' });
      }

      if (durationMin < 1 || durationMin > 1440) {
        return res.status(400).json({ error: 'Duration must be between 1 and 1440 minutes' });
      }

      // Validate passcode if required
      if (requirePasscode && passcode) {
        const passcodeRegex = /^\d{6}$/;
        if (!passcodeRegex.test(passcode)) {
          return res.status(400).json({ error: 'Passcode must be exactly 6 digits (numbers only)' });
        }
      }

      // Generate meeting ID
      const meetingId = crypto.randomBytes(16).toString('base64url');

      // Generate join keys
      const hostJoinKey = generateSecureKey();
      const participantJoinKey = generateSecureKey();

      // Hash passcode if provided
      let passcodeHash: string | null = null;
      if (requirePasscode && passcode) {
        passcodeHash = hashPasscode(passcode);
      }

      // Calculate end time
      const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

      // Create meeting document
      const meetingData = {
        ownerUid: user.uid,
        status: 'scheduled' as const,
        title,
        description: description || '',
        startAt: admin.firestore.Timestamp.fromDate(startDate),
        durationMin,
        endAt: admin.firestore.Timestamp.fromDate(endDate),
        timezone,
        allowEarlyJoinMin,
        requirePasscode,
        passcodeHash,
        lobbyEnabled,
        roomName: meetingId,
        hostJoinKey,
        participantJoinKey,
        expiresAt: null,
        attendees,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await admin.firestore().collection('meetings').doc(meetingId).set(meetingData);

      // Log creation
      await admin.firestore().collection('meetings').doc(meetingId).collection('logs').add({
        type: 'created',
        at: admin.firestore.FieldValue.serverTimestamp(),
        byUid: user.uid,
        meta: { title, startAt: startDate.toISOString() },
      });

      // Generate links
      const baseUrl = req.headers.origin || 'https://habs-meet-dev.web.app';
      const hostLink = `${baseUrl}/join/${meetingId}?k=${hostJoinKey}`;
      const participantLink = `${baseUrl}/join/${meetingId}?k=${participantJoinKey}`;

      // Generate ICS data
      const icsContent = generateICSContent({
        uid: meetingId,
        title,
        description: description || '',
        startTime: startDate,
        endTime: endDate,
        timezone,
        organizer: {
          name: user.name || user.email || 'Organizer',
          email: user.email || '',
        },
        url: participantLink,
        passcode: requirePasscode && passcode ? passcode : undefined,
      });

      return res.json({
        meetingId,
        hostLink,
        participantLink,
        icsData: icsContent,
      });
    } catch (error: any) {
      console.error('Error creating scheduled meeting:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/schedule/token
export const getJoinToken = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { meetingId, key, displayName, passcode } = req.body;

      if (!meetingId || !key || !displayName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Load meeting
      const meetingDoc = await admin.firestore().collection('meetings').doc(meetingId).get();

      if (!meetingDoc.exists) {
        return res.status(404).json({ status: 'denied', message: 'Meeting not found' });
      }

      const meeting = meetingDoc.data()!;
      const now = new Date();
      const startAt = meeting.startAt.toDate();
      const endAt = meeting.endAt.toDate();
      const expiresAt = meeting.expiresAt ? meeting.expiresAt.toDate() : null;

      // Check if meeting is ended/canceled
      if (meeting.status === 'ended' || meeting.status === 'canceled') {
        await admin.firestore().collection('meetings').doc(meetingId).collection('logs').add({
          type: 'denied',
          at: admin.firestore.FieldValue.serverTimestamp(),
          meta: { reason: `Meeting ${meeting.status}` },
        });
        return res.status(403).json({ status: 'denied', message: `Meeting has been ${meeting.status}` });
      }

      // Check expiry
      if (expiresAt && now > expiresAt) {
        return res.status(403).json({ status: 'expired', message: 'Meeting link has expired' });
      }

      // Check if past end time + grace period (15 min)
      const gracePeriod = new Date(endAt.getTime() + 15 * 60 * 1000);
      if (now > gracePeriod) {
        return res.status(403).json({ status: 'expired', message: 'Meeting has ended' });
      }

      // Determine role
      let role: 'host' | 'participant' = 'participant';
      if (key === meeting.hostJoinKey) {
        role = 'host';
      } else if (key !== meeting.participantJoinKey) {
        return res.status(403).json({ status: 'denied', message: 'Invalid join key' });
      }

      // Check passcode for participants
      if (meeting.requirePasscode && role === 'participant') {
        if (!passcode) {
          return res.status(400).json({ status: 'denied', message: 'Passcode required' });
        }
        if (!meeting.passcodeHash || !verifyPasscode(passcode, meeting.passcodeHash)) {
          await admin.firestore().collection('meetings').doc(meetingId).collection('logs').add({
            type: 'denied',
            at: admin.firestore.FieldValue.serverTimestamp(),
            meta: { reason: 'Invalid passcode' },
          });
          return res.status(403).json({ status: 'denied', message: 'Invalid passcode' });
        }
      }

      // Check time window
      const earlyJoinTime = new Date(startAt.getTime() - meeting.allowEarlyJoinMin * 60 * 1000);
      if (now < earlyJoinTime) {
        const remainingMs = earlyJoinTime.getTime() - now.getTime();
        return res.json({
          status: 'waiting',
          remainingMs,
          message: `Meeting starts in ${Math.ceil(remainingMs / 60000)} minutes`,
        });
      }

      // If host joins and status is scheduled, set to live
      if (role === 'host' && meeting.status === 'scheduled') {
        await admin.firestore().collection('meetings').doc(meetingId).update({
          status: 'live',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await admin.firestore().collection('meetings').doc(meetingId).collection('logs').add({
          type: 'started',
          at: admin.firestore.FieldValue.serverTimestamp(),
          byUid: meeting.ownerUid,
        });
      }

      // Generate LiveKit token
      const config = getConfig();
      const identity = `${role}:${crypto.randomBytes(8).toString('hex')}-${displayName}`;
      const at = new AccessToken(config.livekitApiKey!, config.livekitApiSecret!, {
        identity,
        name: displayName,
        metadata: JSON.stringify({
          meetingId,
          role,
          ownerUid: meeting.ownerUid,
        }),
      });

      const grant = {
        room: meeting.roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
      };

      if (role === 'host') {
        (grant as any).roomAdmin = true;
      }

      at.addGrant(grant);

      const token = await at.toJwt();

      // Log token issuance
      await admin.firestore().collection('meetings').doc(meetingId).collection('logs').add({
        type: 'tokenIssued',
        at: admin.firestore.FieldValue.serverTimestamp(),
        meta: { role, displayName },
      });

      return res.json({
        status: 'ok',
        role,
        token,
        roomName: meeting.roomName,
        meeting: {
          ...meeting,
          id: meetingId,
        },
      });
    } catch (error: any) {
      console.error('Error getting join token:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/schedule/end
export const endMeeting = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { meetingId, key } = req.body;

      if (!meetingId) {
        return res.status(400).json({ error: 'Missing meetingId' });
      }

      const meetingDoc = await admin.firestore().collection('meetings').doc(meetingId).get();

      if (!meetingDoc.exists) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      const meeting = meetingDoc.data()!;

      // Verify authorization: must be owner or have host key
      const isOwner = meeting.ownerUid === user.uid;
      const hasHostKey = key && key === meeting.hostJoinKey;

      if (!isOwner && !hasHostKey) {
        return res.status(403).json({ error: 'Only host can end meeting' });
      }

      const now = admin.firestore.Timestamp.now();

      // Update meeting
      await admin.firestore().collection('meetings').doc(meetingId).update({
        status: 'ended',
        expiresAt: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log
      await admin.firestore().collection('meetings').doc(meetingId).collection('logs').add({
        type: 'ended',
        at: admin.firestore.FieldValue.serverTimestamp(),
        byUid: user.uid,
      });

      return res.json({ success: true, message: 'Meeting ended' });
    } catch (error: any) {
      console.error('Error ending meeting:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/end - End a regular room (not scheduled meeting)
export const endRoom = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId } = req.body;

      if (!roomId) {
        return res.status(400).json({ error: 'Missing roomId' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can end meetings' });
      }

      // Get room document
      const roomDoc = await admin.firestore().collection('rooms').doc(roomId).get();
      if (!roomDoc.exists) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const roomData = roomDoc.data()!;
      
      // Check if already ended
      if (roomData.status === 'ended') {
        return res.json({ success: true, message: 'Meeting already ended' });
      }

      // ✅ CRITICAL: Update room status to 'ended' FIRST - this will trigger disconnection for all participants
      // This MUST happen before disconnecting participants so Firestore listeners can react
      await admin.firestore().collection('rooms').doc(roomId).update({
        status: 'ended',
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      console.log(`[EndRoom] ✅ Room status updated to 'ended' in Firestore`);

      // ✅ CRITICAL: Disconnect all participants from LiveKit room using RoomService
      const config = getConfig();
      if (config.livekitApiKey && config.livekitApiSecret && config.livekitWsUrl) {
        try {
          const roomService = new RoomService(config.livekitWsUrl, config.livekitApiKey, config.livekitApiSecret);
          
          // List all participants in the LiveKit room
          const participants = await roomService.listParticipants(roomId);
          
          console.log(`[EndRoom] Found ${participants.length} participant(s) to disconnect`);
          
          // ✅ CRITICAL: Disconnect all participants in parallel for faster execution
          const disconnectPromises = participants.map(async (participant) => {
            try {
              await roomService.removeParticipant(roomId, participant.identity);
              console.log(`[EndRoom] ✅ Disconnected participant: ${participant.identity}`);
            } catch (err: any) {
              console.warn(`[EndRoom] ⚠️ Failed to disconnect participant ${participant.identity}:`, err);
              // Continue with other participants even if one fails
            }
          });
          
          await Promise.allSettled(disconnectPromises);
          console.log(`[EndRoom] ✅ Disconnected ${participants.length} participant(s) from LiveKit room`);
          
          // ✅ CRITICAL: Try to delete/close the room entirely (if supported)
          try {
            // Some LiveKit versions support deleteRoom - try it
            if (typeof (roomService as any).deleteRoom === 'function') {
              await (roomService as any).deleteRoom(roomId);
              console.log(`[EndRoom] ✅ Deleted LiveKit room: ${roomId}`);
            }
          } catch (deleteError: any) {
            // deleteRoom might not be available in all versions - that's OK
            console.log(`[EndRoom] Note: deleteRoom not available or failed (this is OK):`, deleteError.message);
          }
        } catch (livekitError: any) {
          console.error('[EndRoom] ❌ Error disconnecting participants from LiveKit:', livekitError);
          // Continue even if LiveKit disconnection fails - Firestore status update will still trigger client-side disconnection
        }
      }

      // ✅ Set leftAt for all participants when meeting ends
      try {
        const participantsSnapshot = await admin.firestore()
          .collection('rooms')
          .doc(roomId)
          .collection('participants')
          .get();

        // Filter participants who don't have leftAt set yet
        const participantsToUpdate = participantsSnapshot.docs.filter((doc) => {
          const data = doc.data();
          return !data.leftAt; // Only update if leftAt is not set
        });

        const updatePromises = participantsToUpdate.map(async (participantDoc) => {
          try {
            await participantDoc.ref.update({
              leftAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`[EndRoom] ✅ Set leftAt for participant: ${participantDoc.id}`);
          } catch (err: any) {
            console.warn(`[EndRoom] ⚠️ Failed to set leftAt for participant ${participantDoc.id}:`, err);
          }
        });

        await Promise.allSettled(updatePromises);
        console.log(`[EndRoom] ✅ Set leftAt for ${participantsToUpdate.length} participant(s)`);
      } catch (leftAtError: any) {
        console.warn('[EndRoom] ⚠️ Error setting leftAt for participants (non-critical):', leftAtError);
        // Continue even if this fails
      }

      return res.json({ success: true, message: 'Meeting ended and all participants disconnected' });
    } catch (error: any) {
      console.error('Error ending room:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/leave
export const leaveMeeting = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId } = req.body;

      if (!roomId) {
        return res.status(400).json({ error: 'Missing roomId' });
      }

      // Check if user is a participant
      const participantRef = admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(user.uid);

      const participantDoc = await participantRef.get();

      if (!participantDoc.exists) {
        // User is not a participant - that's OK, they might have already left
        return res.json({ success: true, message: 'User is not a participant' });
      }

      const participantData = participantDoc.data()!;

      // Only set leftAt if it's not already set
      if (!participantData.leftAt) {
        await participantRef.update({
          leftAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[LeaveMeeting] ✅ Set leftAt for participant: ${user.uid} in room: ${roomId}`);
      }

      return res.json({ success: true, message: 'Left meeting successfully' });
    } catch (error: any) {
      console.error('Error leaving meeting:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/schedule/cancel
export const cancelMeeting = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { meetingId } = req.body;

      if (!meetingId) {
        return res.status(400).json({ error: 'Missing meetingId' });
      }

      const meetingDoc = await admin.firestore().collection('meetings').doc(meetingId).get();

      if (!meetingDoc.exists) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      const meeting = meetingDoc.data()!;

      // Only owner can cancel
      if (meeting.ownerUid !== user.uid) {
        return res.status(403).json({ error: 'Only owner can cancel meeting' });
      }

      if (meeting.status === 'ended' || meeting.status === 'canceled') {
        return res.status(400).json({ error: `Meeting is already ${meeting.status}` });
      }

      const now = admin.firestore.Timestamp.now();

      // Update meeting
      await admin.firestore().collection('meetings').doc(meetingId).update({
        status: 'canceled',
        expiresAt: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log
      await admin.firestore().collection('meetings').doc(meetingId).collection('logs').add({
        type: 'canceled',
        at: admin.firestore.FieldValue.serverTimestamp(),
        byUid: user.uid,
      });

      return res.json({ success: true, message: 'Meeting canceled' });
    } catch (error: any) {
      console.error('Error canceling meeting:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/lobby/admit
export const admitParticipant = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId, participantId } = req.body;

      if (!roomId || !participantId) {
        return res.status(400).json({ error: 'Missing roomId or participantId' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can admit participants' });
      }

      // Get participant document
      const participantRef = admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(participantId);

      const participantDoc = await participantRef.get();
      if (!participantDoc.exists) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      // Update participant status to admitted
      await participantRef.update({
        lobbyStatus: 'admitted',
        admittedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({ success: true, message: 'Participant admitted' });
    } catch (error: any) {
      console.error('Error admitting participant:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/lobby/deny
export const denyParticipant = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId, participantId } = req.body;

      if (!roomId || !participantId) {
        return res.status(400).json({ error: 'Missing roomId or participantId' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can deny participants' });
      }

      // Update participant status to denied and remove from participants
      const participantRef = admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(participantId);

      await participantRef.update({
        lobbyStatus: 'denied',
        deniedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Remove participant after a delay (optional - or keep for logging)
      // await participantRef.delete();

      return res.json({ success: true, message: 'Participant denied' });
    } catch (error: any) {
      console.error('Error denying participant:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/lobby/admit-all
export const admitAllParticipants = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId } = req.body;

      if (!roomId) {
        return res.status(400).json({ error: 'Missing roomId' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can admit participants' });
      }

      // Get all waiting participants
      const participantsSnapshot = await admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .where('lobbyStatus', '==', 'waiting')
        .get();

      // Admit all waiting participants
      const batch = admin.firestore().batch();
      participantsSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          lobbyStatus: 'admitted',
          admittedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();

      return res.json({ 
        success: true, 
        message: `Admitted ${participantsSnapshot.docs.length} participant(s)` 
      });
    } catch (error: any) {
      console.error('Error admitting all participants:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/mute-participant
export const muteParticipant = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId, participantId } = req.body;

      if (!roomId || !participantId) {
        return res.status(400).json({ error: 'Missing roomId or participantId' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can mute participants' });
      }

      // Prevent host/cohost from muting themselves
      if (participantId === user.uid) {
        return res.status(400).json({ error: 'You cannot mute yourself' });
      }

      // Check if target participant is also a host/cohost
      const targetParticipantDoc = await admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(participantId)
        .get();
      
      if (targetParticipantDoc.exists) {
        const targetRole = targetParticipantDoc.data()?.role;
        if (targetRole === 'host' || targetRole === 'cohost') {
          return res.status(403).json({ error: 'Cannot mute hosts or co-hosts' });
        }
      }

      // Mute participant in LiveKit
      const config = getConfig();
      const roomService = new RoomService(config.livekitWsUrl!, config.livekitApiKey!, config.livekitApiSecret!);
      
      try {
        // List all participants to find the target participant
        const participants = await roomService.listParticipants(roomId);
        const targetParticipant = participants.find(p => p.identity === participantId);
        
        if (!targetParticipant) {
          return res.status(404).json({ error: 'Participant not found in room' });
        }
        
        // Get published tracks - LiveKit SDK structure
        const tracks = (targetParticipant as any).publishedTracks || [];
        
        if (!tracks || tracks.length === 0) {
          return res.status(404).json({ error: 'No published tracks found for participant' });
        }
        
        // Find microphone track - check all possible property names
        let microphoneTrackSid: string | null = null;
        for (const track of tracks) {
          // Check different possible property names
          const trackKind = track.kind || track.type;
          const trackSource = track.source || track.trackSource;
          const trackSid = track.sid || track.trackSid;
          
          console.log('[Mute] Checking track:', { trackKind, trackSource, trackSid, track: JSON.stringify(track) });
          
          if (trackKind === 'audio' || trackKind === 1) { // 1 = Audio kind in LiveKit
            // If it's audio, check if it's microphone
            if (trackSource === 'microphone' || trackSource === 1 || !trackSource) { // 1 = Microphone source in LiveKit
              microphoneTrackSid = trackSid;
              console.log('[Mute] Found microphone track:', microphoneTrackSid);
              break;
            }
          }
        }
        
        if (!microphoneTrackSid) {
          // Try to mute the first audio track if we can't find specific microphone
          console.log('[Mute] Microphone track not found, attempting to mute first audio track');
          for (const track of tracks) {
            const trackKind = track.kind || track.type;
            const trackSid = track.sid || track.trackSid;
            
            if ((trackKind === 'audio' || trackKind === 1) && trackSid) { // 1 = Audio kind in LiveKit
              microphoneTrackSid = trackSid;
              console.log('[Mute] Using first audio track:', microphoneTrackSid);
              break;
            }
          }
        }
        
        if (!microphoneTrackSid) {
          return res.status(404).json({ error: 'Microphone track not found for participant' });
        }
        
        // Mute the microphone track using LiveKit RoomServiceClient API
        try {
          // Try the correct LiveKit SDK method - mutePublishedTrack(room, identity, trackSid, muted)
          if (typeof (roomService as any).mutePublishedTrack === 'function') {
            await (roomService as any).mutePublishedTrack(roomId, participantId, microphoneTrackSid, true);
            console.log('[Mute] Successfully muted participant using mutePublishedTrack:', participantId, 'track:', microphoneTrackSid);
          } else {
            // Fallback: Use the API client directly
            const api = (roomService as any).api;
            if (api && typeof api.mutePublishedTrack === 'function') {
              await api.mutePublishedTrack({
                room: roomId,
                identity: participantId,
                trackSid: microphoneTrackSid,
                muted: true
              });
              console.log('[Mute] Successfully muted participant using API.mutePublishedTrack:', participantId);
            } else {
              throw new Error('mutePublishedTrack method not found in RoomService');
            }
          }
          
          // Create Firestore notification for the participant
          const notificationRef = admin.firestore()
            .collection('rooms')
            .doc(roomId)
            .collection('notifications')
            .doc();
          
          await notificationRef.set({
            participantId: participantId,
            type: 'muted',
            message: 'Your microphone has been muted by the host',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false
          });
          
          console.log('[Mute] Notification created for participant:', participantId);
          
          return res.json({ success: true, message: 'Participant muted successfully' });
        } catch (muteError: any) {
          console.error('[Mute] Error muting track:', muteError);
          throw muteError;
        }
      } catch (lkError: any) {
        console.error('[Mute] LiveKit API error:', lkError);
        return res.status(500).json({ error: `Failed to mute participant: ${lkError.message}` });
      }
    } catch (error: any) {
      console.error('Error muting participant:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/unmute-participant
export const unmuteParticipant = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId, participantId } = req.body;

      if (!roomId || !participantId) {
        return res.status(400).json({ error: 'Missing roomId or participantId' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can unmute participants' });
      }

      // Prevent host/cohost from unmuting themselves (though this is less critical)
      if (participantId === user.uid) {
        return res.status(400).json({ error: 'You cannot unmute yourself' });
      }

      // Unmute participant in LiveKit
      const config = getConfig();
      const roomService = new RoomService(config.livekitWsUrl!, config.livekitApiKey!, config.livekitApiSecret!);
      
      try {
        // List all participants to find the target participant
        const participants = await roomService.listParticipants(roomId);
        const targetParticipant = participants.find(p => p.identity === participantId);
        
        if (!targetParticipant) {
          return res.status(404).json({ error: 'Participant not found in room' });
        }
        
        // Get published tracks - LiveKit SDK structure
        const tracks = (targetParticipant as any).publishedTracks || [];
        
        if (!tracks || tracks.length === 0) {
          return res.status(404).json({ error: 'No published tracks found for participant' });
        }
        
        // Find microphone track - check all possible property names
        let microphoneTrackSid: string | null = null;
        for (const track of tracks) {
          // Check different possible property names
          const trackKind = track.kind || track.type;
          const trackSource = track.source || track.trackSource;
          const trackSid = track.sid || track.trackSid;
          
          console.log('[Unmute] Checking track:', { trackKind, trackSource, trackSid });
          
          if (trackKind === 'audio' || trackKind === 1) { // 1 = Audio kind in LiveKit
            // If it's audio, check if it's microphone
            if (trackSource === 'microphone' || trackSource === 1 || !trackSource) { // 1 = Microphone source in LiveKit
              microphoneTrackSid = trackSid;
              console.log('[Unmute] Found microphone track:', microphoneTrackSid);
              break;
            }
          }
        }
        
        if (!microphoneTrackSid) {
          // Try to unmute the first audio track if we can't find specific microphone
          console.log('[Unmute] Microphone track not found, attempting to unmute first audio track');
          for (const track of tracks) {
            const trackKind = track.kind || track.type;
            const trackSid = track.sid || track.trackSid;
            
            if ((trackKind === 'audio' || trackKind === 1) && trackSid) { // 1 = Audio kind in LiveKit
              microphoneTrackSid = trackSid;
              console.log('[Unmute] Using first audio track:', microphoneTrackSid);
              break;
            }
          }
        }
        
        if (!microphoneTrackSid) {
          return res.status(404).json({ error: 'Microphone track not found for participant' });
        }
        
        // Unmute the microphone track using LiveKit RoomServiceClient API
        try {
          // Try the correct LiveKit SDK method - mutePublishedTrack(room, identity, trackSid, muted)
          if (typeof (roomService as any).mutePublishedTrack === 'function') {
            await (roomService as any).mutePublishedTrack(roomId, participantId, microphoneTrackSid, false);
            console.log('[Unmute] Successfully unmuted participant using mutePublishedTrack:', participantId, 'track:', microphoneTrackSid);
          } else {
            // Fallback: Use the API client directly
            const api = (roomService as any).api;
            if (api && typeof api.mutePublishedTrack === 'function') {
              await api.mutePublishedTrack({
                room: roomId,
                identity: participantId,
                trackSid: microphoneTrackSid,
                muted: false
              });
              console.log('[Unmute] Successfully unmuted participant using API.mutePublishedTrack:', participantId);
            } else {
              throw new Error('mutePublishedTrack method not found in RoomService');
            }
          }
          
          // Create Firestore notification for the participant
          const notificationRef = admin.firestore()
            .collection('rooms')
            .doc(roomId)
            .collection('notifications')
            .doc();
          
          await notificationRef.set({
            participantId: participantId,
            type: 'unmuted',
            message: 'Your microphone has been unmuted by the host',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false
          });
          
          console.log('[Unmute] Notification created for participant:', participantId);
          
          return res.json({ success: true, message: 'Participant unmuted successfully' });
        } catch (unmuteError: any) {
          console.error('[Unmute] Error unmuting track:', unmuteError);
          throw unmuteError;
        }
      } catch (lkError: any) {
        console.error('[Unmute] LiveKit API error:', lkError);
        return res.status(500).json({ error: `Failed to unmute participant: ${lkError.message}` });
      }
    } catch (error: any) {
      console.error('Error unmuting participant:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/remove-participant
export const removeParticipant = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId, participantId } = req.body;

      if (!roomId || !participantId) {
        return res.status(400).json({ error: 'Missing roomId or participantId' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can remove participants' });
      }

      // Remove participant from LiveKit room (this will disconnect them)
      const config = getConfig();
      const roomService = new RoomService(config.livekitWsUrl!, config.livekitApiKey!, config.livekitApiSecret!);
      
      try {
        // First, try to get the participant to ensure they exist
        const participants = await roomService.listParticipants(roomId);
        const targetParticipant = participants.find(p => p.identity === participantId);
        
        if (targetParticipant) {
          // Use the correct method to remove participant
          // Try different method names that might exist in the SDK
          try {
            // Method 1: removeParticipant(room, identity)
            if (typeof (roomService as any).removeParticipant === 'function') {
              await (roomService as any).removeParticipant(roomId, participantId);
              console.log('[RemoveParticipant] Successfully removed participant using removeParticipant:', participantId);
            }
            // Method 2: removeParticipant(room, identity) - alternative
            else if (typeof (roomService as any).removeParticipantFromRoom === 'function') {
              await (roomService as any).removeParticipantFromRoom(roomId, participantId);
              console.log('[RemoveParticipant] Successfully removed participant using removeParticipantFromRoom:', participantId);
            }
            // Method 3: Use RoomService API directly
            else {
              // Try using the room service's internal API
              const roomServiceAny = roomService as any;
              if (roomServiceAny.api) {
                await roomServiceAny.api.removeParticipant({ room: roomId, identity: participantId });
                console.log('[RemoveParticipant] Successfully removed participant using API:', participantId);
              } else {
                throw new Error('No removeParticipant method found');
              }
            }
          } catch (removeError: any) {
            console.error('[RemoveParticipant] Error calling removeParticipant:', removeError);
            // Still continue to ban them in Firestore
          }
        } else {
          console.log('[RemoveParticipant] Participant not found in LiveKit room, but will still ban them');
        }
      } catch (lkError: any) {
        console.error('[RemoveParticipant] Error removing from LiveKit:', lkError);
        // Continue to ban them in Firestore even if LiveKit removal fails
      }

      // Update participant document in Firestore - mark as banned and removed
      const participantRef = admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(participantId);

      await participantRef.update({
        leftAt: admin.firestore.FieldValue.serverTimestamp(),
        removedBy: user.uid,
        removedAt: admin.firestore.FieldValue.serverTimestamp(),
        isBanned: true, // Ban them from rejoining this specific meeting
        isActive: false,
      });

      return res.json({ success: true, message: 'Participant removed and banned from rejoining' });
    } catch (error: any) {
      console.error('Error removing participant:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/update-role
export const updateParticipantRole = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId, participantId, role } = req.body;

      if (!roomId || !participantId || !role) {
        return res.status(400).json({ error: 'Missing roomId, participantId, or role' });
      }

      if (!['host', 'cohost', 'speaker', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be host, cohost, speaker, or viewer' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can update participant roles' });
      }

      // Update participant role in Firestore
      const participantRef = admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(participantId);

      await participantRef.update({
        role,
        roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        roleUpdatedBy: user.uid,
      });

      return res.json({ success: true, message: `Participant role updated to ${role}` });
    } catch (error: any) {
      console.error('Error updating participant role:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// POST /api/meet/enforce-capacity
export const enforceParticipantCapacity = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const user = await verifyAuth(req);
      const { roomId, maxParticipants } = req.body;

      if (!roomId || maxParticipants === undefined) {
        return res.status(400).json({ error: 'Missing roomId or maxParticipants' });
      }

      if (typeof maxParticipants !== 'number' || maxParticipants < 1) {
        return res.status(400).json({ error: 'maxParticipants must be a positive number' });
      }

      // Verify user is host
      const isHost = await verifyHost(roomId, user.uid);
      if (!isHost) {
        return res.status(403).json({ error: 'Only hosts can enforce participant capacity' });
      }

      // Update room capacity in Firestore
      const roomRef = admin.firestore().collection('rooms').doc(roomId);
      await roomRef.update({
        maxParticipants,
        capacityEnforced: true,
        capacityUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Get current participants count
      const config = getConfig();
      const roomService = new RoomService(config.livekitWsUrl!, config.livekitApiKey!, config.livekitApiSecret!);
      const roomInfo = await roomService.listRooms([roomId]);
      
      if (roomInfo.length > 0) {
        const currentCount = roomInfo[0].numParticipants || 0;
        
        // If current count exceeds capacity, remove excess participants (oldest first)
        if (currentCount > maxParticipants) {
          const participants = await roomService.listParticipants(roomId);
          const excessCount = currentCount - maxParticipants;
          
          // Sort by join time (if available) or remove last joined
          const participantsToRemove = participants.slice(-excessCount);
          
          for (const participant of participantsToRemove) {
            // Skip host
            if (participant.identity === user.uid) continue;
            
            try {
              await roomService.removeParticipant(roomId, participant.identity);
              
              // Update Firestore
              const participantRef = admin.firestore()
                .collection('rooms')
                .doc(roomId)
                .collection('participants')
                .doc(participant.identity);
              
              await participantRef.update({
                leftAt: admin.firestore.FieldValue.serverTimestamp(),
                removedBy: user.uid,
                reason: 'capacity_limit',
              });
            } catch (err: any) {
              console.error(`Error removing participant ${participant.identity}:`, err);
            }
          }
        }
      }

      return res.json({ 
        success: true, 
        message: `Participant capacity set to ${maxParticipants}` 
      });
    } catch (error: any) {
      console.error('Error enforcing participant capacity:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// Main API function
export const api = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    const path = req.path;
    const method = req.method;

    console.log('[API Router] Path:', path, 'Method:', method);

    // Route to appropriate function
    if (path.startsWith('/api/invites/create') && method === 'POST') {
      return createInvite(req, res);
    } else if (path.startsWith('/api/invites/redeem') && method === 'POST') {
      return redeemInvite(req, res);
    } else if (path.startsWith('/api/invites/revoke') && method === 'POST') {
      return revokeInvite(req, res);
    } else if (path.startsWith('/api/meet/token') && method === 'POST') {
      return getMeetingToken(req, res);
    } else if (path.startsWith('/api/meet/rooms/') && path.endsWith('/guard') && method === 'GET') {
      return getRoomGuard(req, res);
    } else if (path.startsWith('/api/meet/webhooks/livekit') && method === 'POST') {
      return livekitWebhook(req, res);
    } else if (path === '/api/schedule/create' && method === 'POST') {
      return createScheduledMeeting(req, res);
    } else if (path === '/api/schedule/token' && method === 'POST') {
      return getJoinToken(req, res);
    } else if (path === '/api/schedule/end' && method === 'POST') {
      return endMeeting(req, res);
    } else if (path === '/api/schedule/cancel' && method === 'POST') {
      return cancelMeeting(req, res);
    } else if (path === '/api/lobby/admit' && method === 'POST') {
      return admitParticipant(req, res);
    } else if (path === '/api/lobby/deny' && method === 'POST') {
      return denyParticipant(req, res);
    } else if (path === '/api/lobby/admit-all' && method === 'POST') {
      return admitAllParticipants(req, res);
    } else if ((path === '/api/meet/mute-participant' || path === '/meet/mute-participant') && method === 'POST') {
      return muteParticipant(req, res);
    } else if ((path === '/api/meet/unmute-participant' || path === '/meet/unmute-participant') && method === 'POST') {
      return unmuteParticipant(req, res);
    } else if ((path === '/api/meet/remove-participant' || path === '/meet/remove-participant') && method === 'POST') {
      return removeParticipant(req, res);
    } else if ((path === '/api/meet/update-role' || path === '/meet/update-role') && method === 'POST') {
      return updateParticipantRole(req, res);
    } else if ((path === '/api/meet/enforce-capacity' || path === '/meet/enforce-capacity') && method === 'POST') {
      return enforceParticipantCapacity(req, res);
    } else if ((path === '/api/meet/end' || path === '/meet/end') && method === 'POST') {
      // ✅ CRITICAL: Route to endRoom function
      return endRoom(req, res);
    } else if ((path === '/api/meet/leave' || path === '/meet/leave') && method === 'POST') {
      return leaveMeeting(req, res);
    } else {
      console.log('[API Router] No route found for:', path, 'Method:', method);
      return res.status(404).json({ error: 'Endpoint not found' });
    }
  });
});
