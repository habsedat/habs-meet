const admin = require('firebase-admin');

// Initialize Firebase Admin (you'll need to set up service account)
// admin.initializeApp({
//   credential: admin.credential.applicationDefault(),
// });

const db = admin.firestore();

async function seedData() {
  try {
    console.log('🌱 Seeding test data...');

    // Create a test room
    const roomRef = await db.collection('rooms').add({
      title: 'Test Meeting Room',
      createdBy: 'test-user-123',
      status: 'open',
      waitingRoom: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Created test room:', roomRef.id);

    // Create host participant
    await db.collection('rooms').doc(roomRef.id).collection('participants').doc('test-user-123').set({
      uid: 'test-user-123',
      role: 'host',
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Created host participant');

    // Create a test invite
    const inviteRef = await db.collection('invites').add({
      roomId: roomRef.id,
      createdBy: 'test-user-123',
      role: 'speaker',
      maxUses: 5,
      used: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      revoked: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Created test invite:', inviteRef.id);

    // Add some test chat messages
    const messages = [
      { uid: 'test-user-123', displayName: 'Test Host', text: 'Welcome to the test meeting!' },
      { uid: 'test-user-456', displayName: 'Test Participant', text: 'Thanks for inviting me!' },
      { uid: 'test-user-123', displayName: 'Test Host', text: 'Let\'s get started with the presentation.' },
    ];

    for (const message of messages) {
      await db.collection('rooms').doc(roomRef.id).collection('chat').add({
        ...message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log('✅ Added test chat messages');

    console.log('\n🎉 Seeding completed successfully!');
    console.log(`📝 Room ID: ${roomRef.id}`);
    console.log(`🔗 Invite ID: ${inviteRef.id}`);
    console.log('\n💡 You can now test the application with these IDs.');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
  }
}

// Only run if called directly
if (require.main === module) {
  seedData();
}

module.exports = { seedData };





