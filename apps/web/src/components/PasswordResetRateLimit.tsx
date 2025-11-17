import React, { useState, useEffect } from 'react';

interface PasswordResetRateLimitProps {
  email: string;
}

const PasswordResetRateLimit: React.FC<PasswordResetRateLimitProps> = ({
  email,
}) => {
  const [timeRemaining, setTimeRemaining] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const rateLimitKey = `passwordReset_${email.toLowerCase()}`;
      const storedData = localStorage.getItem(rateLimitKey);
      
      if (!storedData) {
        setTimeRemaining(null);
        return;
      }

      const parsed = JSON.parse(storedData);
      const requests = parsed.requests || [];
      
      if (requests.length < 4) {
        setTimeRemaining(null);
        return;
      }

      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const oldestRequest = Math.min(...requests);
      const timeUntilReset = twentyFourHours - (now - oldestRequest);

      if (timeUntilReset <= 0) {
        setTimeRemaining(null);
        return;
      }

      const hours = Math.floor(timeUntilReset / (60 * 60 * 1000));
      const minutes = Math.floor((timeUntilReset % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((timeUntilReset % (60 * 1000)) / 1000);

      setTimeRemaining({ hours, minutes, seconds });
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [email]);

  if (!timeRemaining) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800 mb-1">
            Rate Limit Reached
          </h3>
          <p className="text-sm text-red-700 mb-2">
            You've reached the limit of 4 password reset requests in 24 hours.
          </p>
          <div className="mt-2">
            <p className="text-sm font-semibold text-red-800">
              Please wait before requesting again:
            </p>
            <div className="mt-1 text-lg font-bold text-red-600">
              {String(timeRemaining.hours).padStart(2, '0')}:
              {String(timeRemaining.minutes).padStart(2, '0')}:
              {String(timeRemaining.seconds).padStart(2, '0')}
            </div>
            <p className="text-xs text-red-600 mt-1">
              (Hours : Minutes : Seconds)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetRateLimit;

