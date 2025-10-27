import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const EmailVerificationPage: React.FC = () => {
  const { user, sendEmailVerification, logout } = useAuth();
  const [isResending, setIsResending] = useState(false);

  const handleResendVerification = async () => {
    if (!user) return;
    
    setIsResending(true);
    try {
      await sendEmailVerification();
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error) {
      toast.error('Failed to send verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center p-4">
      <div className="bg-cloud rounded-2xl p-8 w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex justify-center items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-techBlue to-violetDeep rounded-lg flex items-center justify-center">
            <span className="text-cloud font-bold text-2xl">H</span>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-midnight font-brand mb-4">
            Verify Your Email
          </h2>
          
          <div className="mb-6">
            <div className="w-20 h-20 bg-techBlue/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-techBlue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            
            <p className="text-gray-600 mb-2">
              We've sent a verification email to:
            </p>
            <p className="font-semibold text-midnight mb-4">
              {user?.email}
            </p>
            
            <p className="text-sm text-gray-600 mb-4">
              Please check your email and click the verification link to activate your account.
            </p>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm text-yellow-800 font-medium">Check Your Spam/Junk Folder</p>
                  <p className="text-sm text-yellow-700">
                    If you don't see the email in your inbox, please check your spam or junk folder. 
                    Sometimes verification emails are filtered there.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleResendVerification}
              disabled={isResending}
              className="btn btn-primary w-full py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cloud"></div>
                  <span>Sending...</span>
                </div>
              ) : (
                'Resend Verification Email'
              )}
            </button>

            <button
              onClick={handleSignOut}
              className="btn btn-ghost w-full py-3 text-lg font-semibold"
            >
              Sign Out
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              After verifying your email, you'll be able to access all features of Habs Meet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationPage;
