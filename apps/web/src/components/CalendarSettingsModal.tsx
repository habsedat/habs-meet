import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

interface CalendarSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectedCalendar: 'google' | 'microsoft' | null;
  onDisconnect: () => void;
}

interface CalendarSettings {
  timezone: string;
  timeFormat: '12h' | '24h';
  defaultView: 'day' | 'week' | 'month';
}

const CalendarSettingsModal: React.FC<CalendarSettingsModalProps> = ({
  isOpen,
  onClose,
  connectedCalendar,
  onDisconnect,
}) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<CalendarSettings>({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timeFormat: '12h',
    defaultView: 'day',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Get all timezones (fallback list if supportedValuesOf is not available)
  const timezones = (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl && typeof (Intl as any).supportedValuesOf === 'function')
    ? (Intl as any).supportedValuesOf('timeZone')
    : [
        'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
        'Europe/Rome', 'Europe/Madrid', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong',
        'Asia/Dubai', 'Asia/Kolkata', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
      ];

  useEffect(() => {
    if (isOpen && user) {
      loadSettings();
    }
  }, [isOpen, user]);

  const loadSettings = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'calendar');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as CalendarSettings;
        setSettings({
          timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          timeFormat: data.timeFormat || '12h',
          defaultView: data.defaultView || 'day',
        });
      }
    } catch (error: any) {
      console.error('Error loading calendar settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'calendar');
      await setDoc(settingsRef, settings, { merge: true });
      toast.success('Calendar settings saved successfully');
      onClose();
    } catch (error: any) {
      console.error('Error saving calendar settings:', error);
      toast.error('Failed to save settings: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-cloud rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-cloud border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-midnight">Calendar Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-techBlue"></div>
            </div>
          ) : (
            <>
              {/* Timezone Picker */}
              <div>
                <label className="block text-sm font-semibold text-midnight mb-2">
                  Timezone
                </label>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
                >
                  {timezones.map((tz: string) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Format Toggle */}
              <div>
                <label className="block text-sm font-semibold text-midnight mb-2">
                  Time Format
                </label>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setSettings({ ...settings, timeFormat: '12h' })}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      settings.timeFormat === '12h'
                        ? 'bg-techBlue text-cloud'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    12 Hour (AM/PM)
                  </button>
                  <button
                    onClick={() => setSettings({ ...settings, timeFormat: '24h' })}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      settings.timeFormat === '24h'
                        ? 'bg-techBlue text-cloud'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    24 Hour
                  </button>
                </div>
              </div>

              {/* Default View Selector */}
              <div>
                <label className="block text-sm font-semibold text-midnight mb-2">
                  Default View
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['day', 'week', 'month'] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setSettings({ ...settings, defaultView: view })}
                      className={`px-4 py-3 rounded-lg font-medium transition-colors capitalize ${
                        settings.defaultView === view
                          ? 'bg-techBlue text-cloud'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>

              {/* Google Calendar Sync Status */}
              <div className="border-t border-gray-200 pt-6">
                <label className="block text-sm font-semibold text-midnight mb-2">
                  Calendar Sync Status
                </label>
                <div className="bg-gray-50 rounded-lg p-4">
                  {connectedCalendar ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-midnight">
                            {connectedCalendar === 'google' ? 'Google' : 'Microsoft'} Calendar
                          </p>
                          <p className="text-sm text-gray-600">Connected and syncing</p>
                        </div>
                      </div>
                      <button
                        onClick={onDisconnect}
                        className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-midnight">No calendar connected</p>
                        <p className="text-sm text-gray-600">Connect a calendar to sync your meetings</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-cloud border-t border-gray-200 px-6 py-4 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-4 py-2 bg-techBlue text-cloud rounded-lg font-medium hover:bg-techBlue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarSettingsModal;

