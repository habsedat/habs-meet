import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
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
  return participantData?.role === 'host';
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

      // Verify user is participant
      const participantDoc = await admin.firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('participants')
        .doc(user.uid)
        .get();

      if (!participantDoc.exists) {
        return res.status(403).json({ error: 'User is not a participant in this room' });
      }

      const participantData = participantDoc.data()!;

      // Create LiveKit access token
      const config = getConfig();
      const at = new AccessToken(config.livekitApiKey!, config.livekitApiSecret!, {
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

      const token = await at.toJwt();

      return res.json({ token });
    } catch (error: any) {
      console.error('Error getting meeting token:', error);
      return res.status(500).json({ error: error.message });
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
      
      // If room is locked, only existing participants can join
      // If room is open, anyone can join
      // If room is ended, no one can join
      let canJoin = false;
      if (roomData.status === 'ended') {
        canJoin = false;
      } else if (roomData.status === 'locked') {
        // Locked: only existing participants can join
        canJoin = isParticipant;
      } else {
        // Open: anyone can join
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
    } else {
      console.log('[API Router] No route found for:', path);
      return res.status(404).json({ error: 'Endpoint not found' });
    }
  });
});
