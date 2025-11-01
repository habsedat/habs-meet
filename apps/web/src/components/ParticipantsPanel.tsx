import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Participant } from '../lib/meetingService';

interface ParticipantsPanelProps {
  participants: Participant[];
  isHost: boolean;
  roomId: string;
}

const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants,
  isHost,
}) => {
  const { user } = useAuth();
  const activeParticipants = participants.filter(p => !p.leftAt);

  const handlePromote = async (participantId: string, newRole: 'speaker' | 'viewer') => {
    if (!isHost) return;
    
    try {
      // TODO: Implement participant role change via API
      console.log(`Promoting ${participantId} to ${newRole}`);
    } catch (error) {
      console.error('Failed to promote participant:', error);
    }
  };

  const handleRemove = async (participantId: string) => {
    if (!isHost) return;
    
    try {
      // TODO: Implement participant removal via API
      console.log(`Removing ${participantId}`);
    } catch (error) {
      console.error('Failed to remove participant:', error);
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
          {activeParticipants.length} participant{activeParticipants.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeParticipants.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <p>No participants yet</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {activeParticipants.map((participant) => {
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
                        <button
                          onClick={() => handlePromote(participant.id, 'speaker')}
                          className="p-1 text-violetDeep hover:bg-violetDeep hover:text-cloud rounded transition-colors"
                          title="Promote to speaker"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                          </svg>
                        </button>
                      )}
                      {participant.role === 'speaker' && (
                        <button
                          onClick={() => handlePromote(participant.id, 'viewer')}
                          className="p-1 text-gray-600 hover:bg-gray-600 hover:text-cloud rounded transition-colors"
                          title="Demote to viewer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(participant.id)}
                        className="p-1 text-red-600 hover:bg-red-600 hover:text-cloud rounded transition-colors"
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
