import React from 'react';

interface DeviceConflictModalProps {
  isOpen: boolean;
  currentDevice: string;
  activeDevice: string;
  roomTitle: string;
  onChooseCurrent: () => void;
  onChooseActive: () => void;
  onCancel: () => void;
}

const DeviceConflictModal: React.FC<DeviceConflictModalProps> = ({
  isOpen,
  currentDevice,
  activeDevice,
  roomTitle,
  onChooseCurrent,
  onChooseActive,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl w-full max-w-md border border-white/20 shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-center w-16 h-16 bg-yellow-500/20 rounded-full mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-cloud text-center mb-2">
            Active Meeting Detected
          </h2>
          
          <p className="text-cloud/70 text-center mb-6">
            You're already in a meeting on another device. Choose which device you want to use:
          </p>

          <div className="space-y-3 mb-6">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-cloud font-medium">Current Device</p>
                  <p className="text-cloud/60 text-sm">{currentDevice}</p>
                </div>
                <button
                  onClick={onChooseCurrent}
                  className="px-4 py-2 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold"
                >
                  Use This
                </button>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-cloud font-medium">Active Device</p>
                  <p className="text-cloud/60 text-sm">{activeDevice}</p>
                  <p className="text-cloud/50 text-xs mt-1">In: {roomTitle}</p>
                </div>
                <button
                  onClick={onChooseActive}
                  className="px-4 py-2 bg-white/10 text-cloud rounded-lg hover:bg-white/20 transition-colors font-semibold"
                >
                  Keep Active
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="w-full px-4 py-2 bg-white/5 text-cloud rounded-lg hover:bg-white/10 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceConflictModal;















