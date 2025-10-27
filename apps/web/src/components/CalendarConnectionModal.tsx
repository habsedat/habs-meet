import React, { useState } from 'react';
import toast from 'react-hot-toast';

interface CalendarConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (provider: 'google' | 'microsoft') => void;
}

const CalendarConnectionModal: React.FC<CalendarConnectionModalProps> = ({
  isOpen,
  onClose,
  onConnect
}) => {
  const [isConnecting, setIsConnecting] = useState<'google' | 'microsoft' | null>(null);

  const handleConnect = async (provider: 'google' | 'microsoft') => {
    setIsConnecting(provider);
    
    try {
      // Simulate connection process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Call the parent's onConnect function
      onConnect(provider);
      
      toast.success(`${provider === 'google' ? 'Google' : 'Microsoft'} Calendar connected successfully!`);
      onClose();
    } catch (error) {
      toast.error(`Failed to connect ${provider === 'google' ? 'Google' : 'Microsoft'} Calendar`);
    } finally {
      setIsConnecting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-cloud rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-midnight">Connect Calendar</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="text-gray-600 mb-6">
          Choose your calendar provider to sync your meetings and events with Habs Meet.
        </p>

        {/* Calendar Options */}
        <div className="space-y-4">
          {/* Google Calendar */}
          <button
            onClick={() => handleConnect('google')}
            disabled={isConnecting !== null}
            className="w-full p-4 border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-4"
          >
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-gray-200">
              <svg className="w-8 h-8" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-semibold text-midnight">Google Calendar</h3>
              <p className="text-sm text-gray-600">Sync with your Google Calendar</p>
            </div>
            {isConnecting === 'google' ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-techBlue"></div>
            ) : (
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>

          {/* Microsoft Calendar */}
          <button
            onClick={() => handleConnect('microsoft')}
            disabled={isConnecting !== null}
            className="w-full p-4 border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-4"
          >
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-gray-200">
              <svg className="w-8 h-8" viewBox="0 0 24 24">
                <path fill="#F25022" d="M1 1h10v10H1z"/>
                <path fill="#00A4EF" d="M13 1h10v10H13z"/>
                <path fill="#7FBA00" d="M1 13h10v10H1z"/>
                <path fill="#FFB900" d="M13 13h10v10H13z"/>
              </svg>
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-semibold text-midnight">Microsoft Calendar</h3>
              <p className="text-sm text-gray-600">Sync with your Outlook Calendar</p>
            </div>
            {isConnecting === 'microsoft' ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-techBlue"></div>
            ) : (
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Your calendar data is encrypted and secure. We only access your calendar to sync meetings.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CalendarConnectionModal;

