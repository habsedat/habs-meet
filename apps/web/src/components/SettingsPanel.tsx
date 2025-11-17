import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../contexts/LiveKitContext';
import { api } from '../lib/api';
import toast from '../lib/toast';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface SettingsPanelProps {
  roomId?: string;
  isHost?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ roomId, isHost = false }) => {
  const { userProfile, updateUserProfile } = useAuth();
  const { room } = useLiveKit();
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState<number | null>(null);
  const [isSettingCapacity, setIsSettingCapacity] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || displayName === userProfile?.displayName) return;

    setIsUpdating(true);
    try {
      await updateUserProfile(displayName.trim());
    } catch (error) {
      // Error is handled by the auth context
    } finally {
      setIsUpdating(false);
    }
  };

  const getConnectionInfo = () => {
    if (!room) return null;
    
    return {
      roomName: room.name,
      participantCount: room.participants.size,
      connectionState: room.state,
    };
  };

  const connectionInfo = getConnectionInfo();

  // Load room capacity settings
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setMaxParticipants(data.maxParticipants || null);
      }
    });

    return unsubscribe;
  }, [roomId]);

  const handleSetCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !isHost || maxParticipants === null || maxParticipants < 1) return;

    setIsSettingCapacity(true);
    try {
      await api.enforceParticipantCapacity(roomId, maxParticipants);
      toast.success(`Participant capacity set to ${maxParticipants}`);
    } catch (error: any) {
      toast.error('Failed to set capacity: ' + error.message);
    } finally {
      setIsSettingCapacity(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-300">
        <h3 className="font-semibold text-midnight">Settings</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Profile Settings */}
        <div>
          <h4 className="font-medium text-midnight mb-3">Profile</h4>
          <form onSubmit={handleUpdateProfile} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input text-sm"
                placeholder="Enter your display name"
                maxLength={50}
              />
            </div>
            <button
              type="submit"
              disabled={isUpdating || !displayName.trim() || displayName === userProfile?.displayName}
              className="btn btn-primary text-sm w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdating ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>

        {/* Connection Info */}
        {connectionInfo && (
          <div>
            <h4 className="font-medium text-midnight mb-3">Connection</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Room:</span>
                <span className="text-midnight font-medium">{connectionInfo.roomName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Participants:</span>
                <span className="text-midnight font-medium">{connectionInfo.participantCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${
                  connectionInfo.connectionState === 'connected' 
                    ? 'text-green-600' 
                    : 'text-yellow-600'
                }`}>
                  {connectionInfo.connectionState}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Audio/Video Settings */}
        <div>
          <h4 className="font-medium text-midnight mb-3">Media</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Microphone</span>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-600">Default</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Camera</span>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-600">Default</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Speaker</span>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-600">Default</span>
              </div>
            </div>
          </div>
        </div>

        {/* Host Controls - Capacity Enforcement */}
        {isHost && roomId && (
          <div>
            <h4 className="font-medium text-midnight mb-3">Meeting Controls</h4>
            <form onSubmit={handleSetCapacity} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Maximum Participants
                </label>
                <input
                  type="number"
                  value={maxParticipants || ''}
                  onChange={(e) => setMaxParticipants(e.target.value ? parseInt(e.target.value) : null)}
                  className="input text-sm"
                  placeholder="No limit"
                  min="1"
                  max="1000"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Set a limit on the number of participants. Excess participants will be removed.
                </p>
              </div>
              <button
                type="submit"
                disabled={isSettingCapacity || maxParticipants === null || maxParticipants < 1}
                className="btn btn-primary text-sm w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSettingCapacity ? 'Setting...' : 'Set Capacity Limit'}
              </button>
              {maxParticipants !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setMaxParticipants(null);
                    // Optionally remove capacity limit
                  }}
                  className="btn btn-secondary text-sm w-full"
                >
                  Remove Limit
                </button>
              )}
            </form>
          </div>
        )}

        {/* Keyboard Shortcuts */}
        <div>
          <h4 className="font-medium text-midnight mb-3">Keyboard Shortcuts</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Mute/Unmute:</span>
              <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">M</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Video On/Off:</span>
              <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">V</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Screen Share:</span>
              <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">S</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Leave Meeting:</span>
              <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">Esc</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;



