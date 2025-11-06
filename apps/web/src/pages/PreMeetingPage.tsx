import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MeetingService } from '../lib/meetingService';
import PreMeetingSetup from '../components/PreMeetingSetup';
import toast from 'react-hot-toast';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const PreMeetingPage: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [roomTitle, setRoomTitle] = useState('Meeting Room');
  const [isLoading, setIsLoading] = useState(true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isParticipant, setIsParticipant] = useState(false);

  useEffect(() => {
    if (!user || !userProfile) {
      toast.error('Please log in to join the meeting');
      navigate('/');
      return;
    }

    // Check for pending invite first
    const pendingInvite = sessionStorage.getItem('pendingInvite');
    if (pendingInvite) {
      try {
        const inviteData = JSON.parse(pendingInvite);
        sessionStorage.removeItem('pendingInvite');
        
        // Handle invite redemption
        handleInviteRedemption(inviteData.inviteId, inviteData.token);
        return;
      } catch (error) {
        console.error('Error parsing invite data:', error);
        sessionStorage.removeItem('pendingInvite');
      }
    }

    // Get room ID from session storage (set when creating a room)
    const storedRoomId = sessionStorage.getItem('currentRoomId');
    if (!storedRoomId) {
      toast.error('No meeting room found. Please create or join a meeting.');
      navigate('/home');
      return;
    }

    setRoomId(storedRoomId);

    // Note: isParticipant will be determined in loadRoom based on whether user is creator or joined via invite

    let unsubscribeRoomListener: (() => void) | null = null;

        // Load room information and listen for status changes
    const loadRoom = async () => {
      try {
        // Check if this is a scheduled meeting - if so, wait a bit for room to be created
        const isScheduledMeeting = sessionStorage.getItem('isScheduledMeeting') === 'true';
        if (isScheduledMeeting) {
          // Wait a moment for room to be created in Firestore
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const room = await MeetingService.getMeeting(storedRoomId);
        if (room) {
          setRoomTitle(room.title);

          // Check if room is already ended
          if (room.status === 'ended') {
            toast('This meeting has ended. You can now create a new meeting.', { icon: 'ℹ️', duration: 4000 });
            // Clear session storage to allow creating a new meeting
            sessionStorage.removeItem('currentRoomId');
            sessionStorage.removeItem('isParticipant');
            sessionStorage.removeItem('pendingInvite');
            sessionStorage.removeItem('meetingToken');
            sessionStorage.removeItem('isScheduledMeeting');
            // Reset state to allow creating a new meeting
            setRoomId(null);
            setIsParticipant(false);
            setIsLoading(false);
            return;
          }

          // Determine if user is a participant or host (creator)
          // For scheduled meetings, check sessionStorage for role
          if (isScheduledMeeting) {
            const isParticipantFlag = sessionStorage.getItem('isParticipant');
            setIsParticipant(isParticipantFlag === 'true');
          } else {
            // Regular meeting - check if user is creator
            const isUserCreator = room.createdBy === user?.uid;
            if (isUserCreator) {
              // User created the meeting, so they are the host (not a participant)
              setIsParticipant(false);
              // Also clear the isParticipant flag from sessionStorage to ensure consistency
              sessionStorage.removeItem('isParticipant');
            } else {
              // User joined via invite link, check sessionStorage
              const isParticipantFlag = sessionStorage.getItem('isParticipant');
              setIsParticipant(isParticipantFlag === 'true');
            }
          }
        } else {
          // If it's a scheduled meeting and room doesn't exist yet, wait a bit more and retry
          if (isScheduledMeeting) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retryRoom = await MeetingService.getMeeting(storedRoomId);
            if (retryRoom) {
              setRoomTitle(retryRoom.title);
              const isParticipantFlag = sessionStorage.getItem('isParticipant');
              setIsParticipant(isParticipantFlag === 'true');
            } else {
              toast.error('Meeting room not found. Please try joining again.');
              navigate('/home');
              return;
            }
          } else {
            toast.error('Meeting room not found');
            navigate('/home');
            return;
          }
        }
      } catch (error) {
        console.error('Error loading room:', error);
        toast.error('Failed to load meeting room');
        navigate('/home');
        return;
      } finally {
        setIsLoading(false);
      }

      // Listen for room status changes (especially when meeting ends)
      const roomRef = doc(db, 'rooms', storedRoomId);
      unsubscribeRoomListener = onSnapshot(roomRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const roomData = docSnapshot.data();
          if (roomData.status === 'ended') {
            toast('This meeting has ended. You can now create a new meeting.', { icon: 'ℹ️', duration: 4000 });
            // Clear session storage to allow creating a new meeting
            sessionStorage.removeItem('currentRoomId');
            sessionStorage.removeItem('isParticipant');
            sessionStorage.removeItem('pendingInvite');
            sessionStorage.removeItem('meetingToken');
            sessionStorage.removeItem('isScheduledMeeting');
            // Reset state to allow creating a new meeting
            setRoomId(null);
            setIsParticipant(false);
            // Stop listening since meeting is ended
            if (unsubscribeRoomListener) {
              unsubscribeRoomListener();
              unsubscribeRoomListener = null;
            }
          }
        } else {
          // Room deleted
          toast('This meeting has been removed. You can now create a new meeting.', { icon: 'ℹ️', duration: 4000 });
          sessionStorage.removeItem('currentRoomId');
          sessionStorage.removeItem('isParticipant');
          sessionStorage.removeItem('pendingInvite');
          sessionStorage.removeItem('meetingToken');
          sessionStorage.removeItem('isScheduledMeeting');
          setRoomId(null);
          setIsParticipant(false);
          // Stop listening since room is deleted
          if (unsubscribeRoomListener) {
            unsubscribeRoomListener();
            unsubscribeRoomListener = null;
          }
        }
      });
    };

    loadRoom();

    // Cleanup listener on unmount or when dependencies change
    return () => {
      if (unsubscribeRoomListener) {
        unsubscribeRoomListener();
      }
    };
  }, [user, userProfile, navigate]);

  const handleInviteRedemption = async (_inviteId: string, token: string) => {
    try {
      setIsLoading(true);
      
      // Import API client
      const { api } = await import('../lib/api');
      
      // Redeem invite
      const result = await api.redeemInvite(token);
      
      // Get meeting token and store room ID
      const { token: meetingToken } = await api.getMeetingToken(result.roomId, result.joinGrant);
      
      // Store room ID and token for the meeting
      sessionStorage.setItem('currentRoomId', result.roomId);
      sessionStorage.setItem('meetingToken', meetingToken);
      
      toast.success('Successfully joined the meeting!');
      setRoomId(result.roomId);
      setIsLoading(false);
      
    } catch (error: any) {
      console.error('Error redeeming invite:', error);
      toast.error('Failed to join meeting: ' + error.message);
      navigate('/home');
    }
  };

    // Handle creating a new meeting when current meeting has ended
  const handleCreateNewMeeting = async () => {
    if (!user || !userProfile) {
      toast.error('Please log in to create a meeting');
      navigate('/');
      return;
    }

    try {
      const newRoomId = await MeetingService.createMeeting(
        `${userProfile.displayName || user.email?.split('@')[0]}'s Habs Meet`,
        user.uid,
        userProfile.displayName || user.email?.split('@')[0] || 'User',
        'Professional meeting room with video and audio capabilities'
      );

            toast.success('Meeting created successfully!');

      // Store new room ID in session storage
      sessionStorage.setItem('currentRoomId', newRoomId);
      // Explicitly clear isParticipant since user is the creator (host), not a participant
      sessionStorage.removeItem('isParticipant');
      sessionStorage.removeItem('pendingInvite');
      sessionStorage.removeItem('meetingToken');
      sessionStorage.removeItem('isScheduledMeeting');

      // Load new room title first
      const room = await MeetingService.getMeeting(newRoomId);
      if (room) {
        setRoomTitle(room.title);
      }

      // Update state with new room - ensure isParticipant is false since user is creator
      setRoomId(newRoomId);
      setIsParticipant(false); // User created the meeting, so they are the host (not a participant)
    } catch (error: any) {
      console.error('Error creating meeting:', error);
      toast.error('Failed to create meeting: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-midnight via-techBlue to-violetDeep flex items-center justify-center">                                                        
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-goldBright mx-auto mb-4"></div>                                                                         
          <p className="text-cloud text-lg">Loading meeting setup...</p>
        </div>
      </div>
    );
  }

  // Show create meeting interface if no roomId (meeting ended or no meeting found)
  if (!roomId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-midnight via-techBlue to-violetDeep flex items-center justify-center p-4">
        <div className="bg-midnight/98 backdrop-blur-lg rounded-xl w-full max-w-md border border-white/10 overflow-hidden shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-goldBright rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-midnight" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-cloud mb-4">Meeting Ended</h2>
          <p className="text-cloud/80 mb-6">
            The previous meeting has ended. Would you like to create a new meeting?
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleCreateNewMeeting}
              className="flex-1 bg-goldBright text-midnight py-3 px-6 rounded-lg font-semibold hover:bg-yellow-400 transition-colors"
            >
              Create New Meeting
            </button>
            <button
              onClick={() => navigate('/home')}
              className="flex-1 bg-white/10 text-cloud py-3 px-6 rounded-lg font-semibold hover:bg-white/20 transition-colors"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PreMeetingSetup
      roomId={roomId}
      roomTitle={roomTitle}
      isParticipant={isParticipant}
    />
  );
};

export default PreMeetingPage;

