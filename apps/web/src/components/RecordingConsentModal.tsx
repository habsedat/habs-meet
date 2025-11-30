import React from 'react';
import { useNavigate } from 'react-router-dom';

interface RecordingConsentModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onLeave: () => void;
  isHost?: boolean;
}

const RecordingConsentModal: React.FC<RecordingConsentModalProps> = ({
  isOpen,
  onContinue,
  onLeave
}) => {
  const navigate = useNavigate();

  if (!isOpen) {
    console.log('[RecordingConsentModal] Modal is closed, not rendering');
    return null;
  }

  console.log('[RecordingConsentModal] Modal is open, rendering');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={(e) => {
      // Prevent closing on background click
      e.stopPropagation();
    }}>
      <div className="bg-cloud rounded-2xl p-6 md:p-8 max-w-lg w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center mb-6">
          <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center mr-4">
            <svg className="w-6 h-6 text-cloud" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-midnight">
            Meeting Recording Notice
          </h2>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="text-midnight mb-4 leading-relaxed">
            <strong>This meeting is being recorded.</strong> By continuing, you consent to video, audio, and screen content being captured according to our{' '}
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open('/global-privacy-policy', '_blank');
              }}
              className="text-techBlue hover:underline font-semibold"
            >
              Global Privacy Policy
            </button>
            {' '}and{' '}
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open('/recording-consent-info', '_blank');
              }}
              className="text-techBlue hover:underline font-semibold"
            >
              Recording Consent Information
            </button>
            .
          </p>

          <div className="bg-yellow-50 border-l-4 border-goldBright p-4 mb-4">
            <p className="text-sm text-midnight">
              <strong>Important:</strong> Your participation in this meeting indicates your consent to being recorded. If you do not consent, please leave the meeting now.
            </p>
          </div>

          <div className="text-sm text-gray-700 space-y-2">
            <p><strong>What is recorded:</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Video feeds (if cameras are enabled)</li>
              <li>Audio (if microphones are enabled)</li>
              <li>Screen sharing content</li>
              <li>Chat messages</li>
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onContinue}
            className="flex-1 px-6 py-3 bg-techBlue text-cloud font-semibold rounded-lg hover:bg-techBlue/90 transition-colors"
          >
            Continue & Consent
          </button>
          <button
            onClick={onLeave}
            className="flex-1 px-6 py-3 bg-gray-200 text-midnight font-semibold rounded-lg hover:bg-gray-300 transition-colors"
          >
            Leave Meeting
          </button>
        </div>

        {/* Link to more info */}
        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/recording-consent-info')}
            className="text-sm text-techBlue hover:underline"
          >
            Learn more about recording consent
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingConsentModal;

