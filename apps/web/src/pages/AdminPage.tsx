import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { defaultMediaService, DefaultMedia } from '../lib/defaultMediaService';
import { FileUploadProgress } from '../lib/fileStorageService';
import toast from '../lib/toast';

const AdminPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'background' | 'avatar' | 'filter' | 'effect'>('background');
  const [defaultMedia, setDefaultMedia] = useState<DefaultMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress | null>(null);
  const [uploadQueue, setUploadQueue] = useState<{ total: number; current: number; completed: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load default media when tab changes
  useEffect(() => {
    if (isAdmin) {
      loadDefaultMedia();
    }
  }, [activeTab, isAdmin]);


  const loadDefaultMedia = async () => {
    setLoading(true);
    try {
      const media = await defaultMediaService.getDefaultMedia(activeTab);
      setDefaultMedia(media);
    } catch (error) {
      console.error('Error loading default media:', error);
      toast.error('Failed to load default media');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    setIsUploading(true);
    const filesArray = Array.from(files);
    let successCount = 0;
    let errorCount = 0;

    // Initialize upload queue
    setUploadQueue({
      total: filesArray.length,
      current: 0,
      completed: 0,
      failed: 0
    });

    // Process all files sequentially to avoid overwhelming the system
    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const fileId = `temp_${Date.now()}_${i}`;
      
      setUploadQueue(prev => prev ? { ...prev, current: i + 1 } : null);
      setUploadProgress({
        fileId,
        progress: 0,
        status: 'uploading'
      });

      try {
        const newMedia = await defaultMediaService.uploadDefaultMedia(
          file,
          activeTab,
          user.uid,
          (progress) => setUploadProgress(progress)
        );
        setDefaultMedia(prev => [newMedia, ...prev]);
        successCount++;
        setUploadQueue(prev => prev ? { ...prev, completed: prev.completed + 1 } : null);
        
        if (filesArray.length === 1) {
          toast.success(`${file.name} uploaded successfully!`);
        }
      } catch (error: any) {
        console.error('Error uploading default media:', error);
        errorCount++;
        setUploadQueue(prev => prev ? { ...prev, failed: prev.failed + 1 } : null);
        
        if (filesArray.length === 1) {
          toast.error(`Failed to upload ${file.name}: ${error.message}`);
        }
      }
    }

    // Show summary toast for multiple files
    if (filesArray.length > 1) {
      if (errorCount === 0) {
        toast.success(`All ${successCount} files uploaded successfully!`);
      } else {
        toast.error(`Uploaded ${successCount} files, ${errorCount} failed`);
      }
    }

    setIsUploading(false);
    setUploadProgress(null);
    setUploadQueue(null);
    event.target.value = ''; // Reset file input
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!user || !isAdmin) return;

    try {
      // Pass isAdmin=true to allow deletion of any media (including hardcoded defaults)
      await defaultMediaService.deleteDefaultMedia(mediaId, user.uid, true);
      setDefaultMedia(prev => prev.filter(media => media.id !== mediaId));
      toast.success('Default media deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting default media:', error);
      toast.error(`Failed to delete media: ${error.message}`);
    }
  };

  const handleDeleteHardcodedDefaults = async () => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete all hardcoded default media? This will remove all backgrounds/images that were created before admin uploads were implemented.')) {
      return;
    }

    try {
      const result = await defaultMediaService.deleteHardcodedDefaults(user.uid, activeTab);
      toast.success(`Deleted ${result.deleted} hardcoded default(s). ${result.errors > 0 ? `${result.errors} error(s) occurred.` : ''}`);
      await loadDefaultMedia(); // Reload the list
    } catch (error: any) {
      console.error('Error deleting hardcoded defaults:', error);
      toast.error(`Failed to delete hardcoded defaults: ${error.message}`);
    }
  };

  const handleSyncMedia = async () => {
    if (!user) return;
    
    setIsSyncing(true);
    try {
      const result = await defaultMediaService.syncDefaultMediaToBothProjects();
      toast.success(`Sync completed! ${result.synced} items synced, ${result.errors} errors`);
      // Reload media after sync
      await loadDefaultMedia();
    } catch (error: any) {
      console.error('Error syncing default media:', error);
      toast.error(`Failed to sync media: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Check if user is admin - if not, show access denied
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-midnight via-violetDeep to-techBlue flex items-center justify-center">
        <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl w-full max-w-md mx-4 border border-white/20 overflow-hidden shadow-2xl">
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-cloud mb-4">Access Denied</h1>
            <p className="text-cloud/70 mb-6">You need admin privileges to access this page.</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-3 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight via-violetDeep to-techBlue">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl border border-white/20 p-6 mb-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-cloud mb-2">Admin Panel</h1>
              <p className="text-cloud/70">Manage default media files for all users</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSyncMedia}
                disabled={isSyncing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? 'Syncing...' : 'Sync to Both Projects'}
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-4 py-2 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors font-semibold"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden shadow-2xl">
          {/* Category Tabs */}
          <div className="bg-midnight/80 border-b border-white/20 px-6 py-4">
            <div className="flex space-x-6">
              {[
                { id: 'background', label: 'Virtual Backgrounds' },
                { id: 'avatar', label: 'Avatars' },
                { id: 'filter', label: 'Video Filters' },
                { id: 'effect', label: 'Studio Effects' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`pb-2 px-1 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-goldBright border-b-2 border-goldBright'
                      : 'text-cloud/60 hover:text-cloud'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Upload Section */}
            <div className="mb-8 p-6 bg-midnight/60 rounded-lg border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-cloud mb-2">
                    Upload New Default {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </h3>
                  <p className="text-cloud/70">
                    Add media that will be available to all users. Supports images, videos, and audio files.
                    <br />
                    <span className="text-goldBright text-sm font-semibold">💡 Tip: You can select multiple files at once! Hold Ctrl (or Cmd on Mac) to select multiple files.</span>
                  </p>
                </div>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="admin-media-upload"
                    disabled={isUploading}
                    multiple
                  />
                  <label
                    htmlFor="admin-media-upload"
                    className="px-4 py-2 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors cursor-pointer font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    {isUploading ? 'Uploading...' : 'Upload Files'}
                  </label>
                </div>
              </div>

              {/* Upload Progress */}
              {(uploadProgress || uploadQueue) && (
                <div className="mt-4 p-4 bg-midnight/60 rounded-lg border border-white/10">
                  {uploadQueue && uploadQueue.total > 1 && (
                    <div className="mb-3 pb-3 border-b border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-cloud text-sm font-medium">
                          Uploading {uploadQueue.current} of {uploadQueue.total} files
                        </span>
                        <span className="text-cloud/60 text-xs">
                          {uploadQueue.completed} completed, {uploadQueue.failed} failed
                        </span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-goldBright h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(uploadQueue.completed / uploadQueue.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  {uploadProgress && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-cloud text-sm font-medium">
                          {uploadProgress.status === 'uploading' ? 'Uploading...' : 
                           uploadProgress.status === 'processing' ? 'Processing...' : 
                           uploadProgress.status === 'completed' ? 'Completed!' : 'Error'}
                        </span>
                        <span className="text-cloud/60 text-xs">{uploadProgress.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-goldBright h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress.progress}%` }}
                        ></div>
                      </div>
                      {uploadProgress.error && (
                        <p className="text-red-400 text-xs mt-1">{uploadProgress.error}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Media Grid */}
            <div>
              {/* Cleanup Hardcoded Defaults Button */}
              {defaultMedia.length > 0 && (
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={handleDeleteHardcodedDefaults}
                    className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-colors text-sm font-medium flex items-center gap-2"
                    title="Delete all hardcoded default media (those without an uploader)"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Clean Up Hardcoded Defaults
                  </button>
                </div>
              )}
              <h3 className="text-xl font-semibold text-cloud mb-4">
                Default {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} ({defaultMedia.length})
              </h3>
              
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-goldBright"></div>
                  <p className="text-cloud/70 mt-2">Loading media...</p>
                </div>
              ) : defaultMedia.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-cloud/50" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-cloud/70">No default {activeTab} uploaded yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {defaultMedia.map((media) => (
                    <div key={media.id} className="relative group">
                      <div className="p-3 rounded-lg border-2 border-white/20 hover:border-white/40 transition-all duration-200">
                        <div className="aspect-video bg-white/10 rounded mb-3 flex items-center justify-center relative overflow-hidden">
                          <img 
                            src={media.thumbnail} 
                            alt={media.name}
                            className="w-full h-full object-cover rounded"
                          />
                          {media.type === 'video' && (
                            <div className="absolute bottom-1 left-1">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-cloud text-center truncate mb-1">{media.name}</p>
                        <p className="text-xs text-cloud/60 text-center">
                          Uploaded by: {media.uploadedBy.slice(0, 8)}...
                        </p>
                      </div>
                      
                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteMedia(media.id)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      >
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
