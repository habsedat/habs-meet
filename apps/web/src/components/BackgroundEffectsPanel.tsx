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
  const [isChangingBackground, setIsChangingBackground] = useState(false); // Prevent multiple simultaneous changes
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null); // Show loading message to user
  const userSelectionRef = useRef<'none' | 'blur' | string | null>(null); // Track user's active selection to prevent override
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

  // Match savedBackground to the actual media ID (only on initial load, not when user is actively selecting)
  useEffect(() => {
    // ✅ CRITICAL FIX: Never override user's active selection
    if (isChangingBackground || userSelectionRef.current !== null) {
      return;
    }
    
    // Only update selection if it's not already set to a valid value
    // This prevents overriding user's current selection
    if (selectedBackground && selectedBackground !== 'none' && selectedBackground !== 'blur') {
      // Check if current selection is still valid
      const isUserMedia = userMedia.some(m => m.id === selectedBackground);
      const isDefaultMedia = backgrounds.some(m => m.id === selectedBackground);
      if (isUserMedia || isDefaultMedia) {
        // Current selection is valid, don't override
        return;
      }
    }
    
    if (savedBackground && (backgrounds.length > 0 || userMedia.length > 0)) {
      if (savedBackground.type === 'none') {
        setSelectedBackground('none');
      } else if (savedBackground.type === 'blur') {
        setSelectedBackground('blur');
      } else if (savedBackground.type === 'image' && savedBackground.url) {
        // Find matching media by URL (use more flexible matching)
        const normalizeUrl = (url: string) => {
          // Remove query parameters and fragments for comparison
          try {
            const urlObj = new URL(url);
            return urlObj.origin + urlObj.pathname;
          } catch {
            return url.split('?')[0].split('#')[0];
          }
        };
        
        const savedUrlNormalized = normalizeUrl(savedBackground.url);
        const matchingUserMedia = userMedia.find(m => {
          const mediaUrlNormalized = normalizeUrl(m.url);
          return mediaUrlNormalized === savedUrlNormalized || m.url === savedBackground.url;
        });
        const matchingDefaultMedia = backgrounds.find(m => {
          const mediaUrlNormalized = normalizeUrl(m.url);
          return mediaUrlNormalized === savedUrlNormalized || m.url === savedBackground.url;
        });
        
        if (matchingUserMedia) {
          setSelectedBackground(matchingUserMedia.id);
        } else if (matchingDefaultMedia) {
          setSelectedBackground(matchingDefaultMedia.id);
        }
      } else if (savedBackground.type === 'video' && savedBackground.url) {
        // For videos, also match by URL
        const normalizeUrl = (url: string) => {
          try {
            const urlObj = new URL(url);
            return urlObj.origin + urlObj.pathname;
          } catch {
            return url.split('?')[0].split('#')[0];
          }
        };
        
        const savedUrlNormalized = normalizeUrl(savedBackground.url);
        const matchingUserMedia = userMedia.find(m => {
          const mediaUrlNormalized = normalizeUrl(m.url);
          return (mediaUrlNormalized === savedUrlNormalized || m.url === savedBackground.url) && m.type === 'video';
        });
        const matchingDefaultMedia = backgrounds.find(m => {
          const mediaUrlNormalized = normalizeUrl(m.url);
          return (mediaUrlNormalized === savedUrlNormalized || m.url === savedBackground.url) && m.type === 'video';
        });
        
        if (matchingUserMedia) {
          setSelectedBackground(matchingUserMedia.id);
        } else if (matchingDefaultMedia) {
          setSelectedBackground(matchingDefaultMedia.id);
        }
      }
    } else if (!savedBackground) {
      // ✅ CRITICAL FIX: Only default to 'none' if user hasn't made a selection
      // Never override user's active selection
      if (userSelectionRef.current === null && (!selectedBackground || selectedBackground === 'none')) {
        setSelectedBackground('none');
      }
    }
  }, [savedBackground, backgrounds, userMedia, isChangingBackground, selectedBackground]);

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
      // Show both images and videos
      const mediaFiles = files.filter(file => file.type === 'image' || file.type === 'video');
      setUserMedia(mediaFiles);
    } catch (error) {
      console.error('Error loading user media:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file is an image or video
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
      toast.error('Only image and video files are allowed for backgrounds');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // For images, validate landscape orientation
    if (isImage) {
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
    }
    
    // For videos, duration validation is handled by fileStorageService (max 2 minutes)

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
    // ⛔️ CRITICAL FIX: If a change is already in progress, ignore extra clicks
    // This prevents multiple overlapping operations that cause freezes and wrong images
    if (isChangingBackground) {
      console.log('[BG] Change already in progress, ignoring extra click');
      return;
    }

    // ✅ CRITICAL FIX: Set flag and user selection ref IMMEDIATELY to prevent useEffect override
    const selectedId = bg === 'none' ? 'none' : bg === 'blur' ? 'blur' : bg.id;
    userSelectionRef.current = selectedId; // Track user's selection immediately
    setIsChangingBackground(true);
    
    // ✅ CRITICAL FIX: Set selection state IMMEDIATELY and synchronously (like Zoom)
    // Update state immediately so UI shows selection right away
    setSelectedBackground(selectedId);
    
    // Store previous selection to revert on error
    const previousSelection = selectedBackground;
    
    // ✅ CRITICAL: Determine the exact background to apply BEFORE setting state
    let bgType: 'none' | 'blur' | 'image' | 'video' = 'none';
    let bgUrl: string | undefined = undefined;
    let bgId: 'none' | 'blur' | string = 'none';
    
    if (bg === 'none') {
      bgType = 'none';
      bgId = 'none';
    } else if (bg === 'blur') {
      bgType = 'blur';
      bgId = 'blur';
    } else {
      // ✅ CRITICAL: Validate and extract URL immediately
      bgId = bg.id;
      bgUrl = bg.url;
      
      if (!bgUrl || bgUrl.trim() === '') {
        console.error('[BG] Invalid background URL:', bg);
        toast.error('Invalid background URL');
        setIsChangingBackground(false);
        userSelectionRef.current = null;
        setSelectedBackground(previousSelection || 'none');
        return;
      }
        
      if (bg.type === 'image') {
        bgType = 'image';
      } else if (bg.type === 'video') {
        bgType = 'video';
        // Validate video URL
        if (bgUrl.includes('example.com')) {
          toast.error('Video URL is not available. Please configure a valid video URL.');
          setIsChangingBackground(false);
          userSelectionRef.current = null;
          setSelectedBackground(previousSelection || 'none');
          return;
        }
      } else {
        console.error('[BG] Unknown background type:', bg);
        setIsChangingBackground(false);
        userSelectionRef.current = null;
        setSelectedBackground(previousSelection || 'none');
        return;
      }
    }
    
    try {
      // ✅ CRITICAL: Apply background IMMEDIATELY with the exact type and URL we determined
      console.log('[BG] Applying background IMMEDIATELY:', { type: bgType, url: bgUrl, id: bgId });
      
      // ✅ CRITICAL: Show loading feedback to user
      if (bgType === 'image' || bgType === 'video') {
        setLoadingMessage('Loading background...');
      } else if (bgType === 'blur') {
        setLoadingMessage('Applying blur...');
      } else {
        setLoadingMessage('Removing background...');
      }
      
      // ✅ CRITICAL FIX: Apply background immediately - no delays (like Zoom)
      await onBackgroundChange(bgType, bgUrl);
      
      // ✅ CRITICAL: Clear loading message on success
      setLoadingMessage(null);
      
      // ✅ CRITICAL FIX: Verify this is still the selected background after application
      // Only confirm if this is still the current selection (user didn't click another)
      if (userSelectionRef.current === bgId) {
        // Double-check the selection state matches
        setSelectedBackground(bgId);
        console.log('[BG] ✅ Background applied successfully and verified:', bgId, 'URL:', bgUrl);
      } else {
        console.log('[BG] ⚠️ Selection changed during application - user clicked different image. This ID:', bgId, 'Current selection:', userSelectionRef.current);
        // Update to the new selection if user clicked another
        if (userSelectionRef.current) {
          setSelectedBackground(userSelectionRef.current);
        }
      }
    } catch (error: any) {
      console.error('[BG] Error changing background:', error);
      
      // ✅ CRITICAL: Clear loading message and show error
      const errorMsg = error?.message || '';
      let userErrorMessage: string | null = null;
      
      if (!errorMsg.includes('Cancelled') && 
          !errorMsg.includes('aborted') &&
          !errorMsg.includes('Track ended') &&
          !errorMsg.includes('not ready')) {
        // Provide user-friendly error message
        if (errorMsg.includes('timeout') || errorMsg.includes('load')) {
          userErrorMessage = 'Background failed to load. Please check your internet connection and try again.';
        } else if (errorMsg.includes('processor') || errorMsg.includes('Failed to apply')) {
          userErrorMessage = 'Failed to apply background. Please try again or select a different image.';
        } else if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
          userErrorMessage = 'Network error. Please check your connection and try again.';
        } else {
          userErrorMessage = 'Failed to change background: ' + errorMsg;
        }
      }
      
      // Show error message to user
      if (userErrorMessage) {
        setLoadingMessage(userErrorMessage);
        // Clear error message after 5 seconds
        const errorMsgToClear = userErrorMessage;
        setTimeout(() => {
          setLoadingMessage((current) => {
            // Only clear if it's still the same error message
            return current === errorMsgToClear ? null : current;
          });
        }, 5000);
      } else {
        setLoadingMessage(null);
      }
      // Only revert if this is still the current selection
      if (userSelectionRef.current === bgId) {
        setSelectedBackground(previousSelection || 'none');
        userSelectionRef.current = previousSelection || 'none';
      }
    } finally {
      // ✅ CRITICAL FIX: Clear flags immediately if this is still the current operation
      if (userSelectionRef.current === bgId || userSelectionRef.current === null) {
        if (userSelectionRef.current === bgId) {
          userSelectionRef.current = null;
        }
        setIsChangingBackground(false);
        // Clear loading message if operation completed (not an error - error message stays for 5 seconds)
        if (!loadingMessage || (!loadingMessage.includes('error') && !loadingMessage.includes('failed') && !loadingMessage.includes('Failed'))) {
          setLoadingMessage(null);
        }
      }
    }
  };

  // Use only admin-uploaded backgrounds from Firestore
  // No hardcoded defaults - all backgrounds come from admin uploads
  const allBackgrounds = backgrounds;

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
        <div className="w-full aspect-video max-h-[280px] sm:max-h-[360px] bg-black flex-shrink-0 overflow-hidden sm:rounded-lg border-2 border-white/20 m-2 sm:m-4 relative">
          <div ref={videoPreviewRef} className="w-full h-full" />
          {!videoTrack && (
            <div className="absolute inset-0 flex items-center justify-center text-cloud/50 text-sm">
              Camera not available
            </div>
          )}
          {/* ✅ CRITICAL: Show loading/error message overlay */}
          {loadingMessage && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
              <div className="text-center px-4">
                {loadingMessage.includes('error') || loadingMessage.includes('failed') || loadingMessage.includes('Failed') ? (
                  <div className="text-red-400">
                    <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium">{loadingMessage}</p>
                  </div>
                ) : (
                  <div className="text-cloud">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-goldBright mx-auto mb-2"></div>
                    <p className="text-sm font-medium">{loadingMessage}</p>
                  </div>
                )}
              </div>
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleBackgroundSelect('none').catch(console.error);
                    }}
                    disabled={isChangingBackground}
                    className={`p-2 sm:p-3 rounded-lg border-2 transition-all ${
                      selectedBackground === 'none'
                        ? 'border-goldBright bg-goldBright/20'
                        : 'border-white/10 hover:border-white/30'
                    } ${isChangingBackground ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    <div className="text-center">
                      <div className="w-full h-12 sm:h-16 bg-midnight rounded mb-1 flex items-center justify-center">
                        <span className="text-cloud/50 text-[10px] sm:text-xs">None</span>
                      </div>
                      <p className="text-[10px] sm:text-xs text-cloud">None</p>
                    </div>
                  </button>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleBackgroundSelect('blur').catch(console.error);
                    }}
                    disabled={isChangingBackground}
                    className={`p-2 sm:p-3 rounded-lg border-2 transition-all ${
                      selectedBackground === 'blur'
                        ? 'border-goldBright bg-goldBright/20'
                        : 'border-white/10 hover:border-white/30'
                    } ${isChangingBackground ? 'opacity-50 cursor-wait' : ''}`}
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
                    accept="image/*,video/*"
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
                  <div className="mb-3 sm:mb-4">
                    <h3 className="text-[10px] sm:text-xs font-semibold text-cloud mb-2 sm:mb-3">My Uploads</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-4">
                      {userMedia.map((file) => {
                        return (
                        <button
                          key={file.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleBackgroundSelect(file).catch(console.error);
                          }}
                          disabled={isChangingBackground}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                            selectedBackground === file.id
                              ? 'border-goldBright ring-2 ring-goldBright'
                              : 'border-white/10 hover:border-white/30'
                          } ${isChangingBackground ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          <div className="aspect-video bg-midnight relative">
                            <img
                              src={file.thumbnail || file.url}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                            {file.type === 'video' && (
                              <div className="absolute bottom-1 left-1">
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                </svg>
                              </div>
                            )}
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

                {/* Admin-Uploaded Backgrounds */}
                <div className="mb-3 sm:mb-4">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-cloud mb-2 sm:mb-3">Backgrounds</h3>
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-goldBright"></div>
                    </div>
                  ) : allBackgrounds.length === 0 ? (
                    <div className="text-center py-6 text-cloud/50 text-xs">
                      <p>No backgrounds available</p>
                      <p className="text-[10px] mt-1">Admins can upload backgrounds in the Admin panel</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-4">
                      {allBackgrounds.map((bg) => {
                        return (
                        <button
                          key={bg.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleBackgroundSelect(bg).catch(console.error);
                          }}
                          disabled={isChangingBackground}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                            selectedBackground === bg.id
                              ? 'border-goldBright ring-2 ring-goldBright'
                              : 'border-white/10 hover:border-white/30'
                          } ${isChangingBackground ? 'opacity-50 cursor-wait' : ''}`}
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
