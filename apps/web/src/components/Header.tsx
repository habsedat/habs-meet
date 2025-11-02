import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  title?: string;
  showUserMenu?: boolean;
  onLeave?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, showUserMenu = true, onLeave }) => {
  const { user, userProfile, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="bg-midnight border-b border-gray-800 px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Brand logo mark - stylized H placeholder */}
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-techBlue to-violetDeep rounded-lg flex items-center justify-center">
            <span className="text-cloud font-bold text-lg sm:text-xl">H</span>
          </div>
          {title && (
            <h1 className="text-lg sm:text-xl font-semibold text-cloud">{title}</h1>
          )}
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          {onLeave && (
            <button
              onClick={onLeave}
              className="btn btn-danger"
            >
              Leave
            </button>
          )}

          {showUserMenu && user && (
            <div className="flex items-center space-x-3">
              {/* Admin Link - only show for admins */}
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="btn btn-ghost text-sm px-2 sm:px-4"
                  title="Admin Panel"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}
              
              <div className="text-right">
                <p className="text-sm font-medium text-cloud">
                  {userProfile?.displayName || user.email}
                </p>
                <p className="text-xs text-gray-400">
                  {userProfile?.displayName ? user.email : 'Host'}
                </p>
              </div>
              <button
                onClick={logout}
                className="btn btn-ghost text-sm"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;


