import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MeetingService } from '../lib/meetingService';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from '../lib/toast';
import { getScheduledMeetingToken } from '../lib/scheduledMeetingService';
import SEOHead from '../components/SEOHead';

const JoinPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, userProfile, loading } = useAuth();
  const [showPasscodePrompt, setShowPasscodePrompt] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [isRequestingToken, setIsRequestingToken] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);

  // Fetch room data for SEO/meta tags (early, before auth check)
  useEffect(() => {
    if (!roomId) return;

    const fetchRoomForPreview = async () => {
      try {
        const room = await MeetingService.getMeeting(roomId);
        if (room) {
          setRoomData(room);
        }
      } catch (error) {
        // Silently fail - room might not exist yet or user might not have access
        console.log('Could not fetch room for preview:', error);
      }
    };

    fetchRoomForPreview();
  }, [roomId]);

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
        // Check if this is a scheduled meeting (has 'k' query parameter)
        const joinKey = searchParams.get('k');
        
        if (joinKey) {
          // This is a scheduled meeting
          if (!userProfile) {
            toast.error('User profile not available');
            navigate('/home');
            return;
          }

          // Check if passcode is needed (try without first to see if it's required)
          const urlPasscode = searchParams.get('passcode');
          if (!urlPasscode) {
            // Try to get token without passcode first to check if passcode is required
            try {
              const testResponse = await getScheduledMeetingToken({
                meetingId: roomId,
                key: joinKey,
                displayName: userProfile.displayName || user.email?.split('@')[0] || 'User',
                passcode: undefined,
              });

              // If we get a denied status with passcode required message, show prompt
              if (testResponse.status === 'denied' && testResponse.message?.toLowerCase().includes('passcode')) {
                setShowPasscodePrompt(true);
                return;
              }

              // If waiting, expired, or other denied reasons, handle normally
              if (testResponse.status === 'waiting') {
                toast.error(testResponse.message || 'Meeting has not started yet');
                navigate('/home');
                return;
              }

              if (testResponse.status === 'expired') {
                toast.error(testResponse.message || 'Meeting link has expired');
                navigate('/home');
                return;
              }

              // If we got a token, use it
              if (testResponse.status === 'ok' && testResponse.token && testResponse.roomName) {
                await handleSuccessfulTokenResponse(testResponse, userProfile, user);
                return;
              }
            } catch (error: any) {
              // If error mentions passcode, show prompt
              if (error.message?.toLowerCase().includes('passcode')) {
                setShowPasscodePrompt(true);
                return;
              }
              throw error;
            }
          }

          // Get join token from scheduled meeting API (with passcode if provided)
          const tokenResponse = await getScheduledMeetingToken({
            meetingId: roomId,
            key: joinKey,
            displayName: userProfile.displayName || user.email?.split('@')[0] || 'User',
            passcode: urlPasscode || undefined,
          });

          // Handle different response statuses
          if (tokenResponse.status === 'waiting') {
            toast.error(tokenResponse.message || 'Meeting has not started yet');
            navigate('/home');
            return;
          }

          if (tokenResponse.status === 'denied' || tokenResponse.status === 'expired') {
            toast.error(tokenResponse.message || 'Access denied');
            navigate('/home');
            return;
          }

          if (tokenResponse.status !== 'ok' || !tokenResponse.token || !tokenResponse.roomName) {
            toast.error('Failed to get meeting access');
            navigate('/home');
            return;
          }

          await handleSuccessfulTokenResponse(tokenResponse, userProfile, user);
          return;
        }

        // Regular room join (not a scheduled meeting)
        const room = await MeetingService.getMeeting(roomId);
        if (!room) {
          toast.error('Meeting room not found');
          navigate('/home');
          return;
        }

        // Check if user is joining with a host key
        const hostJoinKeyParam = searchParams.get('k');
        let isHostRejoin = false;
        
        if (hostJoinKeyParam && room.hostJoinKey && hostJoinKeyParam === room.hostJoinKey) {
          // Verify user was originally the host (createdBy matches)
          if (room.createdBy === user!.uid) {
            isHostRejoin = true;
            console.log('Host rejoining with host key');
          } else {
            // Invalid host key for this user
            toast.error('Invalid host key');
            navigate('/home');
            return;
          }
        }

        // Check if room is locked - NO ONE can join when locked (except host rejoining with host key)
        if (room.status === 'locked') {
          // Only allow host rejoining with valid host key
          if (!isHostRejoin) {
            // Room is locked - deny access to everyone (including existing participants)
            toast.error('This meeting is locked. The host has locked the meeting. Please wait for the host to unlock it.');
            navigate('/home');
            return;
          }
          // Host rejoining with valid host key is allowed even when locked
        }

        // Check if waiting room is enabled
        const waitingRoomEnabled = room.waitingRoom || false;
        
        // Determine role: host if rejoining as original host, otherwise viewer
        const participantRole = isHostRejoin ? 'host' : 'viewer';
        
        // Add participant to meeting (will update existing if already present)
        if (user && userProfile) {
          const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
          // Hosts are always admitted, others depend on waiting room
          const lobbyStatus = (isHostRejoin || !waitingRoomEnabled) ? 'admitted' : 'waiting';
          
          await setDoc(participantRef, {
            uid: user.uid,
            displayName: userProfile.displayName,
            role: participantRole,
            isActive: true,
            isMuted: false,
            isVideoEnabled: true,
            isScreenSharing: false,
            joinedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
            lobbyStatus: lobbyStatus,
            ...(lobbyStatus === 'admitted' && { admittedAt: serverTimestamp() }),
          }, { merge: true });
        }

        // Store room ID in session for pre-meeting page
        sessionStorage.setItem('currentRoomId', roomId);
        sessionStorage.setItem('isParticipant', 'true');
        if (isHostRejoin) {
          sessionStorage.setItem('isHost', 'true');
        }
        sessionStorage.removeItem('isScheduledMeeting');
        sessionStorage.removeItem('meetingToken');
        
        // Lobby status already determined above (hosts are always admitted)
        const lobbyStatusForSession = (isHostRejoin || !waitingRoomEnabled) ? 'admitted' : 'waiting';
        sessionStorage.setItem('lobbyStatus', lobbyStatusForSession);

        // If waiting room is enabled, navigate to waiting room
        if (waitingRoomEnabled) {
          navigate('/waiting-room');
          return;
        }

        // Navigate to pre-meeting setup
        navigate('/pre-meeting');
      } catch (error: any) {
        console.error('Error joining meeting:', error);
        toast.error('Failed to join meeting: ' + error.message);
        navigate('/home');
      }
    };

    handleJoin();
  }, [roomId, user, userProfile, loading, navigate, searchParams]);

  const handleSuccessfulTokenResponse = async (
    tokenResponse: any,
    userProfile: any,
    user: any
  ) => {
    // Ensure room exists in Firestore (scheduled meetings might not have created it yet)
    const roomRef = doc(db, 'rooms', tokenResponse.roomName);
    const roomSnap = await getDoc(roomRef);
    
    let roomData: any = null;
    if (roomSnap.exists()) {
      roomData = roomSnap.data();
    } else {
      // Create the room document
      roomData = {
        title: tokenResponse.meeting?.title || 'Scheduled Meeting',
        description: tokenResponse.meeting?.description || '',
        createdBy: tokenResponse.meeting?.ownerUid || user.uid,
        createdByName: userProfile.displayName || user.email?.split('@')[0] || 'Host',
        status: 'open' as const,
        waitingRoom: tokenResponse.meeting?.lobbyEnabled || false,
        maxParticipants: 100,
        isRecording: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(roomRef, roomData);
    }
    
    // Check if room is locked - block all joins (except host with host key which is already checked in scheduled meeting flow)
    if (roomData.status === 'locked') {
      // Only allow if user is the host (ownerUid matches)
      const isHost = tokenResponse.role === 'host' || tokenResponse.role === 'cohost' || roomData.createdBy === user.uid;
      if (!isHost) {
        toast.error('This meeting is locked. The host has locked the meeting. Please wait for the host to unlock it.');
        navigate('/home');
        return;
      }
    }

    // Check if waiting room is enabled
    const waitingRoomEnabled = tokenResponse.meeting?.lobbyEnabled || false;
    const isHost = tokenResponse.role === 'host' || tokenResponse.role === 'cohost';

    // Add participant to meeting
    const participantRef = doc(db, 'rooms', tokenResponse.roomName, 'participants', user.uid);
    
    // Set lobby status based on waiting room and role
    const lobbyStatus = waitingRoomEnabled && !isHost ? 'waiting' : 'admitted';
    
    await setDoc(participantRef, {
      uid: user.uid,
      displayName: userProfile.displayName || user.email?.split('@')[0] || 'User',
      role: tokenResponse.role === 'host' ? 'host' : tokenResponse.role === 'cohost' ? 'cohost' : 'viewer',
      isActive: true,
      isMuted: false,
      isVideoEnabled: true,
      isScreenSharing: false,
      joinedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      lobbyStatus: lobbyStatus,
      ...(lobbyStatus === 'admitted' && { admittedAt: serverTimestamp() }),
    }, { merge: true });

    // Store room ID and token for pre-meeting page
    sessionStorage.setItem('currentRoomId', tokenResponse.roomName);
    sessionStorage.setItem('meetingToken', tokenResponse.token);
    sessionStorage.setItem('isScheduledMeeting', 'true');
    sessionStorage.setItem('isParticipant', (tokenResponse.role === 'host' || tokenResponse.role === 'cohost') ? 'false' : 'true');
    sessionStorage.setItem('lobbyStatus', lobbyStatus);

    // If waiting in lobby, navigate to waiting room page
    if (lobbyStatus === 'waiting') {
      navigate('/waiting-room');
      return;
    }

    // Navigate to pre-meeting setup
    navigate('/pre-meeting');
  };

  const handlePasscodeSubmit = async () => {
    if (!passcodeInput.trim()) {
      toast.error('Please enter a passcode');
      return;
    }

    // Validate passcode is exactly 6 digits
    const passcodeRegex = /^\d{6}$/;
    if (!passcodeRegex.test(passcodeInput.trim())) {
      toast.error('Passcode must be exactly 6 digits');
      return;
    }

    if (!userProfile || !roomId) {
      toast.error('Missing user information');
      return;
    }

    setIsRequestingToken(true);
    try {
      const joinKey = searchParams.get('k');
      if (!joinKey) {
        toast.error('Invalid meeting link');
        navigate('/home');
        return;
      }

      const tokenResponse = await getScheduledMeetingToken({
        meetingId: roomId,
        key: joinKey,
        displayName: userProfile.displayName || (user?.email?.split('@')[0]) || 'User',
        passcode: passcodeInput.trim(),
      });

      if (tokenResponse.status === 'denied') {
        toast.error(tokenResponse.message || 'Invalid passcode');
        setPasscodeInput('');
        return;
      }

      if (tokenResponse.status === 'waiting' || tokenResponse.status === 'expired') {
        toast.error(tokenResponse.message || 'Cannot join meeting');
        navigate('/home');
        return;
      }

      if (tokenResponse.status === 'ok' && tokenResponse.token && tokenResponse.roomName) {
        if (!user) {
          toast.error('User not authenticated');
          navigate('/home');
          return;
        }
        await handleSuccessfulTokenResponse(tokenResponse, userProfile, user);
      } else {
        toast.error('Failed to join meeting');
        navigate('/home');
      }
    } catch (error: any) {
      console.error('Error joining with passcode:', error);
      if (error.message?.toLowerCase().includes('passcode') || error.message?.toLowerCase().includes('invalid')) {
        toast.error('Invalid passcode. Please try again.');
        setPasscodeInput('');
      } else {
        toast.error('Failed to join meeting: ' + error.message);
        navigate('/home');
      }
    } finally {
      setIsRequestingToken(false);
    }
  };

  // Generate SEO meta tags based on room data
  const seoTitle = roomData?.title 
    ? `${roomData.title} - Join Meeting | Habs Meet`
    : 'Join Meeting - Habs Meet';
  const seoDescription = roomData?.description 
    ? roomData.description
    : 'Join a premium video meeting on Habs Meet. HD video, screen sharing, and real-time collaboration.';
  const seoUrl = `https://habs-meet-dev.web.app/join/${roomId}`;

  if (showPasscodePrompt) {
    return (
      <>
        <SEOHead 
          title={seoTitle}
          description={seoDescription}
          url={seoUrl}
        />
        <div className="min-h-screen bg-midnight flex items-center justify-center p-4">
        <div className="bg-cloud rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-goldBright rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-midnight" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-midnight mb-2">Passcode Required</h2>
            <p className="text-gray-600">This meeting requires a passcode to join</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-midnight mb-2">
                Enter Passcode
              </label>
              <input
                type="text"
                value={passcodeInput}
                onChange={(e) => {
                  // Only allow digits and limit to 6 characters
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPasscodeInput(value);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && passcodeInput.length === 6) {
                    handlePasscodeSubmit();
                  }
                }}
                placeholder="Enter 6-digit passcode"
                maxLength={6}
                pattern="[0-9]{6}"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900 font-mono text-center text-lg tracking-widest"
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500">
                Enter the 6-digit passcode provided by the meeting host
              </p>
              {passcodeInput.length > 0 && passcodeInput.length < 6 && (
                <p className="mt-1 text-xs text-orange-600">
                  {6 - passcodeInput.length} more digit{6 - passcodeInput.length !== 1 ? 's' : ''} required
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate('/home')}
                className="flex-1 px-4 py-2 bg-gray-200 text-midnight rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handlePasscodeSubmit}
                disabled={isRequestingToken || passcodeInput.length !== 6}
                className="flex-1 px-4 py-2 bg-techBlue text-cloud rounded-lg hover:bg-techBlue/90 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRequestingToken ? 'Joining...' : 'Join Meeting'}
              </button>
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <SEOHead 
        title={seoTitle}
        description={seoDescription}
        url={seoUrl}
      />
      <div className="min-h-screen bg-midnight flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-techBlue mx-auto mb-4"></div>
        <h2 className="text-2xl font-semibold text-cloud mb-2">Joining Meeting</h2>
        <p className="text-gray-300">Please wait...</p>
      </div>
    </div>
    </>
  );
};

export default JoinPage;
