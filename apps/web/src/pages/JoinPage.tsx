import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MeetingService } from '../lib/meetingService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

const JoinPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, userProfile, loading } = useAuth();

  useEffect(() => {
    // Wait for auth to load
    if (loading) return;

    // Redirect to login if not authenticated
    if (!user) {
      const returnUrl = encodeURIComponent(window.location.href);
      navigate(`/?returnUrl=${returnUrl}`);
      return;
    }

    // Redirect if no room ID
    if (!roomId) {
      toast.error('Invalid join link');
      navigate('/home');
      return;
    }

    // Handle joining
    const handleJoin = async () => {
      try {
        // Check if room exists
        const room = await MeetingService.getMeeting(roomId);
        if (!room) {
          toast.error('Meeting room not found');
          navigate('/home');
          return;
        }

        // Check if room is locked
        if (room.status === 'locked') {
          // Check if user is already a participant
          const participantRef = doc(db, 'rooms', roomId, 'participants', user!.uid);
          const participantSnap = await getDoc(participantRef);
          
          if (!participantSnap.exists()) {
            // User is not a participant and room is locked - deny access
            toast.error('This meeting is locked. Only existing participants can join.');
            navigate('/home');
            return;
          }
          // User is already a participant - allow them to rejoin
        }

        // Add participant to meeting (will update existing if already present)
        if (user && userProfile) {
          await MeetingService.addParticipant(roomId, {
            uid: user.uid,
            displayName: userProfile.displayName,
            role: 'viewer',
            isActive: true,
            isMuted: false,
            isVideoEnabled: true,
            isScreenSharing: false,
          });
        }

        // Store room ID in session for pre-meeting page
        sessionStorage.setItem('currentRoomId', roomId);
        sessionStorage.setItem('isParticipant', 'true');

        // Navigate to pre-meeting setup
        navigate('/pre-meeting');
      } catch (error: any) {
        console.error('Error joining meeting:', error);
        toast.error('Failed to join meeting: ' + error.message);
        navigate('/home');
      }
    };

    handleJoin();
  }, [roomId, user, userProfile, loading, navigate]);

  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-techBlue mx-auto mb-4"></div>
        <h2 className="text-2xl font-semibold text-cloud mb-2">Joining Meeting</h2>
        <p className="text-gray-300">Please wait...</p>
      </div>
    </div>
  );
};

export default JoinPage;
