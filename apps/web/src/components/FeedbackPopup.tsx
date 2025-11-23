import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface FeedbackData {
  rating: 'up' | 'down' | null;
  comment?: string;
  quickReasons?: string[];
}

interface FeedbackPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FeedbackData) => Promise<void>;
  meetingId: string;
  meetingDuration: number; // in minutes
}

const FeedbackPopup: React.FC<FeedbackPopupProps> = ({
  isOpen,
  onClose,
  onSubmit,
  meetingId: _meetingId,
  meetingDuration: _meetingDuration,
}) => {
  const { userProfile: _userProfile } = useAuth();
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickReasons = [
    'Poor audio',
    'Poor video',
    'Connection issues',
    'Hard to use controls',
    'Other',
  ];

  const handleReasonToggle = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
  };

  const handleSubmit = async () => {
    if (!rating) {
      setError('Please select a rating (thumbs up or down)');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit({
        rating,
        comment: comment.trim() || undefined,
        quickReasons: selectedReasons.length > 0 ? selectedReasons : undefined,
      });
      
      // Reset form
      setRating(null);
      setComment('');
      setSelectedReasons([]);
      onClose();
    } catch (err: any) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    setRating(null);
    setComment('');
    setSelectedReasons([]);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-cloud mb-1">
                How was your meeting?
              </h2>
              <p className="text-sm text-cloud/70">
                Your feedback is private and helps us improve Habs Meet.
              </p>
            </div>
            <button
              onClick={handleSkip}
              className="text-cloud/60 hover:text-cloud transition-colors p-2 hover:bg-white/10 rounded-lg"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Rating Buttons */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => {
                setRating('up');
                setError(null);
              }}
              className={`flex-1 flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${
                rating === 'up'
                  ? 'border-goldBright bg-goldBright/20 text-goldBright'
                  : 'border-white/20 bg-white/5 text-cloud/60 hover:border-white/40 hover:text-cloud'
              }`}
            >
              <svg
                className="w-12 h-12 mb-2"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
              </svg>
              <span className="font-semibold">Good meeting</span>
            </button>

            <button
              onClick={() => {
                setRating('down');
                setError(null);
              }}
              className={`flex-1 flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${
                rating === 'down'
                  ? 'border-red-500 bg-red-500/20 text-red-400'
                  : 'border-white/20 bg-white/5 text-cloud/60 hover:border-white/40 hover:text-cloud'
              }`}
            >
              <svg
                className="w-12 h-12 mb-2"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
              </svg>
              <span className="font-semibold">Something went wrong</span>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Quick Reasons (only for thumbs down) */}
          {rating === 'down' && (
            <div className="mb-4">
              <p className="text-sm text-cloud/70 mb-2">What went wrong? (optional)</p>
              <div className="flex flex-wrap gap-2">
                {quickReasons.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => handleReasonToggle(reason)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      selectedReasons.includes(reason)
                        ? 'bg-goldBright text-midnight'
                        : 'bg-white/10 text-cloud/70 hover:bg-white/20'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Comment Text Area */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-cloud/70 mb-2">
              {rating === 'up'
                ? 'Anything you\'d like to tell us? (optional)'
                : 'What went wrong? (optional)'}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your thoughts..."
              rows={3}
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-cloud placeholder-cloud/40 focus:outline-none focus:ring-2 focus:ring-goldBright focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 px-4 py-3 bg-white/10 text-cloud rounded-lg hover:bg-white/20 transition-colors font-medium"
              disabled={isSubmitting}
            >
              Skip for now
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !rating}
              className="flex-1 px-4 py-3 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit feedback'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPopup;

