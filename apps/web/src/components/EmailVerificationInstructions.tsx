import React from 'react';
import { useNavigate } from 'react-router-dom';

interface EmailVerificationInstructionsProps {
  email: string;
  onResendEmail: () => Promise<void>;
  isResending?: boolean;
}

const EmailVerificationInstructions: React.FC<EmailVerificationInstructionsProps> = ({
  email,
  onResendEmail,
  isResending = false,
}) => {
  const navigate = useNavigate();
  const [resendSuccess, setResendSuccess] = React.useState(false);

  const handleResend = async () => {
    try {
      await onResendEmail();
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (error) {
      // Error handling is done in parent component
    }
  };

  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand Logo */}
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="Habs Meet Logo" 
            className="w-16 h-16 mx-auto mb-4 object-contain"
          />
          <h1 className="text-3xl font-bold text-cloud font-brand">Habs Meet</h1>
          <p className="text-gray-400 mt-2">Premium video meetings</p>
        </div>

        {/* Verification Instructions Card */}
        <div className="bg-cloud rounded-2xl p-8 shadow-2xl">
          {/* Success Icon */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-midnight mb-2">
              Check Your Email
            </h2>
            <p className="text-gray-600">
              We've sent a verification email to
            </p>
            <p className="text-techBlue font-semibold mt-1 break-all">
              {email}
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-midnight mb-3 flex items-center">
              <svg className="w-5 h-5 text-techBlue mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              What to do next:
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Check your email inbox (and spam/junk folder)</li>
              <li>Click on the verification link in the email</li>
              <li>Return here and sign in with your credentials</li>
              <li>You must verify your email before you can access your account</li>
            </ol>
          </div>

          {/* Resend Email Section */}
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-3">
                Didn't receive the email?
              </p>
              <button
                onClick={handleResend}
                disabled={isResending || resendSuccess}
                className="w-full bg-techBlue text-cloud py-3 px-4 rounded-lg font-semibold hover:bg-techBlue/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResending ? 'Sending...' : resendSuccess ? 'Email Sent!' : 'Resend Verification Email'}
              </button>
              {resendSuccess && (
                <p className="text-xs text-green-600 mt-2">
                  If you still don't see it, check your spam folder or try signing up again.
                </p>
              )}
            </div>

            {/* Back to Sign In */}
            <div className="text-center pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  console.log('[EmailVerification] Navigating back to sign in');
                  navigate('/');
                }}
                className="text-techBlue hover:underline text-sm font-medium"
              >
                Back to Sign In
              </button>
            </div>
          </div>

          {/* Important Note */}
          <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800">
              <strong>Important:</strong> You must verify your email address before you can log in. 
              If you don't see the email, check your spam folder or click "Resend Verification Email" above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationInstructions;

