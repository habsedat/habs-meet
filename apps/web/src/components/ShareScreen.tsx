import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';

interface ShareScreenProps {
  onScreenShareStart?: () => void;
  onScreenShareStop?: () => void;
  isSharing?: boolean;
}

const ShareScreen: React.FC<ShareScreenProps> = ({ 
  onScreenShareStart, 
  onScreenShareStop, 
  isSharing = false 
}) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Check if screen sharing is supported
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
      setIsSupported(true);
    }
  }, []);

  const handleStartScreenShare = async () => {
    if (!isSupported) {
      toast.error('Screen sharing is not supported in this browser');
      return;
    }

    setIsRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Handle when user stops sharing via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        handleStopScreenShare();
      });

      onScreenShareStart?.();
      toast.success('Screen sharing started');
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('Screen sharing was denied');
      } else {
        toast.error('Failed to start screen sharing: ' + error.message);
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const handleStopScreenShare = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    onScreenShareStop?.();
    toast.success('Screen sharing stopped');
  };

  if (!isSupported) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-red-700 text-sm">Screen sharing is not supported in this browser</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cloud rounded-lg p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-midnight">Share Screen</h3>
        <div className={`w-3 h-3 rounded-full ${isSharing ? 'bg-green-500' : 'bg-gray-300'}`}></div>
      </div>

      {isSharing && (
        <div className="mb-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full h-48 bg-gray-100 rounded-lg object-cover"
          />
        </div>
      )}

      <div className="flex space-x-3">
        {!isSharing ? (
          <button
            onClick={handleStartScreenShare}
            disabled={isRequesting}
            className="flex-1 bg-techBlue text-cloud px-4 py-2 rounded-lg font-medium hover:bg-techBlue/90 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {isRequesting ? 'Requesting...' : 'Start Sharing'}
          </button>
        ) : (
          <button
            onClick={handleStopScreenShare}
            className="flex-1 bg-red-500 text-cloud px-4 py-2 rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Stop Sharing
          </button>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-500">
        {isSharing ? 'Your screen is being shared with participants' : 'Share your screen with meeting participants'}
      </div>
    </div>
  );
};

export default ShareScreen;
