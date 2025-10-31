import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import Header from '../components/Header';

const JoinPage: React.FC = () => {
  const { shortCode } = useParams<{ shortCode: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<any>(null);

  const redeemInvite = async () => {
    if (!shortCode || !user) return;

    setIsRedeeming(true);
    setError(null);
    try {
      const result = await api.redeemInvite(shortCode);
      
      console.log('Successfully redeemed invite! Going to pre-meeting setup...');
      
      // Store room ID and join grant in session storage
      sessionStorage.setItem('currentRoomId', result.roomId);
      sessionStorage.setItem('joinGrant', result.joinGrant);
      
      // Mark this as a participant joining (not host)
      sessionStorage.setItem('isParticipant', 'true');
      
      // Navigate to pre-meeting page for setup
      navigate('/pre-meeting');
    } catch (error: any) {
      console.error('Failed to join meeting: ' + error.message);
      setError(error.message || 'Failed to join meeting. Please try again.');
    } finally {
      setIsRedeeming(false);
    }
  };

  useEffect(() => {
    if (!shortCode) {
      console.error('Invalid invite link');
      setError('Invalid invite link. Please check the link and try again.');
      return;
    }

    // Load invite info
    const loadInviteInfo = async () => {
      try {
        const info = await api.getInviteInfo(shortCode);
        setInviteInfo(info);
      } catch (error: any) {
        console.error('Failed to load invite info:', error);
        setError(error.message || 'Invalid invite link.');
      }
    };

    loadInviteInfo();
  }, [shortCode]);

  // Wait for auth to finish loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  // If user is not authenticated, redirect to login with return URL
  if (!user) {
    const returnUrl = encodeURIComponent(window.location.href);
    navigate(`/?returnUrl=${returnUrl}`);
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Header />
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-white mb-4">Error</h1>
            <p className="text-gray-300 mb-6">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!inviteInfo) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading invite details...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Header />
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-blue-500 text-6xl mb-4">🎥</div>
            <h1 className="text-2xl font-bold text-white mb-2">Join Meeting</h1>
            <p className="text-gray-300 mb-6">{inviteInfo.roomName}</p>
            
            <div className="bg-gray-700 rounded-lg p-4 mb-6">
              <div className="text-sm text-gray-400 mb-2">Invite Details</div>
              <div className="text-white">
                <div className="flex justify-between mb-2">
                  <span>Role:</span>
                  <span className="capitalize">{inviteInfo.role}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>Uses:</span>
                  <span>{inviteInfo.used}/{inviteInfo.maxUses === 999999 ? '∞' : inviteInfo.maxUses}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expires:</span>
                  <span>{new Date(inviteInfo.expiresAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <button
              onClick={redeemInvite}
              disabled={isRedeeming}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors"
            >
              {isRedeeming ? 'Joining...' : 'Join Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinPage;
