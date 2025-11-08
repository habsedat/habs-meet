import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Participant } from '../lib/meetingService';
import { api } from '../lib/api';
import toast from '../lib/toast';

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
  const [actionState, setActionState] = useState<{ id: string; action: string } | null>(null);

  const startAction = (id: string, action: string) => setActionState({ id, action });
  const stopAction = () => setActionState(null);
  const isProcessing = (id: string, action: string) => actionState?.id === id && actionState?.action === action;
  
  // Get all participants including waiting ones for hosts
  const allParticipants = participants.filter(p => !p.leftAt);
  const waitingParticipants = allParticipants.filter(p => p.lobbyStatus === 'waiting');
  const admittedParticipants = allParticipants.filter(p => (!p.lobbyStatus || p.lobbyStatus === 'admitted') && p.isActive !== false);

  const handleSetRole = async (
    participantId: string,
    newRole: 'host' | 'cohost' | 'speaker' | 'viewer'
  ) => {
    if (!isHost) return;

    startAction(participantId, `role-${newRole}`);
    try {
      await api.updateParticipantRole(roomId, participantId, newRole);
      toast.success(`Participant updated to ${newRole === 'cohost' ? 'Co-Host' : newRole}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update participant role');
    } finally {
      stopAction();
    }
  };

  const handleRemove = async (participantId: string) => {
    if (!isHost) return;

    startAction(participantId, 'remove');
    try {
      await api.removeParticipant(roomId, participantId);
      toast.success('Participant removed from meeting');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove participant');
    } finally {
      stopAction();
    }
  };

  const handleAdmit = async (participantId: string) => {
    if (!isHost) return;
    
    startAction(participantId, 'admit');
    try {
      await api.admitParticipant(roomId, participantId);
      toast.success('Participant admitted');
    } catch (error: any) {
      toast.error('Failed to admit participant: ' + error.message);
    } finally {
      stopAction();
    }
  };

  const handleDeny = async (participantId: string) => {
    if (!isHost) return;
    
    startAction(participantId, 'deny');
    try {
      await api.denyParticipant(roomId, participantId);
      toast.success('Participant denied');
    } catch (error: any) {
      toast.error('Failed to deny participant: ' + error.message);
    } finally {
      stopAction();
    }
  };

  const handleAdmitAll = async () => {
    if (!isHost || waitingParticipants.length === 0) return;
    
    startAction('all', 'admit-all');
    try {
      await api.admitAllParticipants(roomId);
      toast.success(`Admitted ${waitingParticipants.length} participant(s)`);
    } catch (error: any) {
      toast.error('Failed to admit participants: ' + error.message);
    } finally {
      stopAction();
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
                disabled={isProcessing('all', 'admit-all')}
                className="px-3 py-1 bg-techBlue text-cloud rounded-lg hover:bg-techBlue/90 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing('all', 'admit-all') ? 'Admitting...' : 'Admit All'}
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
                      onClick={() => handleAdmit(participant.id)}
                      disabled={isProcessing(participant.id, 'admit')}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing(participant.id, 'admit') ? 'Admitting...' : 'Admit'}
                    </button>
                    <button
                      onClick={() => handleDeny(participant.id)}
                      disabled={isProcessing(participant.id, 'deny')}
                      className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing(participant.id, 'deny') ? 'Denying...' : 'Deny'}
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
                          <span className="bg-blue-200 text-blue-900 px-2 py-1 rounded text-xs font-medium">
                            Co-Host
                          </span>
                        )}
                        {participant.role === 'speaker' && (
                          <span className="bg-violetDeep text-cloud px-2 py-1 rounded text-xs font-medium">
                            Speaker
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
                      {participant.role === 'viewer' && (
                        <>
                          <button
                            onClick={() => handleSetRole(participant.id, 'speaker')}
                            disabled={isProcessing(participant.id, 'role-speaker')}
                            className="p-1 text-violetDeep hover:bg-violetDeep hover:text-cloud rounded transition-colors disabled:opacity-50"
                            title="Promote to speaker"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleSetRole(participant.id, 'cohost')}
                            disabled={isProcessing(participant.id, 'role-cohost')}
                            className="p-1 text-blue-600 hover:bg-blue-600 hover:text-cloud rounded transition-colors disabled:opacity-50"
                            title="Make Co-Host"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </>
                      )}
                      {participant.role === 'speaker' && (
                        <>
                          <button
                            onClick={() => handleSetRole(participant.id, 'viewer')}
                            disabled={isProcessing(participant.id, 'role-viewer')}
                            className="p-1 text-gray-600 hover:bg-gray-600 hover:text-cloud rounded transition-colors disabled:opacity-50"
                            title="Demote to viewer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleSetRole(participant.id, 'cohost')}
                            disabled={isProcessing(participant.id, 'role-cohost')}
                            className="p-1 text-blue-600 hover:bg-blue-600 hover:text-cloud rounded transition-colors disabled:opacity-50"
                            title="Make Co-Host"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </>
                      )}
                      {participant.role === 'cohost' && (
                        <>
                          <button
                            onClick={() => handleSetRole(participant.id, 'speaker')}
                            disabled={isProcessing(participant.id, 'role-speaker')}
                            className="p-1 text-violetDeep hover:bg-violetDeep hover:text-cloud rounded transition-colors disabled:opacity-50"
                            title="Demote to speaker"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleSetRole(participant.id, 'viewer')}
                            disabled={isProcessing(participant.id, 'role-viewer')}
                            className="p-1 text-gray-600 hover:bg-gray-600 hover:text-cloud rounded transition-colors disabled:opacity-50"
                            title="Demote to viewer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                            </svg>
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleRemove(participant.id)}
                        disabled={isProcessing(participant.id, 'remove')}
                        className="p-1 text-red-600 hover:bg-red-600 hover:text-cloud rounded transition-colors"
                        title="Remove participant"
                      >
                        {isProcessing(participant.id, 'remove') ? (
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
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
