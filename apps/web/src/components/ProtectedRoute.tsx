import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import EmailVerificationPage from './EmailVerificationPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, isEmailVerified } = useAuth();

  // Always show loading while authentication state is being determined
  if (loading) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-techBlue mx-auto mb-4"></div>
          <h2 className="text-2xl font-semibold text-cloud mb-2">Verifying Authentication</h2>
          <p className="text-gray-300">Please wait while we check your login status...</p>
        </div>
      </div>
    );
  }

  // If not loading and no user, redirect to auth page (root)
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // If user exists but email is not verified, show email verification page
  if (user && !isEmailVerified) {
    return <EmailVerificationPage />;
  }

  // User is authenticated and email is verified, render protected content
  return <>{children}</>;
};

export default ProtectedRoute;
