import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface HelpSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpSupportModal: React.FC<HelpSupportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'faq' | 'guide' | 'contact' | 'troubleshooting'>('faq');
  const [contactForm, setContactForm] = useState({
    email: user?.email || '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const faqs = [
    {
      question: 'How do I schedule a meeting?',
      answer: 'Click the "Schedule a meeting" button on the calendar, fill in the meeting details, and select a date and time. You\'ll receive a host link and a participant link to share.',
    },
    {
      question: 'How do I join a meeting?',
      answer: 'Click on the meeting link shared by the host, or enter the meeting ID on the join page. If it\'s a scheduled meeting, use the participant link.',
    },
    {
      question: 'Can I record meetings?',
      answer: 'Yes, hosts can start recording during a meeting. Recordings are saved and can be accessed from the History page.',
    },
    {
      question: 'How do I share my screen?',
      answer: 'Click the "Share Screen" button in the meeting controls. You can choose to share your entire screen, a specific window, or a browser tab.',
    },
    {
      question: 'What browsers are supported?',
      answer: 'Habs Meet works best on Chrome, Firefox, Edge, and Safari (latest versions). Make sure your browser allows camera and microphone access.',
    },
    {
      question: 'How do I disconnect my calendar?',
      answer: 'Go to Calendar Settings from the overflow menu (three dots) and click "Disconnect" next to your connected calendar.',
    },
  ];

  const troubleshootingItems = [
    {
      issue: 'Calendar sync not working',
      solution: 'Check your calendar connection status in Calendar Settings. Try disconnecting and reconnecting your calendar. Make sure you\'ve granted the necessary permissions.',
    },
    {
      issue: 'Meetings not appearing in calendar',
      solution: 'Ensure your calendar is connected and syncing. Refresh the calendar view. Check if meetings are scheduled for future dates (past meetings are automatically hidden).',
    },
    {
      issue: 'Cannot start scheduled meeting',
      solution: 'Make sure you\'re logged in as the meeting host. Verify that the meeting hasn\'t already passed. Check your internet connection and try refreshing the page.',
    },
    {
      issue: 'Video not displaying on mobile',
      solution: 'Ensure you\'ve granted camera permissions. Check your internet connection. Try refreshing the page or rejoining the meeting. Video quality is automatically optimized for mobile devices.',
    },
    {
      issue: 'Audio not working',
      solution: 'Check your microphone permissions in browser settings. Ensure your microphone is not muted. Try switching to a different audio device in the settings panel.',
    },
  ];

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!contactForm.email || !contactForm.description) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      // In a real app, you would send this to a backend API
      // For now, we'll just show a success message
      console.log('Contact form submission:', {
        email: contactForm.email,
        description: contactForm.description,
        userId: user?.uid,
        userName: userProfile?.displayName,
      });
      
      toast.success('Thank you for your message! We\'ll get back to you soon.');
      setContactForm({ email: user?.email || '', description: '' });
      setActiveTab('faq');
    } catch (error: any) {
      toast.error('Failed to send message: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-cloud rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-cloud border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-midnight">Help & Support</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex space-x-1 overflow-x-auto">
            {[
              { id: 'faq', label: 'FAQ' },
              { id: 'guide', label: 'Usage Guide' },
              { id: 'contact', label: 'Contact Us' },
              { id: 'troubleshooting', label: 'Troubleshooting' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-techBlue text-techBlue'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'faq' && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-midnight mb-4">Frequently Asked Questions</h3>
              {faqs.map((faq, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-midnight mb-2">{faq.question}</h4>
                  <p className="text-gray-700">{faq.answer}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-midnight mb-4">App Usage Guide</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-midnight mb-2">Scheduling Meetings</h4>
                  <ol className="list-decimal list-inside space-y-2 text-gray-700 ml-4">
                    <li>Click "Schedule a meeting" on the calendar</li>
                    <li>Fill in meeting title, description, date, and time</li>
                    <li>Set meeting duration and optional passcode</li>
                    <li>Click "Schedule Meeting" to create</li>
                    <li>Share the participant link with attendees</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-midnight mb-2">Joining Meetings</h4>
                  <ol className="list-decimal list-inside space-y-2 text-gray-700 ml-4">
                    <li>Click on the meeting link or enter meeting ID</li>
                    <li>Enter your name and optional passcode</li>
                    <li>Allow camera and microphone access when prompted</li>
                    <li>Configure your audio/video settings</li>
                    <li>Click "Join Meeting"</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-midnight mb-2">During Meetings</h4>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Use the controls to mute/unmute audio and video</li>
                    <li>Share your screen by clicking "Share Screen"</li>
                    <li>Use the chat panel to send messages</li>
                    <li>Hosts can manage participants and start recording</li>
                    <li>Switch between different view modes (Grid, Speaker, etc.)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-midnight mb-2">Calendar Features</h4>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Connect Google or Microsoft Calendar for syncing</li>
                    <li>View all scheduled meetings in calendar view</li>
                    <li>Start meetings directly from the calendar</li>
                    <li>Import/export calendar events</li>
                    <li>Customize calendar settings (timezone, time format, default view)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contact' && (
            <div className="max-w-2xl mx-auto">
              <h3 className="text-xl font-semibold text-midnight mb-4">Contact Us</h3>
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-midnight mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-midnight mb-2">
                    Description
                  </label>
                  <textarea
                    value={contactForm.description}
                    onChange={(e) => setContactForm({ ...contactForm, description: e.target.value })}
                    rows={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
                    placeholder="Please describe your issue or question..."
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 bg-techBlue text-cloud rounded-lg font-medium hover:bg-techBlue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'troubleshooting' && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-midnight mb-4">Troubleshooting</h3>
              {troubleshootingItems.map((item, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-midnight mb-2">{item.issue}</h4>
                  <p className="text-gray-700">{item.solution}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HelpSupportModal;


