import React, { useState, useEffect, useRef } from 'react';
import { LocalVideoTrack } from 'livekit-client';
import { defaultMediaService, DefaultMedia } from '../lib/defaultMediaService';
import { fileStorageService, UploadedFile, FileUploadProgress } from '../lib/fileStorageService';
import { useAuth } from '../contexts/AuthContext';
import toast from '../lib/toast';

interface BackgroundEffectsPanelProps {
      onClose: () => void;
      onBackgroundChange: (type: 'none' | 'blur' | 'image' | 'video', url?: string) => Promise<void>;
      videoTrack: LocalVideoTrack | null;
      onDeviceChange?: (videoDeviceId?: string, audioDeviceId?: string) => void;
      audioDevices?: Array<{ deviceId: string; label: string }>;
      videoDevices?: Array<{ deviceId: string; label: string }>;
      selectedVideoDevice?: string;
      selectedAudioDevice?: string;
      savedBackground?: { type: 'none' | 'blur' | 'image' | 'video'; url?: string } | null;
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
      savedBackground = null
    }) => {
      const { user } = useAuth();
      const [activeTab, setActiveTab] = useState<TabType>('background');
      const [backgrounds, setBackgrounds] = useState<DefaultMedia[]>([]);
      const [userMedia, setUserMedia] = useState<UploadedFile[]>([]);
      const [loading, setLoading] = useState(false);
      const [uploading, setUploading] = useState(false);
      const [uploadProgress, setUploadProgress] = useState<FileUploadProgress | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<'none' | 'blur' | string | null>('none');
  const videoPreviewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Detect mobile/tablet screen size
  const [isMobile, setIsMobile] = useState(false);
  const historyPushedRef = useRef(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint in Tailwind
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Handle native back button on mobile
  useEffect(() => {
    if (!isMobile) return;
    
    const handlePopState = () => {
      // User pressed back button, close the panel
      historyPushedRef.current = false; // Reset for next open
      onClose();
    };
    
    // Push a history state so back button works (only once)
    if (!historyPushedRef.current) {
      window.history.pushState({ backgroundPanelOpen: true }, '');
      historyPushedRef.current = true;
    }
    
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      historyPushedRef.current = false; // Reset when component unmounts
    };
  }, [isMobile, onClose]);

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
      element.muted = true; // helps some browsers when the panel tries to render
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.objectFit = 'contain'; // Show full video without cropping
      element.style.objectPosition = 'center';
      element.style.backgroundColor = '#000';
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

  // Match savedBackground to the actual media ID
  useEffect(() => {
    if (savedBackground && (backgrounds.length > 0 || userMedia.length > 0)) {
      if (savedBackground.type === 'none') {
        setSelectedBackground('none');
      } else if (savedBackground.type === 'blur') {
        setSelectedBackground('blur');
      } else if (savedBackground.type === 'image' && savedBackground.url) {
        // Find matching media by URL
        const matchingUserMedia = userMedia.find(m => m.url === savedBackground.url);
        const matchingDefaultMedia = backgrounds.find(m => m.url === savedBackground.url);
        
        if (matchingUserMedia) {
          setSelectedBackground(matchingUserMedia.id);
        } else if (matchingDefaultMedia) {
          setSelectedBackground(matchingDefaultMedia.id);
        }
      }
    }
  }, [savedBackground, backgrounds, userMedia]);

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
      // Filter to only show images (videos disabled for now)
      const mediaFiles = files.filter(file => file.type === 'image');
      setUserMedia(mediaFiles);
    } catch (error) {
      console.error('Error loading user media:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file is an image
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed for backgrounds');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Validate image is landscape
    const img = new Image();
    let objectUrl: string | null = null;
    const checkLandscape = () => {
      return new Promise<void>((resolve, reject) => {
        img.onload = () => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }
          if (img.width > img.height) {
            resolve();
          } else {
            reject(new Error('Please upload a landscape (horizontal) image. Portrait images are not supported.'));
          }
        };
        img.onerror = () => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }
          reject(new Error('Failed to load image'));
        };
        objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
      });
    };

    try {
      await checkLandscape();
    } catch (error: any) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast.error(error.message);
      return;
    }

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

  const handleDeleteFile = async (fileId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering background selection
    
    if (!user) return;
    
    // Confirm deletion
    if (!window.confirm('Are you sure you want to delete this background?')) {
      return;
    }

    try {
      await fileStorageService.deleteFile(fileId, user.uid);
      toast.success('Background deleted successfully');
      // Reload user media
      await loadUserMedia();
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete background: ' + error.message);
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
      // Use unique ID for each media item
      const bgId = bg.id;
      setSelectedBackground(bgId);
      if (bg.type === 'image') {
        await onBackgroundChange('image', bg.url);
      }
      // Video backgrounds are disabled for now
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
      <div className="fixed inset-0 sm:inset-auto sm:right-4 sm:top-4 sm:bottom-4 w-full sm:max-w-md bg-midnight/98 backdrop-blur-lg border border-white/10 sm:rounded-xl shadow-2xl z-50 flex flex-col">
        {/* Header - Fixed */}
        <div className="bg-midnight/90 border-b border-white/10 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 sm:w-7 sm:h-7 bg-goldBright rounded flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-midnight" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-semibold text-cloud truncate">Habs Meet</h2>
              <p className="text-[10px] sm:text-xs text-cloud/60">Background & effects</p>
            </div>
          </div>
          {/* Hide X button on mobile, show on desktop */}
          <button
            onClick={onClose}
            className={`text-cloud/50 hover:text-cloud transition-colors p-1 ${isMobile ? 'hidden' : ''}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video Preview - Fixed at top, not scrollable, with borders */}
        <div className="w-full aspect-video max-h-[280px] sm:max-h-[360px] bg-black flex-shrink-0 overflow-hidden sm:rounded-lg border-2 border-white/20 m-2 sm:m-4">
          <div ref={videoPreviewRef} className="w-full h-full" />
          {!videoTrack && (
            <div className="absolute inset-0 flex items-center justify-center text-cloud/50 text-sm">
              Camera not available
            </div>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 sm:p-4">
            {/* Tabs */}
            <div className="flex space-x-1 mb-3 sm:mb-4 border-b border-white/10 overflow-x-auto">
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
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors whitespace-nowrap ${
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
                <div className="grid grid-cols-2 gap-2 mb-3 sm:mb-4">
                  <button
                    onClick={async () => {
                      await handleBackgroundSelect('none');
                    }}
                    className={`p-2 sm:p-3 rounded-lg border-2 transition-all ${
                      selectedBackground === 'none'
                        ? 'border-goldBright bg-goldBright/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="text-center">
                      <div className="w-full h-12 sm:h-16 bg-midnight rounded mb-1 flex items-center justify-center">
                        <span className="text-cloud/50 text-[10px] sm:text-xs">None</span>
                      </div>
                      <p className="text-[10px] sm:text-xs text-cloud">None</p>
                    </div>
                  </button>

                  <button
                    onClick={async () => {
                      await handleBackgroundSelect('blur');
                    }}
                    className={`p-2 sm:p-3 rounded-lg border-2 transition-all ${
                      selectedBackground === 'blur'
                        ? 'border-goldBright bg-goldBright/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="text-center">
                      <div className="w-full h-12 sm:h-16 bg-gradient-to-r from-midnight via-gray-600 to-midnight rounded mb-1 flex items-center justify-center blur-sm">
                        <span className="text-cloud/50 text-[10px] sm:text-xs">Blur</span>
                      </div>
                      <p className="text-[10px] sm:text-xs text-cloud">Blur</p>
                    </div>
                  </button>
                </div>

                {/* Upload Section */}
                <div className="mb-3 sm:mb-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="background-upload"
                    disabled={uploading || !user}
                  />
                  <label
                    htmlFor="background-upload"
                    className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-techBlue/20 hover:bg-techBlue/30 border border-techBlue/40 rounded-lg cursor-pointer transition-all text-xs sm:text-sm text-cloud ${
                      uploading || !user ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
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
                  <div className="mb-3 sm:mb-4">
                    <h3 className="text-[10px] sm:text-xs font-semibold text-cloud mb-2 sm:mb-3">My Uploads</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-4">
                      {userMedia.map((file) => {
                        return (
                        <button
                          key={file.id}
                          onClick={() => handleBackgroundSelect(file)}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                            selectedBackground === file.id
                              ? 'border-goldBright ring-2 ring-goldBright'
                              : 'border-white/10 hover:border-white/30'
                          }`}
                        >
                          <div className="aspect-video bg-midnight relative">
                            <img
                              src={file.thumbnail || file.url}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={(e) => handleDeleteFile(file.id, e)}
                              className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
                              title="Delete background"
                            >
                              <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <p className="text-[10px] sm:text-xs text-cloud text-center p-0.5 sm:p-1 truncate">{file.name}</p>
                        </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Default Backgrounds */}
                <div>
                  <h3 className="text-[10px] sm:text-xs font-semibold text-cloud mb-2 sm:mb-3">Default Backgrounds</h3>
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-goldBright"></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-4">
                      {allBackgrounds.map((bg) => {
                        return (
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
                          <p className="text-[10px] sm:text-xs text-cloud text-center p-0.5 sm:p-1 truncate">{bg.name}</p>
                        </button>
                        );
                      })}
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
