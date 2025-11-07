import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from '../lib/toast';

const WaitingRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [roomTitle, setRoomTitle] = useState('Meeting');

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    const storedRoomId = sessionStorage.getItem('currentRoomId');
    if (!storedRoomId) {
      toast.error('No meeting room found');
      navigate('/home');
      return;
    }

    // Listen for participant status changes
    const participantRef = doc(db, 'rooms', storedRoomId, 'participants', user.uid);
    const unsubscribe = onSnapshot(participantRef, (doc) => {
      if (doc.exists()) {
        const participantData = doc.data() as any;
        const lobbyStatus = participantData.lobbyStatus || 'admitted';

        if (lobbyStatus === 'admitted') {
          // Participant has been admitted, navigate to pre-meeting
          toast.success('You have been admitted to the meeting!');
          sessionStorage.setItem('lobbyStatus', 'admitted');
          navigate('/pre-meeting');
        } else if (lobbyStatus === 'denied') {
          // Participant has been denied
          toast.error('You have been denied access to this meeting');
          sessionStorage.removeItem('currentRoomId');
          sessionStorage.removeItem('lobbyStatus');
          navigate('/home');
        }
      }
    });

    // Load room title
    const roomRef = doc(db, 'rooms', storedRoomId);
    const unsubscribeRoom = onSnapshot(roomRef, (roomDoc) => {
      if (roomDoc.exists()) {
        const roomData = roomDoc.data();
        setRoomTitle(roomData.title || 'Meeting');
      }
    });

    return () => {
      unsubscribe();
      unsubscribeRoom();
    };
  }, [user, navigate]);

  const handleLeave = () => {
    sessionStorage.removeItem('currentRoomId');
    sessionStorage.removeItem('lobbyStatus');
    navigate('/home');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight via-techBlue to-violetDeep flex items-center justify-center p-4">
      <div className="bg-cloud rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 bg-goldBright rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-midnight animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-midnight mb-2">Waiting in the Lobby</h1>
        <p className="text-gray-600 mb-1">{roomTitle}</p>
        <p className="text-sm text-gray-500 mb-6">
          The meeting host will admit you shortly
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center space-x-2 text-yellow-800">
            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="font-medium">Waiting for host approval...</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm text-gray-600 space-y-1">
            <p>✓ You're in the waiting room</p>
            <p>✓ The host has been notified</p>
            <p>✓ You'll be admitted automatically when approved</p>
          </div>

          <button
            onClick={handleLeave}
            className="w-full mt-6 px-4 py-2 bg-gray-200 text-midnight rounded-lg hover:bg-gray-300 font-medium transition-colors"
          >
            Leave Waiting Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default WaitingRoomPage;

