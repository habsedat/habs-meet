import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createScheduledMeeting } from '../lib/scheduledMeetingService';
import toast from '../lib/toast';

interface ScheduleMeetingFormProps {
  onSuccess?: (meetingId: string, hostLink: string, participantLink: string, icsData: string, passcode?: string) => void;
  initialDate?: Date;
  onCancel?: () => void;
}

const ScheduleMeetingForm: React.FC<ScheduleMeetingFormProps> = ({ onSuccess, initialDate, onCancel }) => {
  const { user, userProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format date for input field (YYYY-MM-DDTHH:mm)
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startAt: initialDate ? formatDateForInput(initialDate) : '',
    durationMin: 30,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    allowEarlyJoinMin: 10,
    requirePasscode: false,
    passcode: '',
    lobbyEnabled: true,
  });

  // Update form data when initialDate changes
  useEffect(() => {
    if (initialDate) {
      setFormData(prev => ({
        ...prev,
        startAt: formatDateForInput(initialDate)
      }));
    }
  }, [initialDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !userProfile) {
      toast.error('You must be logged in to schedule a meeting');
      return;
    }

    if (!formData.title.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }

    if (!formData.startAt) {
      toast.error('Please select a date and time');
      return;
    }

    // Validate start time is not in the past
    const startDate = new Date(formData.startAt);
    if (startDate < new Date()) {
      toast.error('Cannot schedule meetings in the past');
      return;
    }

    // Validate passcode if required
    if (formData.requirePasscode && !formData.passcode.trim()) {
      toast.error('Please enter a passcode');
      return;
    }

    if (formData.requirePasscode) {
      // Validate passcode is exactly 6 digits
      const passcodeRegex = /^\d{6}$/;
      if (!passcodeRegex.test(formData.passcode.trim())) {
        toast.error('Passcode must be exactly 6 digits (numbers only)');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Convert local datetime to ISO string (will be converted to UTC on server)
      const startAtISO = startDate.toISOString();

      const result = await createScheduledMeeting({
        title: formData.title,
        description: formData.description,
        startAt: startAtISO,
        durationMin: formData.durationMin,
        timezone: formData.timezone,
        allowEarlyJoinMin: formData.allowEarlyJoinMin,
        requirePasscode: formData.requirePasscode,
        passcode: formData.requirePasscode ? formData.passcode : undefined,
        lobbyEnabled: formData.lobbyEnabled,
      });

      toast.success('Meeting scheduled successfully!');

      if (onSuccess) {
        onSuccess(result.meetingId, result.hostLink, result.participantLink, result.icsData, formData.requirePasscode ? formData.passcode : undefined);
      }

      // Reset form
      setFormData({
        title: '',
        description: '',
        startAt: initialDate ? formatDateForInput(initialDate) : '',
        durationMin: 30,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        allowEarlyJoinMin: 10,
        requirePasscode: false,
        passcode: '',
        lobbyEnabled: true,
      });
    } catch (error: any) {
      console.error('Error scheduling meeting:', error);
      toast.error(error.message || 'Failed to schedule meeting');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'durationMin') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) || 30 }));
    } else if (name === 'allowEarlyJoinMin') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) || 10 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Get current datetime in local timezone for datetime-local input
  const getCurrentDateTimeLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      <div>
        <label className="block text-sm font-medium text-midnight mb-2">
          Meeting Title *
        </label>
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleInputChange}
          placeholder="Enter meeting title"
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900 placeholder-gray-500"
          style={{ color: '#111827', backgroundColor: 'white' }}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-midnight mb-2">
          Date & Time *
        </label>
        <input
          type="datetime-local"
          name="startAt"
          value={formData.startAt}
          onChange={handleInputChange}
          min={getCurrentDateTimeLocal()}
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900"
          style={{ color: '#111827', backgroundColor: 'white' }}
        />
        <p className="mt-1 text-xs text-gray-500">
          Timezone: {formData.timezone}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-midnight mb-2">
          Duration (minutes) *
        </label>
        <select
          name="durationMin"
          value={formData.durationMin}
          onChange={handleInputChange}
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900"
          style={{ color: '#111827', backgroundColor: 'white' }}
        >
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="90">1.5 hours</option>
          <option value="120">2 hours</option>
          <option value="180">3 hours</option>
          <option value="240">4 hours</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-midnight mb-2">
          Description
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={4}
          placeholder="Meeting description or agenda"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent resize-none text-gray-900 placeholder-gray-500"
          style={{ color: '#111827', backgroundColor: 'white' }}
        />
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="requirePasscode"
          name="requirePasscode"
          checked={formData.requirePasscode}
          onChange={handleInputChange}
          className="w-4 h-4 text-techBlue border-gray-300 rounded focus:ring-techBlue"
        />
        <label htmlFor="requirePasscode" className="text-sm font-medium text-midnight">
          Require passcode for participants
        </label>
      </div>

      {formData.requirePasscode && (
        <div>
          <label className="block text-sm font-medium text-midnight mb-2">
            Passcode *
          </label>
            <input
              type="text"
              name="passcode"
              value={formData.passcode}
              onChange={(e) => {
                // Only allow digits and limit to 6 characters
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setFormData(prev => ({ ...prev, passcode: value }));
              }}
              placeholder="Enter 6-digit passcode"
              maxLength={6}
              pattern="[0-9]{6}"
              required={formData.requirePasscode}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900 placeholder-gray-500 font-mono text-center text-lg tracking-widest"
              style={{ color: '#111827', backgroundColor: 'white' }}
            />
            <p className="mt-1 text-xs text-gray-500">
              Participants will need this 6-digit passcode to join the meeting
            </p>
        </div>
      )}

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="lobbyEnabled"
          name="lobbyEnabled"
          checked={formData.lobbyEnabled}
          onChange={handleInputChange}
          className="w-4 h-4 text-techBlue border-gray-300 rounded focus:ring-techBlue"
        />
        <label htmlFor="lobbyEnabled" className="text-sm font-medium text-midnight">
          Enable waiting room (lobby)
        </label>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 border border-gray-300 text-midnight rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`px-6 py-3 bg-techBlue text-cloud rounded-lg font-semibold hover:bg-techBlue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${onCancel ? 'flex-1' : 'w-full'}`}
        >
          {isSubmitting ? 'Scheduling...' : 'Schedule Meeting'}
        </button>
      </div>
    </form>
  );
};

export default ScheduleMeetingForm;

