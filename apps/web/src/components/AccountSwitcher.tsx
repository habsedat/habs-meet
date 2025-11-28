import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import toast from 'react-hot-toast';
import UserAvatar from './UserAvatar';

interface SavedAccount {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

interface AccountSwitcherProps {
  onProfileClick?: () => void;
  onSignOut?: () => void;
}

const AccountSwitcher: React.FC<AccountSwitcherProps> = ({ onProfileClick, onSignOut }) => {
  const { user, userProfile, logout } = useAuth();
  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut();
    } else {
      logout();
    }
    setShowDropdown(false);
  };
  const [showDropdown, setShowDropdown] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

  useEffect(() => {
    loadSavedAccounts();
  }, [user?.uid]);

  const loadSavedAccounts = () => {
    try {
      const saved = localStorage.getItem('savedAccounts');
      if (saved) {
        const accounts = JSON.parse(saved) as SavedAccount[];
        // Filter out current account
        const filtered = accounts.filter(acc => acc.uid !== user?.uid);
        setSavedAccounts(filtered);
      }
    } catch (error) {
      console.error('Error loading saved accounts:', error);
    }
  };

  const saveCurrentAccount = () => {
    if (!user || !userProfile) return;

    try {
      const account: SavedAccount = {
        uid: user.uid,
        email: user.email || '',
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL || user.photoURL || undefined,
      };

      const saved = localStorage.getItem('savedAccounts');
      let accounts: SavedAccount[] = saved ? JSON.parse(saved) : [];
      
      // Remove if already exists
      accounts = accounts.filter(acc => acc.uid !== account.uid);
      // Add current account
      accounts.push(account);
      
      // Keep only last 5 accounts
      if (accounts.length > 5) {
        accounts = accounts.slice(-5);
      }
      
      localStorage.setItem('savedAccounts', JSON.stringify(accounts));
      loadSavedAccounts();
      toast.success('Account saved for quick switching');
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error('Failed to save account');
    }
  };

  const switchToAccount = async (account: SavedAccount) => {
    try {
      // Save current account before switching
      if (user && userProfile) {
        saveCurrentAccount();
      }

      // Prompt for password
      const password = prompt(`Enter password for ${account.email}:`);
      if (!password) {
        return;
      }

      // Sign in to the selected account
      await signInWithEmailAndPassword(auth, account.email, password);
      toast.success(`Switched to ${account.displayName || account.email}`);
      setShowDropdown(false);
    } catch (error: any) {
      console.error('Error switching account:', error);
      toast.error('Failed to switch account: ' + error.message);
    }
  };

  const removeAccount = (uid: string) => {
    try {
      const saved = localStorage.getItem('savedAccounts');
      if (saved) {
        const accounts = JSON.parse(saved) as SavedAccount[];
        const filtered = accounts.filter(acc => acc.uid !== uid);
        localStorage.setItem('savedAccounts', JSON.stringify(filtered));
        loadSavedAccounts();
        toast.success('Account removed');
      }
    } catch (error) {
      console.error('Error removing account:', error);
      toast.error('Failed to remove account');
    }
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center space-x-2 px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors"
        title="Switch Account"
      >
        <div className="flex-shrink-0">
          <UserAvatar
            photoURL={userProfile?.photoURL || user?.photoURL}
            displayName={userProfile?.displayName}
            email={user?.email || ''}
            size="sm"
          />
        </div>
        <svg className="w-4 h-4 text-cloud" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full mt-2 bg-cloud rounded-lg shadow-xl border border-gray-200 min-w-64 max-w-[calc(100vw-1rem)] sm:max-w-none z-20 overflow-visible"
               style={{ 
                 maxHeight: 'calc(100vh - 100px)',
                 overflowY: 'auto'
               }}>
            <div className="p-2">
              {/* Current Account */}
              <div className="px-3 py-2 border-b border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Current Account</p>
                <div className="flex items-center space-x-2">
                  <UserAvatar
                    photoURL={userProfile?.photoURL || user?.photoURL}
                    displayName={userProfile?.displayName}
                    email={user?.email || ''}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-midnight truncate">
                      {userProfile?.displayName || user.email}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={saveCurrentAccount}
                    className="text-xs text-techBlue hover:text-techBlue/80"
                    title="Save for quick switching"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Saved Accounts */}
              {savedAccounts.length > 0 && (
                <div className="mt-2">
                  <p className="px-3 py-1 text-xs text-gray-500">Switch Account</p>
                  {savedAccounts.map((account) => (
                    <div
                      key={account.uid}
                      className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 rounded cursor-pointer group"
                      onClick={() => switchToAccount(account)}
                    >
                      <UserAvatar
                        photoURL={account.photoURL}
                        displayName={account.displayName}
                        email={account.email}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-midnight truncate">
                          {account.displayName || account.email}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{account.email}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAccount(account.uid);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity"
                        title="Remove account"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Profile Settings */}
              {onProfileClick && (
                <div className="mt-2 border-t border-gray-200 pt-2">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      onProfileClick();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>Profile Settings</span>
                    </div>
                  </button>
                </div>
              )}

              {/* Add Account */}
              <div className={`mt-2 border-t border-gray-200 pt-2 ${onProfileClick ? '' : 'mt-0 border-t-0'}`}>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    // Sign out and redirect to login
                    logout();
                    window.location.href = '/';
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Add Another Account</span>
                  </div>
                </button>
              </div>

              {/* Sign Out */}
              <div className="mt-2 border-t border-gray-200 pt-2">
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AccountSwitcher;

