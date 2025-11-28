/**
 * User Subscription Management Component
 * 
 * Admin-only UI for managing user subscriptions.
 * Provides safe admin overrides and Stripe checkout link generation.
 */

import React, { useState, useEffect } from 'react';
import {
  getUserSubscriptionInfo,
  searchUsers,
  adminOverrideSubscription,
  generateAdminCheckoutLink,
  type UserSubscriptionInfo,
} from '../lib/adminSubscriptionService';
import { SubscriptionTier, SubscriptionStatus } from '../lib/subscriptionPlans';
import { useAuth } from '../contexts/AuthContext';
import toast from '../lib/toast';
import { formatBytes, formatMinutes } from '../lib/subscriptionPlans';

const UserSubscriptionManagement: React.FC = () => {
  const { user: adminUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<UserSubscriptionInfo[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Override form state
  const [newTier, setNewTier] = useState<SubscriptionTier>('free');
  const [newStatus, setNewStatus] = useState<SubscriptionStatus>('active');
  const [newExpiresAt, setNewExpiresAt] = useState<string>('');
  
  // Checkout link state
  const [checkoutTier, setCheckoutTier] = useState<SubscriptionTier>('pro');
  const [checkoutLink, setCheckoutLink] = useState<string>('');
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      handleSearch();
    } else {
      setUsers([]);
    }
  }, [searchTerm]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    try {
      const results = await searchUsers(searchTerm.trim());
      setUsers(results);
    } catch (error: any) {
      console.error('Error searching users:', error);
      toast.error('Failed to search users: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (userId: string) => {
    setLoading(true);
    try {
      const userInfo = await getUserSubscriptionInfo(userId);
      if (userInfo) {
        setSelectedUser(userInfo);
        setNewTier(userInfo.subscriptionTier);
        setNewStatus(userInfo.subscriptionStatus);
        setNewExpiresAt(
          userInfo.subscriptionExpiresAt
            ? new Date(userInfo.subscriptionExpiresAt.toDate()).toISOString().split('T')[0]
            : ''
        );
        setCheckoutTier(userInfo.subscriptionTier === 'free' ? 'pro' : userInfo.subscriptionTier);
      }
    } catch (error: any) {
      console.error('Error loading user info:', error);
      toast.error('Failed to load user info: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminOverride = async () => {
    if (!selectedUser || !adminUser) return;
    
    // Confirm action
    const confirmMessage = `Are you sure you want to change ${selectedUser.displayName}'s subscription from ${selectedUser.subscriptionTier} to ${newTier}?\n\nThis is a FREE/COMP upgrade - no billing will occur.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setSaving(true);
    try {
      const expiresAt = newExpiresAt
        ? new Date(newExpiresAt + 'T23:59:59')
        : null;
      
      const { Timestamp } = await import('firebase/firestore');
      const expiresAtTimestamp = expiresAt ? Timestamp.fromDate(expiresAt) : null;
      
      await adminOverrideSubscription(
        selectedUser.uid,
        adminUser.uid,
        newTier,
        newStatus,
        expiresAtTimestamp
      );
      
      toast.success(`Subscription updated successfully for ${selectedUser.displayName}`);
      
      // Reload user info
      await handleSelectUser(selectedUser.uid);
    } catch (error: any) {
      console.error('Error overriding subscription:', error);
      toast.error('Failed to update subscription: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateCheckoutLink = async () => {
    if (!selectedUser || !adminUser) return;
    
    if (!selectedUser.stripeCustomerId) {
      toast.error('User does not have a Stripe customer ID. They need to complete at least one checkout first.');
      return;
    }
    
    setGeneratingLink(true);
    try {
      const baseUrl = window.location.origin;
      const successUrl = `${baseUrl}/billing/success`;
      const cancelUrl = `${baseUrl}/billing/cancel`;
      
      const link = await generateAdminCheckoutLink(
        selectedUser.uid,
        checkoutTier,
        successUrl,
        cancelUrl
      );
      
      setCheckoutLink(link);
      toast.success('Checkout link generated. Copy and send it to the user.');
    } catch (error: any) {
      console.error('Error generating checkout link:', error);
      toast.error('Failed to generate checkout link: ' + error.message);
    } finally {
      setGeneratingLink(false);
    }
  };

  if (!selectedUser) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-cloud mb-4">User Subscription Management</h2>
        
        {/* Search */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-cloud/70 mb-2">
            Search Users (by email or name)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Enter email or display name..."
              className="flex-1 px-4 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !searchTerm.trim()}
              className="px-6 py-2 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Search Results */}
        {users.length > 0 && (
          <div className="bg-midnight/60 rounded-lg border border-white/10 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-midnight/80 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-cloud">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-cloud">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-cloud">Tier</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-cloud">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-cloud">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.uid} className="border-t border-white/10 hover:bg-midnight/40">
                      <td className="px-4 py-3 text-cloud">{user.displayName}</td>
                      <td className="px-4 py-3 text-cloud/70">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-goldBright/20 text-goldBright rounded text-sm capitalize">
                          {user.subscriptionTier}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-sm ${
                          user.subscriptionStatus === 'active' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {user.subscriptionStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleSelectUser(user.uid)}
                          className="px-3 py-1 bg-goldBright text-midnight rounded hover:bg-yellow-400 transition-colors text-sm font-medium"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {searchTerm && users.length === 0 && !loading && (
          <div className="text-center py-8 text-cloud/70">
            No users found matching "{searchTerm}"
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-cloud mb-2">
            Manage Subscription: {selectedUser.displayName}
          </h2>
          <p className="text-cloud/70">{selectedUser.email}</p>
        </div>
        <button
          onClick={() => setSelectedUser(null)}
          className="px-4 py-2 bg-white/5 text-cloud rounded-lg hover:bg-white/10 transition-colors"
        >
          ← Back to Search
        </button>
      </div>

      {/* Current Subscription Info */}
      <div className="bg-midnight/60 rounded-lg border border-white/10 p-6 mb-6">
        <h3 className="text-lg font-semibold text-cloud mb-4">Current Subscription</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-cloud/70 mb-1">Tier</p>
            <p className="text-cloud font-semibold capitalize">{selectedUser.subscriptionTier}</p>
          </div>
          <div>
            <p className="text-sm text-cloud/70 mb-1">Status</p>
            <p className="text-cloud font-semibold capitalize">{selectedUser.subscriptionStatus}</p>
          </div>
          <div>
            <p className="text-sm text-cloud/70 mb-1">Expires At</p>
            <p className="text-cloud font-semibold">
              {selectedUser.subscriptionExpiresAt
                ? new Date(selectedUser.subscriptionExpiresAt.toDate()).toLocaleDateString()
                : 'Never'}
            </p>
          </div>
        </div>

        {/* Usage Stats */}
        {selectedUser.usage && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <h4 className="text-sm font-semibold text-cloud/70 mb-3">Usage This Month</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-cloud/60 mb-1">Meeting Minutes</p>
                <p className="text-cloud">{formatMinutes(selectedUser.usage.totalMeetingMinutesThisMonth)}</p>
              </div>
              <div>
                <p className="text-xs text-cloud/60 mb-1">Recording Minutes</p>
                <p className="text-cloud">{formatMinutes(selectedUser.usage.totalRecordingMinutesThisMonth)}</p>
              </div>
              <div>
                <p className="text-xs text-cloud/60 mb-1">Storage Used</p>
                <p className="text-cloud">{formatBytes(selectedUser.usage.storageUsedBytes)}</p>
              </div>
              <div>
                <p className="text-xs text-cloud/60 mb-1">Meetings Count</p>
                <p className="text-cloud">{selectedUser.usage.meetingsCountThisMonth}</p>
              </div>
            </div>
          </div>
        )}

        {/* Admin Override Log */}
        {selectedUser.adminLastModified && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <h4 className="text-sm font-semibold text-cloud/70 mb-2">Last Admin Modification</h4>
            <div className="bg-midnight/40 rounded p-3 text-sm text-cloud/80">
              <p>
                Changed from <span className="font-semibold">{selectedUser.adminLastModified.oldTier}</span> to{' '}
                <span className="font-semibold">{selectedUser.adminLastModified.newTier}</span>
              </p>
              <p className="text-xs text-cloud/60 mt-1">
                By admin on{' '}
                {selectedUser.adminLastModified.timestamp
                  ? new Date(selectedUser.adminLastModified.timestamp.toDate()).toLocaleString()
                  : 'Unknown'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Admin Override Form */}
      <div className="bg-midnight/60 rounded-lg border border-white/10 p-6 mb-6">
        <h3 className="text-lg font-semibold text-cloud mb-4">
          A) Free/Admin Override (No Billing)
        </h3>
        <p className="text-sm text-cloud/70 mb-4">
          Directly change subscription tier. This is a complimentary upgrade - no billing occurs.
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cloud/70 mb-1">New Tier</label>
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value as SubscriptionTier)}
              className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-cloud/70 mb-1">New Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as SubscriptionStatus)}
              className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="canceled">Canceled</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-cloud/70 mb-1">
              Expires At (Optional - leave empty for never)
            </label>
            <input
              type="date"
              value={newExpiresAt}
              onChange={(e) => setNewExpiresAt(e.target.value)}
              className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
            />
          </div>
          
          <button
            onClick={handleAdminOverride}
            disabled={saving}
            className="w-full px-4 py-3 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Admin Override'}
          </button>
        </div>
      </div>

      {/* Paid Upgrade (Stripe Checkout) */}
      <div className="bg-midnight/60 rounded-lg border border-white/10 p-6">
        <h3 className="text-lg font-semibold text-cloud mb-4">
          B) Paid Upgrade (Billing Required)
        </h3>
        <p className="text-sm text-cloud/70 mb-4">
          Generate a Stripe checkout link. The user must complete payment manually. No charges occur until they complete checkout.
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cloud/70 mb-1">Target Tier</label>
            <select
              value={checkoutTier}
              onChange={(e) => setCheckoutTier(e.target.value as SubscriptionTier)}
              className="w-full px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
            >
              <option value="pro">Pro</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          
          {!selectedUser.stripeCustomerId && (
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-400">
              ⚠️ User does not have a Stripe customer ID. They need to complete at least one checkout first.
            </div>
          )}
          
          <button
            onClick={handleGenerateCheckoutLink}
            disabled={generatingLink || !selectedUser.stripeCustomerId}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingLink ? 'Generating...' : 'Generate Upgrade Checkout Link'}
          </button>
          
          {checkoutLink && (
            <div className="mt-4 p-4 bg-midnight/40 rounded-lg border border-white/10">
              <label className="block text-sm font-medium text-cloud/70 mb-2">Checkout Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={checkoutLink}
                  readOnly
                  className="flex-1 px-3 py-2 bg-midnight border border-white/20 rounded-lg text-cloud text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(checkoutLink);
                    toast.success('Link copied to clipboard');
                  }}
                  className="px-4 py-2 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-medium"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-cloud/60 mt-2">
                Send this link to the user. They must complete payment to upgrade.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserSubscriptionManagement;




