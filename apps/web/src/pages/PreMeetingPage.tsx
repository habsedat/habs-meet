import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MeetingService } from '../lib/meetingService';
import PreMeetingSetup from '../components/PreMeetingSetup';
import toast from 'react-hot-toast';

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

    // Check if user is a participant (from join link)
    const isParticipantFlag = sessionStorage.getItem('isParticipant');
    setIsParticipant(isParticipantFlag === 'true');

    // Load room information
    const loadRoom = async () => {
      try {
        const room = await MeetingService.getMeeting(storedRoomId);
        if (room) {
          setRoomTitle(room.title);
        } else {
          toast.error('Meeting room not found');
          navigate('/home');
        }
      } catch (error) {
        console.error('Error loading room:', error);
        toast.error('Failed to load meeting room');
        navigate('/home');
      } finally {
        setIsLoading(false);
      }
    };

    loadRoom();
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

  return (
    <PreMeetingSetup 
      roomId={roomId!} 
      roomTitle={roomTitle}
      isParticipant={isParticipant}
    />
  );
};

export default PreMeetingPage;

