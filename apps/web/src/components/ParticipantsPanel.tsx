import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Participant } from '../lib/meetingService';
import { api } from '../lib/api';
import toast from '../lib/toast';
import { useLiveKit } from '../contexts/LiveKitContext';
import { Track, RemoteTrackPublication } from 'livekit-client';

interface ParticipantsPanelProps {
  participants: Participant[];
  isHost: boolean;
  roomId: string;
}

const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants,
  isHost,
  roomId,
}) => {
  const { user } = useAuth();
  const { participants: liveKitParticipants } = useLiveKit();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  
  // Get all participants including waiting ones for hosts
  const allParticipants = participants.filter(p => !p.leftAt);
  const waitingParticipants = allParticipants.filter(p => p.lobbyStatus === 'waiting');
  const admittedParticipants = allParticipants.filter(p => !p.lobbyStatus || p.lobbyStatus === 'admitted');

  const handlePromote = async (participantId: string, newRole: 'speaker' | 'viewer' | 'cohost') => {
    if (!isHost) {
      toast.error('Only hosts can update participant roles');
      return;
    }
    
    setIsProcessing(participantId);
    try {
      console.log('[ParticipantsPanel] Updating role for participant:', participantId, 'to role:', newRole, 'in room:', roomId);
      const result = await api.updateParticipantRole(roomId, participantId, newRole);
      console.log('[ParticipantsPanel] Update role result:', result);
      toast.success(`Participant role updated to ${newRole}`);
    } catch (error: any) {
      console.error('[ParticipantsPanel] Update role error:', error);
      const errorMessage = error.message || error.error || 'Failed to update participant role';
      toast.error(errorMessage);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleRemove = async (participantId: string) => {
    if (!isHost) {
      toast.error('Only hosts can remove participants');
      return;
    }
    
    if (!confirm('Are you sure you want to remove this participant from the meeting?')) {
      return;
    }
    
    setIsProcessing(participantId);
    try {
      console.log('[ParticipantsPanel] Removing participant:', participantId, 'from room:', roomId);
      const result = await api.removeParticipant(roomId, participantId);
      console.log('[ParticipantsPanel] Remove result:', result);
      toast.success('Participant removed successfully');
    } catch (error: any) {
      console.error('[ParticipantsPanel] Remove error:', error);
      const errorMessage = error.message || error.error || 'Failed to remove participant';
      toast.error(errorMessage);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleMute = async (participantId: string) => {
    if (!isHost) {
      toast.error('Only hosts can mute participants');
      return;
    }
    
    setIsProcessing(participantId);
    try {
      console.log('[ParticipantsPanel] Muting participant:', participantId, 'in room:', roomId);
      const result = await api.muteParticipant(roomId, participantId);
      console.log('[ParticipantsPanel] Mute result:', result);
      toast.success('Participant muted');
    } catch (error: any) {
      console.error('[ParticipantsPanel] Mute error:', error);
      const errorMessage = error.message || error.error || 'Failed to mute participant';
      toast.error(errorMessage);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleUnmute = async (participantId: string) => {
    if (!isHost) {
      toast.error('Only hosts can unmute participants');
      return;
    }
    
    setIsProcessing(participantId);
    try {
      console.log('[ParticipantsPanel] Unmuting participant:', participantId, 'in room:', roomId);
      const result = await api.unmuteParticipant(roomId, participantId);
      console.log('[ParticipantsPanel] Unmute result:', result);
      toast.success('Participant unmuted');
    } catch (error: any) {
      console.error('[ParticipantsPanel] Unmute error:', error);
      const errorMessage = error.message || error.error || 'Failed to unmute participant';
      toast.error(errorMessage);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleAdmit = async (participantId: string) => {
    if (!isHost) return;
    
    setIsProcessing(participantId);
    try {
      await api.admitParticipant(roomId, participantId);
      toast.success('Participant admitted');
    } catch (error: any) {
      toast.error('Failed to admit participant: ' + error.message);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDeny = async (participantId: string) => {
    if (!isHost) return;
    
    setIsProcessing(participantId);
    try {
      await api.denyParticipant(roomId, participantId);
      toast.success('Participant denied');
    } catch (error: any) {
      toast.error('Failed to deny participant: ' + error.message);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleAdmitAll = async () => {
    if (!isHost || waitingParticipants.length === 0) return;
    
    setIsProcessing('all');
    try {
      await api.admitAllParticipants(roomId);
      toast.success(`Admitted ${waitingParticipants.length} participant(s)`);
    } catch (error: any) {
      toast.error('Failed to admit participants: ' + error.message);
    } finally {
      setIsProcessing(null);
    }
  };

  const formatJoinTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-300">
        <h3 className="font-semibold text-midnight">Participants</h3>
        <p className="text-sm text-gray-600">
          {admittedParticipants.length} in meeting
          {waitingParticipants.length > 0 && ` • ${waitingParticipants.length} waiting`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Waiting Room Section (Host Only) */}
        {isHost && waitingParticipants.length > 0 && (
          <div className="p-4 border-b border-yellow-200 bg-yellow-50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="font-semibold text-yellow-800">Waiting Room ({waitingParticipants.length})</h4>
              </div>
              <button
                onClick={handleAdmitAll}
                disabled={isProcessing === 'all'}
                className="px-3 py-1 bg-techBlue text-cloud rounded-lg hover:bg-techBlue/90 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing === 'all' ? 'Admitting...' : 'Admit All'}
              </button>
            </div>
            <div className="space-y-2">
              {waitingParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-2 bg-white rounded border border-yellow-200"
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-techBlue to-violetDeep rounded-full flex items-center justify-center">
                      <span className="text-cloud font-medium text-xs">
                        {participant.displayName?.charAt(0).toUpperCase() || participant.uid.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-midnight">
                        {participant.displayName || participant.uid}
                      </p>
                      <p className="text-xs text-gray-500">Waiting for approval</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleAdmit(participant.uid)}
                      disabled={isProcessing === participant.uid}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Admit
                    </button>
                    <button
                      onClick={() => handleDeny(participant.uid)}
                      disabled={isProcessing === participant.uid}
                      className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admitted Participants Section */}
        {admittedParticipants.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <p>No participants in meeting yet</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {admittedParticipants.map((participant) => {
              const isCurrentUser = participant.uid === user?.uid;
              const canModify = isHost && !isCurrentUser;
              
              // Check if participant is muted in LiveKit
              const liveKitParticipant = liveKitParticipants.get(participant.uid);
              const micPublication = liveKitParticipant?.getTrackPublication(Track.Source.Microphone) as RemoteTrackPublication | undefined;
              const isMuted = micPublication?.isMuted ?? false;

              return (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 bg-gradient-to-br from-techBlue to-violetDeep rounded-full flex items-center justify-center">
                      <span className="text-cloud font-medium text-sm">
                        {participant.displayName?.charAt(0).toUpperCase() || participant.uid.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-sm text-midnight">
                          {participant.displayName || participant.uid}
                          {isCurrentUser && ' (You)'}
                        </p>
                        {participant.role === 'host' && (
                          <span className="bg-goldBright text-midnight px-2 py-1 rounded text-xs font-medium">
                            Host
                          </span>
                        )}
                        {participant.role === 'cohost' && (
                          <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
                            Co-Host
                          </span>
                        )}
                        {participant.role === 'speaker' && (
                          <span className="bg-violetDeep text-cloud px-2 py-1 rounded text-xs font-medium">
                            Speaker
                          </span>
                        )}
                        {participant.role === 'viewer' && (
                          <span className="bg-gray-500 text-white px-2 py-1 rounded text-xs font-medium">
                            Viewer
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Joined {formatJoinTime(participant.joinedAt)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  {canModify && (
                    <div className="flex items-center space-x-1">
                      {/* Mute/Unmute button */}
                      <button
                        onClick={() => {
                          if (isMuted) {
                            handleUnmute(participant.uid);
                          } else {
                            handleMute(participant.uid);
                          }
                        }}
                        disabled={isProcessing === participant.uid}
                        className={`p-1.5 rounded transition-colors disabled:opacity-50 ${
                          isMuted 
                            ? 'text-red-600 hover:bg-red-100' 
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                        title={isMuted ? 'Unmute participant' : 'Mute participant'}
                      >
                        {isMuted ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        )}
                      </button>
                      
                      {/* Role management */}
                      {participant.role === 'viewer' && (
                        <button
                          onClick={() => handlePromote(participant.uid, 'speaker')}
                          disabled={isProcessing === participant.uid}
                          className="p-1.5 text-violetDeep hover:bg-violetDeep hover:text-cloud rounded transition-colors disabled:opacity-50"
                          title="Promote to speaker"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                          </svg>
                        </button>
                      )}
                      {participant.role === 'speaker' && (
                        <>
                          <button
                            onClick={() => handlePromote(participant.uid, 'cohost')}
                            disabled={isProcessing === participant.uid}
                            className="p-1.5 text-blue-600 hover:bg-blue-600 hover:text-white rounded transition-colors disabled:opacity-50"
                            title="Promote to co-host"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handlePromote(participant.uid, 'viewer')}
                            disabled={isProcessing === participant.uid}
                            className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                            title="Demote to viewer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                            </svg>
                          </button>
                        </>
                      )}
                      {participant.role === 'cohost' && (
                        <button
                          onClick={() => handlePromote(participant.uid, 'speaker')}
                          disabled={isProcessing === participant.uid}
                          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                          title="Demote to speaker"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                          </svg>
                        </button>
                      )}
                      
                      {/* Remove button */}
                      <button
                        onClick={() => handleRemove(participant.uid)}
                        disabled={isProcessing === participant.uid}
                        className="p-1.5 text-red-600 hover:bg-red-600 hover:text-white rounded transition-colors disabled:opacity-50"
                        title="Remove participant"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParticipantsPanel;
