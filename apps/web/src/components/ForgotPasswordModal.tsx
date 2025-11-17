import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PasswordResetRateLimit from './PasswordResetRateLimit';
import toast from 'react-hot-toast';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const checkRateLimit = (emailToCheck: string): boolean => {
    const rateLimitKey = `passwordReset_${emailToCheck.toLowerCase()}`;
    const storedData = localStorage.getItem(rateLimitKey);
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    if (!storedData) {
      setIsRateLimited(false);
      return false;
    }
    
    const parsed = JSON.parse(storedData);
    const requests = parsed.requests.filter((timestamp: number) => now - timestamp < twentyFourHours);
    
    if (requests.length >= 4) {
      setIsRateLimited(true);
      return true;
    }
    
    setIsRateLimited(false);
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    // Check rate limit before submitting
    if (checkRateLimit(email.trim())) {
      return;
    }

    setIsSending(true);
    try {
      await resetPassword(email.trim());
      setEmailSent(true);
      setIsRateLimited(false);
      // Modal will stay open until user clicks "Got it"
    } catch (error: any) {
      // Check if it's a rate limit error
      if (error.message.includes('limit of 4 password reset requests')) {
        setIsRateLimited(true);
      }
      // Error is already handled in resetPassword
    } finally {
      setIsSending(false);
    }
  };

  // Check rate limit when email changes
  useEffect(() => {
    if (email.trim()) {
      checkRateLimit(email.trim());
    } else {
      setIsRateLimited(false);
    }
  }, [email]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-cloud rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-midnight">Reset Password</h2>
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
        {emailSent ? (
          <div className="p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-midnight mb-2">Email Sent Successfully!</h3>
              <p className="text-gray-600 mb-4">
                We've sent a password reset link to <strong>{email}</strong>
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 font-medium mb-2">📧 Please check your email:</p>
                <ul className="text-sm text-blue-700 text-left space-y-1">
                  <li>• Check your <strong>inbox</strong> for the reset link</li>
                  <li>• Don't forget to check your <strong>spam/junk folder</strong></li>
                  <li>• The link will expire in 1 hour</li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setEmailSent(false);
                  setEmail('');
                  onClose();
                }}
                className="px-6 py-2 bg-techBlue text-cloud rounded-lg font-medium hover:bg-techBlue/90 transition-colors"
              >
                Got it
              </button>
              <p className="text-xs text-gray-500 mt-3">
                You can request a password reset up to 4 times in 24 hours
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6">
            <p className="text-gray-600 mb-6">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {/* Rate Limit Warning */}
            {email && <PasswordResetRateLimit email={email} />}

            <div className="mb-6">
              <label className="block text-sm font-semibold text-midnight mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
                placeholder="Enter your email address"
                required
                disabled={isSending}
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending || !email.trim() || isRateLimited}
                className="px-4 py-2 bg-techBlue text-cloud rounded-lg font-medium hover:bg-techBlue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;

