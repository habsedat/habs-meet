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
        canPublish: participantData.role === 'host' || participantData.role === 'speaker',
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
      const canJoin = roomData.status === 'open' || isParticipant;
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
    } else {
      console.log('[API Router] No route found for:', path);
      return res.status(404).json({ error: 'Endpoint not found' });
    }
  });
});
