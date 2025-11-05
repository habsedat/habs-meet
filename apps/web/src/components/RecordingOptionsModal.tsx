import React, { useState, useEffect } from 'react';
import { RecordingService } from '../lib/recordingService';

export type MicrophoneSource = 'internal' | 'external' | 'both';

interface RecordingOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: (options: { microphoneSource: MicrophoneSource }) => void;
}

const RecordingOptionsModal: React.FC<RecordingOptionsModalProps> = ({
  isOpen,
  onClose,
  onStartRecording,
}) => {
  const [microphoneSource, setMicrophoneSource] = useState<MicrophoneSource>('both');
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadAudioDevices();
    }
  }, [isOpen]);

  const loadAudioDevices = async () => {
    try {
      setLoading(true);
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);
    } catch (error) {
      console.error('Error loading audio devices:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleStart = () => {
    onStartRecording({
      microphoneSource: microphoneSource,
    });
    onClose();
  };

  const isSupported = RecordingService.isSupported();

  // Categorize devices
  const internalDevices = audioDevices.filter(device => 
    device.label.toLowerCase().includes('internal') || 
    device.label.toLowerCase().includes('built-in') ||
    device.label.toLowerCase().includes('default') ||
    device.deviceId === 'default'
  );
  const externalDevices = audioDevices.filter(device => 
    !internalDevices.includes(device)
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-cloud">Recording Settings</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Recording Info */}
        <div className="mb-6 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
          <div className="text-sm text-blue-300">
            <strong>Recording Mode:</strong> Video + Audio
            <br />
            <span className="text-xs mt-1 block">
              This will record the entire meeting room including all participants, screen shares, and chat.
            </span>
          </div>
        </div>

        {/* Microphone Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Microphone Source
          </label>
          
          {loading ? (
            <div className="text-gray-400 text-sm">Loading microphones...</div>
          ) : (
            <div className="space-y-3">
              {/* Internal Microphone */}
              <label
                className={`flex items-start p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  microphoneSource === 'internal'
                    ? 'border-techBlue bg-techBlue/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="microphoneSource"
                  value="internal"
                  checked={microphoneSource === 'internal'}
                  onChange={() => setMicrophoneSource('internal')}
                  className="mt-1 mr-3"
                />
                <div className="flex-1">
                  <div className="font-medium text-cloud">Internal Microphone</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Use your device's built-in microphone
                    {internalDevices.length > 0 && (
                      <span className="block mt-1">
                        Available: {internalDevices.map(d => d.label).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </label>

              {/* External Microphone */}
              <label
                className={`flex items-start p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  microphoneSource === 'external'
                    ? 'border-techBlue bg-techBlue/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="microphoneSource"
                  value="external"
                  checked={microphoneSource === 'external'}
                  onChange={() => setMicrophoneSource('external')}
                  className="mt-1 mr-3"
                />
                <div className="flex-1">
                  <div className="font-medium text-cloud">External Microphone</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Use connected external microphone/headset
                    {externalDevices.length > 0 ? (
                      <span className="block mt-1">
                        Available: {externalDevices.map(d => d.label).join(', ')}
                      </span>
                    ) : (
                      <span className="block mt-1 text-yellow-400">
                        No external microphone detected
                      </span>
                    )}
                  </div>
                </div>
              </label>

              {/* Both Microphones */}
              <label
                className={`flex items-start p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  microphoneSource === 'both'
                    ? 'border-techBlue bg-techBlue/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="microphoneSource"
                  value="both"
                  checked={microphoneSource === 'both'}
                  onChange={() => setMicrophoneSource('both')}
                  className="mt-1 mr-3"
                />
                <div className="flex-1">
                  <div className="font-medium text-cloud">Both Microphones</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Record from both internal and external microphones simultaneously
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!isSupported || loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Start Recording
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingOptionsModal;
