import React from 'react';
import { useLiveKit } from '../contexts/LiveKitContext';

interface MeetingControlsProps {
  isHost?: boolean;
  onRecord?: () => void;
  onLock?: () => void;
  isRecording?: boolean;
  isLocked?: boolean;
}

const MeetingControls: React.FC<MeetingControlsProps> = ({
  isHost = false,
  onRecord,
  onLock,
  isRecording = false,
  isLocked = false,
}) => {
  const {
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenSharing,
  } = useLiveKit();

  return (
    <div className="flex items-center justify-center space-x-4 p-4 bg-midnight border-t border-gray-800">
      {/* Microphone toggle */}
      <button
        onClick={toggleMicrophone}
        className={`p-3 rounded-full transition-colors ${
          isMicrophoneEnabled
            ? 'bg-cloud text-midnight hover:bg-gray-200'
            : 'bg-red-600 text-cloud hover:bg-red-700'
        }`}
        title={isMicrophoneEnabled ? 'Mute microphone (M)' : 'Unmute microphone (M)'}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isMicrophoneEnabled ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          )}
        </svg>
      </button>

      {/* Camera toggle */}
      <button
        onClick={toggleCamera}
        className={`p-3 rounded-full transition-colors ${
          isCameraEnabled
            ? 'bg-cloud text-midnight hover:bg-gray-200'
            : 'bg-red-600 text-cloud hover:bg-red-700'
        }`}
        title={isCameraEnabled ? 'Turn off camera (V)' : 'Turn on camera (V)'}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isCameraEnabled ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3l18 18M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          )}
        </svg>
      </button>

      {/* Screen share toggle */}
      <button
        onClick={toggleScreenShare}
        className={`p-3 rounded-full transition-colors ${
          isScreenSharing
            ? 'bg-goldBright text-midnight hover:bg-yellow-400'
            : 'bg-cloud text-midnight hover:bg-gray-200'
        }`}
        title={isScreenSharing ? 'Stop sharing (S)' : 'Share screen (S)'}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* Host controls */}
      {isHost && (
        <>
          {/* Record button */}
          <button
            onClick={onRecord}
            className={`p-3 rounded-full transition-colors ${
              isRecording
                ? 'bg-red-600 text-cloud hover:bg-red-700'
                : 'bg-cloud text-midnight hover:bg-gray-200'
            }`}
            title={isRecording ? 'Stop recording' : 'Start recording'}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>

          {/* Lock/Unlock button */}
          <button
            onClick={onLock}
            className={`p-3 rounded-full transition-colors ${
              isLocked
                ? 'bg-red-600 text-cloud hover:bg-red-700'
                : 'bg-cloud text-midnight hover:bg-gray-200'
            }`}
            title={isLocked ? 'Unlock room' : 'Lock room'}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isLocked ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                />
              )}
            </svg>
          </button>
        </>
      )}
    </div>
  );
};

export default MeetingControls;



