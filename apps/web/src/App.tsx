import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LiveKitProvider } from './contexts/LiveKitContext';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import PreMeetingPage from './pages/PreMeetingPage';
import RoomPage from './pages/RoomPage';
import HistoryPage from './pages/HistoryPage';
import BrandPage from './pages/BrandPage';
import InvitePage from './pages/InvitePage';
import JoinPage from './pages/JoinPage';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/ProtectedRoute';

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
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/home" element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        } />
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
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#0E0E10',
            color: '#F5F5F5',
            border: '1px solid #0E3A8A',
          },
        }}
      />
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
