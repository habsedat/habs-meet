import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LiveKitProvider } from './contexts/LiveKitContext';
import WelcomePage from './pages/WelcomePage';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import PreMeetingPage from './pages/PreMeetingPage';
import RoomPage from './pages/RoomPage';
import HistoryPage from './pages/HistoryPage';
import BrandPage from './pages/BrandPage';
import InvitePage from './pages/InvitePage';
import JoinPage from './pages/JoinPage';
import WaitingRoomPage from './pages/WaitingRoomPage';
import AdminPage from './pages/AdminPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import InboxPage from './pages/InboxPage';
import PricingPage from './pages/PricingPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import CookiePolicyPage from './pages/CookiePolicyPage';
import DataProcessingAgreementPage from './pages/DataProcessingAgreementPage';
import GlobalPrivacyPolicyPage from './pages/GlobalPrivacyPolicyPage';
import GlobalUserRightsPage from './pages/GlobalUserRightsPage';
import InternationalCompliancePage from './pages/InternationalCompliancePage';
import RecordingConsentInfoPage from './pages/RecordingConsentInfoPage';
import ProtectedRoute from './components/ProtectedRoute';
import SEOHead from './components/SEOHead';
import AppRedirectHandler from './components/AppRedirectHandler';

function AppRoutes() {
  const { loading } = useAuth();
  const showBrandPage = (import.meta as any).env.VITE_SHOW_BRAND_PAGE === 'true';

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-techBlue mx-auto mb-4"></div>
          <h2 className="text-2xl font-semibold text-cloud mb-2">Loading Habs Meet</h2>
          <p className="text-gray-300">Please wait while we verify your authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight text-cloud">
      <SEOHead />
      <AppRedirectHandler />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/home" element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        } />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/cookie-policy" element={<CookiePolicyPage />} />
        <Route path="/data-processing-agreement" element={<DataProcessingAgreementPage />} />
        <Route path="/global-privacy-policy" element={<GlobalPrivacyPolicyPage />} />
        <Route path="/global-user-rights" element={<GlobalUserRightsPage />} />
        <Route path="/international-compliance" element={<InternationalCompliancePage />} />
        <Route path="/recording-consent-info" element={<RecordingConsentInfoPage />} />
        <Route path="/invite/:inviteId" element={<InvitePage />} />
        <Route
          path="/join/:roomId"
          element={
            <ProtectedRoute>
              <JoinPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/waiting-room"
          element={
            <ProtectedRoute>
              <WaitingRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pre-meeting"
          element={
            <ProtectedRoute>
              <PreMeetingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/room/:roomId"
          element={
            <ProtectedRoute>
              <RoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inbox"
          element={
            <ProtectedRoute>
              <InboxPage />
            </ProtectedRoute>
          }
        />
        {showBrandPage && <Route path="/brand" element={<BrandPage />} />}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <LiveKitProvider>
        <Router>
          <AppRoutes />
        </Router>
      </LiveKitProvider>
    </AuthProvider>
  );
}

export default App;
