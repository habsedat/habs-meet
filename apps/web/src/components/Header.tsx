import React from 'react';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  title?: string;
  showUserMenu?: boolean;
  onLeave?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, showUserMenu = true, onLeave }) => {
  const { user, userProfile, logout } = useAuth();

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


