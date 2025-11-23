import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { defaultMediaService, DefaultMedia, DefaultMediaUploadProgress } from '../lib/defaultMediaService';
import toast from '../lib/toast';

interface DefaultMediaManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const DefaultMediaManager: React.FC<DefaultMediaManagerProps> = ({ isOpen, onClose }) => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'background' | 'avatar' | 'filter' | 'effect'>('background');
  const [defaultMedia, setDefaultMedia] = useState<DefaultMedia[]>([]);
  const [uploadProgress, setUploadProgress] = useState<DefaultMediaUploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load default media when tab changes
  useEffect(() => {
    if (isOpen) {
      loadDefaultMedia();
    }
  }, [activeTab, isOpen]);

  const loadDefaultMedia = async () => {
    setLoading(true);
    try {
      const media = await defaultMediaService.getDefaultMedia(activeTab);
      setDefaultMedia(media);
    } catch (error: any) {
      console.error('Error loading default media:', error);
      toast.error('Failed to load default media');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    const file = files[0];
    setIsUploading(true);
    setUploadProgress({
      fileId: `temp_${Date.now()}`,
      progress: 0,
      status: 'uploading'
    });

    try {
      const uploadedMedia = await defaultMediaService.uploadDefaultMedia(
        file,
        activeTab,
        user.uid,
        (progress) => setUploadProgress(progress)
      );

      // Add to default media list
      setDefaultMedia(prev => [uploadedMedia, ...prev]);
      toast.success(`${file.name} uploaded as default ${activeTab}!`);
    } catch (error: any) {
      console.error('Error uploading default media:', error);
      toast.error(`Failed to upload ${file.name}: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      // Reset file input
      event.target.value = '';
    }
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

  if (!isOpen) return null;
  
  // Check if user is admin
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl w-full max-w-md mx-4 border border-white/20 overflow-hidden shadow-2xl">
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-cloud mb-2">Access Denied</h3>
            <p className="text-cloud/70 mb-4">You need admin privileges to access this feature.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-goldBright text-midnight rounded-lg hover:bg-yellow-400 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl w-full max-w-6xl max-h-[90vh] border border-white/20 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-midnight/80 border-b border-white/30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-goldBright to-yellow-400 rounded flex items-center justify-center">
              <svg className="w-5 h-5 text-midnight" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-cloud">Default Media Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="text-cloud/60 hover:text-cloud transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Navigation Tabs */}
          <div className="flex space-x-6 mb-6 border-b border-white/20">
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

          {/* Upload Section */}
          <div className="mb-6 p-4 bg-midnight/60 rounded-lg border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-cloud">Upload Default {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,video/*,audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="default-media-upload"
                  disabled={isUploading}
                />
                <label
                  htmlFor="default-media-upload"
                  className={`w-10 h-10 bg-goldBright rounded-full flex items-center justify-center hover:bg-yellow-400 transition-colors cursor-pointer ${
                    isUploading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <svg className="w-6 h-6 text-midnight" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                </label>
              </div>
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="mb-4 p-3 bg-midnight/60 rounded-lg border border-white/10">
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

          {/* Media Grid */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-cloud">Current Default {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-goldBright"></div>
                <span className="ml-2 text-cloud">Loading...</span>
              </div>
            ) : defaultMedia.length === 0 ? (
              <div className="text-center py-8 text-cloud/60">
                <p>No default {activeTab} media uploaded yet.</p>
                <p className="text-sm mt-1">Upload some files to make them available to all users.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {defaultMedia.map((media) => (
                  <div key={media.id} className="relative group">
                    <div className="p-3 rounded-lg border-2 border-white/20 hover:border-white/40 transition-all duration-200">
                      <div className="aspect-video bg-white/10 rounded mb-2 flex items-center justify-center relative overflow-hidden">
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
                      <p className="text-xs text-cloud text-center truncate">{media.name}</p>
                      <p className="text-xs text-cloud/60 text-center">
                        {(media.size / 1024 / 1024).toFixed(1)} MB
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
  );
};

export default DefaultMediaManager;
