import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import toast from '../lib/toast';
import Header from '../components/Header';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const InvitePage: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [, setInviteInfo] = useState<any>(null);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!inviteId || !token) {
      toast.error('Invalid invite link');
      navigate('/');
      return;
    }

    if (!user) {
      navigate('/');
    } else {
      redeemInvite();
    }
  }, [inviteId, token, user, navigate]);

  const redeemInvite = async () => {
    if (!token || !user) return;

    setIsRedeeming(true);
    try {
      const result = await api.redeemInvite(token);
      
      // Check if room is locked before allowing join
      const roomRef = doc(db, 'rooms', result.roomId);
      const roomSnap = await getDoc(roomRef);
      
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        if (roomData?.status === 'locked') {
          toast.error('This meeting is locked. The host has locked the meeting. Please wait for the host to unlock it.');
          navigate('/');
          setIsRedeeming(false);
          return;
        }
      }
      
      setInviteInfo(result);
      
      // Store room ID in session for pre-meeting page
      sessionStorage.setItem('currentRoomId', result.roomId);
      sessionStorage.setItem('isParticipant', 'true');
      
      toast.success('Successfully joined the meeting!');
      navigate('/pre-meeting');
    } catch (error: any) {
      toast.error('Failed to join meeting: ' + error.message);
      navigate('/');
    } finally {
      setIsRedeeming(false);
    }
  };


  if (isRedeeming) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-techBlue mx-auto mb-4"></div>
          <h2 className="text-2xl font-semibold text-cloud mb-2">Joining Meeting</h2>
          <p className="text-gray-300">Please wait while we connect you...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight">
      <Header showUserMenu={!!user} />
      
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-md mx-auto">
          <div className="card p-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-techBlue to-violetDeep rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-cloud"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            
            <h1 className="text-2xl font-bold text-midnight mb-4">
              Meeting Invitation
            </h1>
            
            <p className="text-gray-600 mb-6">
              You've been invited to join a meeting. Please sign in to continue.
            </p>
            
            <button
              onClick={() => navigate('/')}
              className="btn btn-primary w-full"
            >
              Sign In to Join
            </button>
          </div>
        </div>
      </main>

    </div>
  );
};

export default InvitePage;
