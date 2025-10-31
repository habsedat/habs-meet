import React, { useState, useEffect, useRef } from 'react';
import { LocalVideoTrack } from 'livekit-client';
import { defaultMediaService, DefaultMedia } from '../lib/defaultMediaService';
import { fileStorageService, UploadedFile, FileUploadProgress } from '../lib/fileStorageService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface BackgroundEffectsPanelProps {
      onClose: () => void;
      onBackgroundChange: (type: 'none' | 'blur' | 'image' | 'video', url?: string) => Promise<void>;
      videoTrack: LocalVideoTrack | null;
      onDeviceChange?: (videoDeviceId?: string, audioDeviceId?: string) => void;
      audioDevices?: Array<{ deviceId: string; label: string }>;
      videoDevices?: Array<{ deviceId: string; label: string }>;
      selectedVideoDevice?: string;
      selectedAudioDevice?: string;
      currentSelectedBackground?: 'none' | 'blur' | string | null;
    }

type TabType = 'camera' | 'background' | 'avatar' | 'filter' | 'effect';

    const BackgroundEffectsPanel: React.FC<BackgroundEffectsPanelProps> = ({ 
      onClose, 
      onBackgroundChange,
      videoTrack,
      onDeviceChange,
      audioDevices = [],
      videoDevices = [],
      selectedVideoDevice = '',
      selectedAudioDevice = '',
      currentSelectedBackground = null
    }) => {
      const { user } = useAuth();
      const [activeTab, setActiveTab] = useState<TabType>('background');
      const [backgrounds, setBackgrounds] = useState<DefaultMedia[]>([]);
      const [userMedia, setUserMedia] = useState<UploadedFile[]>([]);
      const [loading, setLoading] = useState(false);
      const [uploading, setUploading] = useState(false);
      const [uploadProgress, setUploadProgress] = useState<FileUploadProgress | null>(null);
      const [selectedBackground, setSelectedBackground] = useState<'none' | 'blur' | string | null>(currentSelectedBackground || null);
      
      // Sync with parent's selected background
      useEffect(() => {
        if (currentSelectedBackground !== undefined) {
          setSelectedBackground(currentSelectedBackground);
        }
      }, [currentSelectedBackground]);
  const videoPreviewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Attach video track to preview
  useEffect(() => {
    if (videoTrack && videoPreviewRef.current) {
      // Remove any existing video element
      const existingVideo = videoPreviewRef.current.querySelector('video');
      if (existingVideo) {
        existingVideo.remove();
      }
      
      // Attach the video track
      const element = videoTrack.attach();
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.objectFit = 'cover';
      videoPreviewRef.current.appendChild(element);
    }

    return () => {
      if (videoTrack && videoPreviewRef.current) {
        videoTrack.detach();
      }
    };
  }, [videoTrack]);

  useEffect(() => {
    if (activeTab === 'background') {
      loadBackgrounds();
      loadUserMedia();
    }
  }, [activeTab, user]);

  const loadBackgrounds = async () => {
    setLoading(true);
    try {
      const media = await defaultMediaService.getDefaultMedia('background');
      setBackgrounds(media);
    } catch (error) {
      console.error('Error loading backgrounds:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserMedia = async () => {
    if (!user) return;
    try {
      const files = await fileStorageService.getUserFiles(user.uid);
      // Filter to only show images and videos (for backgrounds)
      const mediaFiles = files.filter(file => file.type === 'image' || file.type === 'video');
      setUserMedia(mediaFiles);
    } catch (error) {
      console.error('Error loading user media:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setUploadProgress({
      fileId: '',
      progress: 0,
      status: 'uploading'
    });

    try {
      await fileStorageService.uploadFile(
        file,
        user.uid,
        (progress) => setUploadProgress(progress)
      );

      // Reload user media to show the new upload
      await loadUserMedia();
      toast.success(`${file.name} uploaded successfully!`);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error(`Failed to upload ${file.name}: ${error.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBackgroundSelect = async (bg: 'none' | 'blur' | DefaultMedia | UploadedFile) => {
    if (bg === 'none') {
      setSelectedBackground('none');
      await onBackgroundChange('none');
    } else if (bg === 'blur') {
      setSelectedBackground('blur');
      await onBackgroundChange('blur');
    } else {
      // Check if it's an UploadedFile (has userId property) or DefaultMedia
      const bgId = 'userId' in bg ? `user_${bg.id}` : bg.id;
      setSelectedBackground(bgId);
      if (bg.type === 'image') {
        await onBackgroundChange('image', bg.url);
      } else if (bg.type === 'video') {
        await onBackgroundChange('video', bg.url);
      }
    }
  };

  const defaultBackgrounds = [
    {
      id: 'default-1',
      name: 'Abstract Gradient',
      thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM2QzYzRkYiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwRTNBODEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
      url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM2QzYzRkYiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwRTNBODEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==',
    },
    {
      id: 'default-2',
      name: 'City Skyline',
      thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iIzE2Mjc0NyIvPjxwYXRoIGQ9Ik0wIDkwIEg1MCBWMTIwIEgwIFoiIGZpbGw9IiM0QTU3NjgiLz48cGF0aCBkPSJNNTAgODAgSDgwIFYxMjAgSDUwIFoiIGZpbGw9IiM0QTU3NjgiLz48cGF0aCBkPSJNODAgOTUgSDEyMCBWMTIwIEg4MCBaIiBmaWxsPSIjNEE1NzY4Ii8+PC9zdmc+',
      url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iIzE2Mjc0NyIvPjxwYXRoIGQ9Ik0wIDkwIEg1MCBWMTIwIEgwIFoiIGZpbGw9IiM0QTU3NjgiLz48cGF0aCBkPSJNNTAgODAgSDgwIFYxMjAgSDUwIFoiIGZpbGw9IiM0QTU3NjgiLz48cGF0aCBkPSJNODAgOTUgSDEyMCBWMTIwIEg4MCBaIiBmaWxsPSIjNEE1NzY4Ii8+PC9zdmc+',
    },
    {
      id: 'default-3',
      name: 'Nature Forest',
      thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iIzIyNzY1QSIvPjxwYXRoIGQ9Ik0wIDkwIFEyMCA3MCA0MCA4MCBRNjAgNzAgODAgODAgUTEwMCA3MCAxMjAgODAgUTE0MCA3MCAxNjAgODAgUTE4MCA3MCAyMDAgODAgVjEyMCBIMCAiIGZpbGw9IiMzRDU1NDciLz48L3N2Zz4=',
      url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iIzIyNzY1QSIvPjxwYXRoIGQ9Ik0wIDkwIFEyMCA3MCA0MCA4MCBRNjAgNzAgODAgODAgUTEwMCA3MCAxMjAgODAgUTE0MCA3MCAxNjAgODAgUTE4MCA3MCAyMDAgODAgVjEyMCBIMCAiIGZpbGw9IiMzRDU1NDciLz48L3N2Zz4=',
    },
    {
      id: 'default-4',
      name: 'Minimalist Space',
      thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0Y5RkFGQiIvPjxjaXJjbGUgY3g9IjEwMCIgY3k9IjYwIiByPSIzMCIgZmlsbD0iI0ZGREMzNSIvPjwvc3ZnPg==',
      url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI0Y5RkFGQiIvPjxjaXJjbGUgY3g9IjEwMCIgY3k9IjYwIiByPSIzMCIgZmlsbD0iI0ZGREMzNSIvPjwvc3ZnPg==',
    },
  ];

  const allBackgrounds = [
    ...(backgrounds.length > 0 ? backgrounds : defaultBackgrounds.map(bg => ({
      ...bg,
      type: 'image' as const,
      mimeType: 'image/svg+xml',
      size: 0,
      category: 'background' as const,
      uploadedAt: new Date(),
      uploadedBy: '',
      isActive: true,
    }))),
  ];

  return (
    <>
      {/* Backdrop - No blur, just semi-transparent */}
      <div 
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      
      {/* Right Side Panel - With spacing from edges */}
      <div className="fixed right-4 top-4 bottom-4 w-full max-w-md bg-midnight/98 backdrop-blur-lg border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col">
        {/* Header - Fixed */}
        <div className="bg-midnight/90 border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-goldBright rounded flex items-center justify-center">
              <svg className="w-4 h-4 text-midnight" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-cloud">Habs Meet</h2>
              <p className="text-xs text-cloud/60">Background & effects</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-cloud/50 hover:text-cloud transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video Preview - Fixed at top, not scrollable, with borders */}
        <div className="w-full h-56 bg-black flex-shrink-0 overflow-hidden rounded-lg border-2 border-white/20 m-4">
          <div ref={videoPreviewRef} className="w-full h-full" />
          {!videoTrack && (
            <div className="absolute inset-0 flex items-center justify-center text-cloud/50 text-sm">
              Camera not available
            </div>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {/* Tabs */}
            <div className="flex space-x-1 mb-4 border-b border-white/10 overflow-x-auto">
              {[
                { id: 'camera', label: 'Camera' },
                { id: 'background', label: 'Virtual backgrounds' },
                { id: 'avatar', label: 'Avatars' },
                { id: 'filter', label: 'Video filters' },
                { id: 'effect', label: 'Studio effects' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-goldBright border-b-2 border-goldBright'
                      : 'text-cloud/60 hover:text-cloud'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content based on active tab */}
            {activeTab === 'background' && (
              <div>
                {/* None and Blur buttons */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={async () => {
                      await handleBackgroundSelect('none');
                    }}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      selectedBackground === 'none'
                        ? 'border-goldBright bg-goldBright/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="text-center">
                      <div className="w-full h-16 bg-midnight rounded mb-1.5 flex items-center justify-center">
                        <span className="text-cloud/50 text-xs">None</span>
                      </div>
                      <p className="text-xs text-cloud">None</p>
                    </div>
                  </button>

                  <button
                    onClick={async () => {
                      await handleBackgroundSelect('blur');
                    }}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      selectedBackground === 'blur'
                        ? 'border-goldBright bg-goldBright/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="text-center">
                      <div className="w-full h-16 bg-gradient-to-r from-midnight via-gray-600 to-midnight rounded mb-1.5 flex items-center justify-center blur-sm">
                        <span className="text-cloud/50 text-xs">Blur</span>
                      </div>
                      <p className="text-xs text-cloud">Blur</p>
                    </div>
                  </button>
                </div>

                {/* Upload Section */}
                <div className="mb-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="background-upload"
                    disabled={uploading || !user}
                  />
                  <label
                    htmlFor="background-upload"
                    className={`flex items-center justify-center gap-2 px-4 py-2 bg-techBlue/20 hover:bg-techBlue/30 border border-techBlue/40 rounded-lg cursor-pointer transition-all text-sm text-cloud ${
                      uploading || !user ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>{uploading ? 'Uploading...' : 'Upload Image/Video'}</span>
                  </label>
                  
                  {/* Upload Progress */}
                  {uploadProgress && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-cloud/60">
                          {uploadProgress.status === 'uploading' ? 'Uploading...' : 
                           uploadProgress.status === 'processing' ? 'Processing...' : 
                           uploadProgress.status === 'completed' ? 'Completed!' : 'Error'}
                        </span>
                        <span className="text-xs text-cloud/60">{uploadProgress.progress}%</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-1.5">
                        <div
                          className="bg-goldBright h-1.5 rounded-full transition-all"
                          style={{ width: `${uploadProgress.progress}%` }}
                        />
                      </div>
                      {uploadProgress.error && (
                        <p className="text-red-400 text-xs mt-1">{uploadProgress.error}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* My Uploads */}
                {userMedia.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-cloud mb-3">My Uploads</h3>
                    <div className="grid grid-cols-4 gap-2 pb-4">
                      {userMedia.map((file) => (
                        <button
                          key={file.id}
                          onClick={() => handleBackgroundSelect(file)}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                            selectedBackground === `user_${file.id}`
                              ? 'border-goldBright ring-2 ring-goldBright'
                              : 'border-white/10 hover:border-white/30'
                          }`}
                        >
                          <div className="aspect-video bg-midnight">
                            <img
                              src={file.thumbnail || file.url}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-xs text-cloud text-center p-1 truncate">{file.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Default Backgrounds */}
                <div>
                  <h3 className="text-xs font-semibold text-cloud mb-3">Default Backgrounds</h3>
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-goldBright"></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 pb-4">
                      {allBackgrounds.map((bg) => (
                        <button
                          key={bg.id}
                          onClick={() => handleBackgroundSelect(bg)}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                            selectedBackground === bg.id
                              ? 'border-goldBright ring-2 ring-goldBright'
                              : 'border-white/10 hover:border-white/30'
                          }`}
                        >
                          <div className="aspect-video bg-midnight">
                            <img
                              src={bg.thumbnail || bg.url}
                              alt={bg.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-xs text-cloud text-center p-1 truncate">{bg.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Camera Tab - Device Selection */}
            {activeTab === 'camera' && (
              <div className="space-y-4">
                {/* Audio Input */}
                <div>
                  <label className="block text-xs font-medium text-cloud/80 mb-1.5">
                    Audio Input
                  </label>
                  <select
                    value={selectedAudioDevice}
                    onChange={(e) => {
                      if (onDeviceChange) {
                        onDeviceChange(selectedVideoDevice, e.target.value);
                      }
                    }}
                    className="w-full px-3 py-1.5 text-sm bg-midnight border border-white/10 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  >
                    {audioDevices.length > 0 ? (
                      audioDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                        </option>
                      ))
                    ) : (
                      <option value="">No audio devices available</option>
                    )}
                  </select>
                </div>

                {/* Video Input */}
                <div>
                  <label className="block text-xs font-medium text-cloud/80 mb-1.5">
                    Video Input
                  </label>
                  <select
                    value={selectedVideoDevice}
                    onChange={(e) => {
                      if (onDeviceChange) {
                        onDeviceChange(e.target.value, selectedAudioDevice);
                      }
                    }}
                    className="w-full px-3 py-1.5 text-sm bg-midnight border border-white/10 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                  >
                    {videoDevices.length > 0 ? (
                      videoDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                        </option>
                      ))
                    ) : (
                      <option value="">No video devices available</option>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Placeholder for other tabs */}
            {activeTab !== 'background' && activeTab !== 'camera' && (
              <div className="text-center py-8 text-cloud/50 text-sm">
                <p>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} feature coming soon</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default BackgroundEffectsPanel;
