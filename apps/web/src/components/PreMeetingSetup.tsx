import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../contexts/LiveKitContext';
import { fileStorageService, UploadedFile, FileUploadProgress } from '../lib/fileStorageService';
import { defaultMediaService, DefaultMedia } from '../lib/defaultMediaService';
import { backgroundEngine } from '../video/BackgroundEngine';
import { LocalVideoTrack } from 'livekit-client';
import toast from 'react-hot-toast';

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface VirtualBackground {
  id: string;
  name: string;
  thumbnail: string;
  type: 'image' | 'blur' | 'none' | 'video';
  hasVideo?: boolean;
}

interface Avatar {
  id: string;
  name: string;
  thumbnail: string;
  type: 'human' | 'animal' | 'character';
}

interface VideoFilter {
  id: string;
  name: string;
  thumbnail: string;
  type: 'color' | 'style' | 'effect';
}

interface StudioEffect {
  id: string;
  name: string;
  thumbnail: string;
  type: 'lighting' | 'frame' | 'overlay';
}

const PreMeetingSetup: React.FC<{ roomId: string; roomTitle: string }> = ({ roomId, roomTitle }) => {
  const { user, userProfile } = useAuth();
  const { connect } = useLiveKit();
  const navigate = useNavigate();
  
  // Device states
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [selectedMicrophone, setSelectedMicrophone] = useState<string>('');
  
  // Media states
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  // Background effects
  const [backgroundEffectsEnabled, setBackgroundEffectsEnabled] = useState<boolean>(false);
  const [selectedBackground, setSelectedBackground] = useState<string>('none');
  const [lastSelectedBackground, setLastSelectedBackground] = useState<string>('none');
  
  // Load saved background preferences from localStorage
  const loadBackgroundPreferences = () => {
    try {
      const savedBackground = localStorage.getItem('habs-meet-background-preference');
      const savedToggleState = localStorage.getItem('habs-meet-background-toggle');
      
      if (savedBackground && savedBackground !== 'none') {
        setLastSelectedBackground(savedBackground);
        setSelectedBackground(savedBackground);
        setBackgroundEffectsEnabled(savedToggleState === 'true');
        console.log('[BG] Loaded saved background preference:', savedBackground);
        return savedBackground;
      }
    } catch (error) {
      console.error('[BG] Error loading background preferences:', error);
    }
    return null;
  };

  // Save background preferences to localStorage
  const saveBackgroundPreferences = (backgroundId: string, toggleState: boolean) => {
    try {
      localStorage.setItem('habs-meet-background-preference', backgroundId);
      localStorage.setItem('habs-meet-background-toggle', toggleState.toString());
      console.log('[BG] Saved background preference:', backgroundId, 'toggle:', toggleState);
    } catch (error) {
      console.error('[BG] Error saving background preferences:', error);
    }
  };
  
  const [selectedAvatar, setSelectedAvatar] = useState<string>('none');
  const [selectedFilter, setSelectedFilter] = useState<string>('none');
  const [selectedEffect, setSelectedEffect] = useState<string>('none');
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'camera' | 'backgrounds' | 'avatars' | 'filters' | 'effects'>('backgrounds');
  const [hasGreenScreen, setHasGreenScreen] = useState(false);
  const [customBackgrounds, setCustomBackgrounds] = useState<VirtualBackground[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [defaultMedia, setDefaultMedia] = useState<DefaultMedia[]>([]);
  const [backgroundEngineStatus, setBackgroundEngineStatus] = useState<any>(null);
  
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const modalVideoRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // LiveKit track refs for multi-attach
  const camTrackRef = useRef<LocalVideoTrack | null>(null);
  const mainVideoElRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoElRef = useRef<HTMLVideoElement | null>(null);
  
  // Virtual background options
  const virtualBackgrounds: VirtualBackground[] = [
    { id: 'none', name: 'None', thumbnail: '/api/placeholder/100/60', type: 'none' },
    { id: 'blur', name: 'Blur', thumbnail: '/api/placeholder/100/60', type: 'blur' },
  ];

  // Avatar options
  const avatars: Avatar[] = [
    { id: 'none', name: 'None', thumbnail: '/api/placeholder/100/60', type: 'human' },
    { id: 'avatar1', name: 'Professional', thumbnail: '/api/placeholder/100/60', type: 'human' },
    { id: 'avatar2', name: 'Casual', thumbnail: '/api/placeholder/100/60', type: 'human' },
    { id: 'avatar3', name: 'Cat', thumbnail: '/api/placeholder/100/60', type: 'animal' },
    { id: 'avatar4', name: 'Robot', thumbnail: '/api/placeholder/100/60', type: 'character' },
  ];

  // Video filter options
  const videoFilters: VideoFilter[] = [
    { id: 'none', name: 'None', thumbnail: '/api/placeholder/100/60', type: 'color' },
    { id: 'warm', name: 'Warm', thumbnail: '/api/placeholder/100/60', type: 'color' },
    { id: 'cool', name: 'Cool', thumbnail: '/api/placeholder/100/60', type: 'color' },
    { id: 'vintage', name: 'Vintage', thumbnail: '/api/placeholder/100/60', type: 'style' },
    { id: 'black-white', name: 'Black & White', thumbnail: '/api/placeholder/100/60', type: 'style' },
  ];

  // Studio effect options
  const studioEffects: StudioEffect[] = [
    { id: 'none', name: 'None', thumbnail: '/api/placeholder/100/60', type: 'lighting' },
    { id: 'soft-light', name: 'Soft Light', thumbnail: '/api/placeholder/100/60', type: 'lighting' },
    { id: 'dramatic', name: 'Dramatic', thumbnail: '/api/placeholder/100/60', type: 'lighting' },
    { id: 'frame1', name: 'Frame 1', thumbnail: '/api/placeholder/100/60', type: 'frame' },
    { id: 'frame2', name: 'Frame 2', thumbnail: '/api/placeholder/100/60', type: 'frame' },
  ];

  // Get available devices and auto-start camera
  useEffect(() => {
    const initializeDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videoDevices = devices
          .filter(device => device.kind === 'videoinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${device.deviceId.slice(0, 8)}`
          }));
        
        const audioDevices = devices
          .filter(device => device.kind === 'audioinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`
          }));
        
        setCameras(videoDevices);
        setMicrophones(audioDevices);
        
        // Set default devices
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
        if (audioDevices.length > 0) {
          setSelectedMicrophone(audioDevices[0].deviceId);
        }

        // Auto-start camera preview
        if (videoDevices.length > 0) {
          await startCameraPreview();
        }
      } catch (error) {
        console.error('Error getting devices:', error);
        toast.error('Failed to access camera and microphone');
      }
    };

    const loadUploadedFiles = async () => {
      if (user) {
        try {
          const files = await fileStorageService.getUserFiles(user.uid);
          setUploadedFiles(files);
          
          // Convert uploaded files to virtual backgrounds
          const backgrounds = files
            .filter(file => file.type === 'image' || file.type === 'video')
            .map(file => ({
              id: file.id,
              name: file.name,
              thumbnail: file.thumbnail,
              type: file.type === 'video' ? 'video' as const : 'image' as const,
              hasVideo: file.type === 'video'
            }));
          
          setCustomBackgrounds(backgrounds);
        } catch (error) {
          console.error('Error loading uploaded files:', error);
        }
      }
    };

    const loadDefaultMedia = async () => {
      try {
        const media = await defaultMediaService.getDefaultMedia('background');
        setDefaultMedia(media);
      } catch (error) {
        console.error('Error loading default media:', error);
      }
    };

    initializeDevices();
    loadUploadedFiles();
    loadDefaultMedia();

    // Cleanup function
    return () => {
      // Cleanup will be handled by the background engine cleanup
    };
  }, [user]);

  // Load saved background preferences when component mounts
  useEffect(() => {
    const savedBackground = loadBackgroundPreferences();
    if (savedBackground && savedBackground !== 'none') {
      // Apply the saved background after a short delay to ensure camera is ready
      setTimeout(() => {
        selectBackground(savedBackground);
      }, 1000);
    }
  }, []);

  // Apply virtual background when selectedBackground changes
  useEffect(() => {
    if (selectedBackground && backgroundEffectsEnabled) {
      selectBackground(selectedBackground);
    }
  }, [selectedBackground, defaultMedia, customBackgrounds, backgroundEffectsEnabled]);


  // Update background engine status
  useEffect(() => {
    setBackgroundEngineStatus(backgroundEffectsEnabled ? 'enabled' : 'disabled');
  }, [backgroundEffectsEnabled]);

  // Cleanup background engine on unmount
  useEffect(() => {
    return () => {
      if (camTrackRef.current && mainVideoElRef.current) {
        camTrackRef.current.detach(mainVideoElRef.current);
      }
      if (camTrackRef.current && modalVideoElRef.current) {
        camTrackRef.current.detach(modalVideoElRef.current);
      }
    };
  }, []);

  // Request camera permission
  const requestCameraPermission = async () => {
    try {
      console.log('Requesting camera permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop()); // Stop the test stream
      toast.success('Camera permission granted! Please refresh the page.');
      window.location.reload();
    } catch (error: any) {
      console.error('Camera permission denied:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('Camera permission denied. Please click "Allow" when prompted and refresh the page.');
      } else {
        toast.error('Failed to request camera permission: ' + error.message);
      }
    }
  };

  // Start camera preview using LiveKit track processors
  const startCameraPreview = async () => {
    try {
      console.log('Requesting camera access...');
      
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      console.log('Device tier: gpu');
      
      // Create LocalVideoTrack for LiveKit
      const camTrack = new LocalVideoTrack(stream.getVideoTracks()[0]);
      camTrackRef.current = camTrack;
      
      // Initialize background engine with the track
      await backgroundEngine.init(camTrack);
      
      // Default to no background effects (clear camera)
      await backgroundEngine.setNone();
      setSelectedBackground('none');
      setBackgroundEffectsEnabled(false);
      
      if (videoRef.current) {
        // MAIN PREVIEW: use the track's own element
        const mainEl = camTrack.attach() as HTMLVideoElement; // creates <video> bound to processed frames
        mainEl.muted = true;
        mainEl.playsInline = true;
        mainEl.autoplay = true;
        mainEl.style.width = '100%';
        mainEl.style.height = '100%';
        mainEl.style.objectFit = 'cover';
        
        // remember it so we can detach later
        mainVideoElRef.current = mainEl;
        
        // place it in your main preview container
        videoRef.current.replaceChildren(mainEl);
        
        console.log('✅ Processed video track attached to preview');
      }
      
      setIsVideoEnabled(true);
      
    } catch (error: any) {
      console.error('Camera access error:', error);
      
      if (error.name === 'NotAllowedError') {
        toast.error('Camera access denied. Please allow camera permissions and refresh the page.');
      } else if (error.name === 'NotFoundError') {
        toast.error('No camera found. Please connect a camera and refresh the page.');
      } else if (error.name === 'NotReadableError') {
        toast.error('Camera is being used by another application. Please close other apps and refresh.');
      } else if (error.name === 'OverconstrainedError') {
        toast.error('Camera settings not supported. Trying with basic settings...');
        try {
          const basicStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = basicStream;
          setIsVideoEnabled(true);
        } catch (basicError) {
          toast.error('Failed to start camera with basic settings');
        }
            } else {
        toast.error('Failed to access camera: ' + error.message);
      }
      
      setIsVideoEnabled(false);
    }
  };

  const startModalCameraPreview = async () => {
    try {
      if (!modalVideoRef.current || !camTrackRef.current) {
        console.log('Modal camera: No ref or track available');
        return;
      }

      // Clear the modal container
      modalVideoRef.current.innerHTML = '';
      
      // Create a fresh element for the MODAL
      const modalEl = document.createElement('video');
      modalEl.muted = true;
      modalEl.playsInline = true;
      modalEl.autoplay = true;
      modalEl.style.width = '100%';
      modalEl.style.height = '100%';
      modalEl.style.objectFit = 'cover';

      // Attach the SAME processed LocalVideoTrack
      camTrackRef.current.attach(modalEl);

      // keep a ref to detach later
      modalVideoElRef.current = modalEl;

      // put it into the modal's preview box
      modalVideoRef.current.replaceChildren(modalEl);
      
      console.log('✅ Modal camera started - using same processed track');
    } catch (error) {
      console.error('Error starting modal camera:', error);
    }
  };

  // Stop camera preview
  const stopCameraPreview = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.innerHTML = '';
    }
  };

  const stopModalCameraPreview = () => {
    // Detach modal element from track
    if (camTrackRef.current && modalVideoElRef.current) {
      camTrackRef.current.detach(modalVideoElRef.current);
      modalVideoElRef.current.srcObject = null;
      modalVideoElRef.current = null;
    }
    
    // Clear modal container
    if (modalVideoRef.current) {
      modalVideoRef.current.innerHTML = '';
    }
  };

  // Handle camera device change - sync both previews
  useEffect(() => {
    if (selectedCamera && isVideoEnabled) {
      startCameraPreview();
      // Also update modal camera if modal is open
      if (showBackgroundModal) {
        startModalCameraPreview();
      }
    }
  }, [selectedCamera]);

  // Handle video toggle - sync both previews
  useEffect(() => {
    if (showBackgroundModal) {
      if (isVideoEnabled) {
        startModalCameraPreview();
      } else {
        stopModalCameraPreview();
      }
    }
  }, [isVideoEnabled, showBackgroundModal]);

  const handleStartMeeting = async () => {
    if (!user || !userProfile) {
      toast.error('Please log in to start the meeting');
      return;
    }

    setIsLoading(true);
    
    try {
      // Stop preview stream
      stopCameraPreview();
      
      // Get the final media stream with selected devices
      const constraints: MediaStreamConstraints = {
        video: isVideoEnabled ? {
          deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } : false,
        audio: isAudioEnabled ? {
          deviceId: selectedMicrophone ? { exact: selectedMicrophone } : undefined
        } : false
      };

      // Test the stream before joining
      const testStream = await navigator.mediaDevices.getUserMedia(constraints);
      testStream.getTracks().forEach(track => track.stop());

      // Generate token and connect to LiveKit
      const { getMeetingToken } = await import('../lib/livekitConfig');
      const tokenResponse = await getMeetingToken(roomId, userProfile.displayName || user.email?.split('@')[0] || 'User', true);
      
      // Connect to the room
      await connect(tokenResponse.token);
      
      toast.success('Starting meeting...');
      navigate(`/room/${roomId}`);
      
    } catch (error: any) {
      console.error('Error starting meeting:', error);
      toast.error('Failed to start meeting: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    stopCameraPreview();
    stopModalCameraPreview();
    navigate('/home');
  };

  const handleModalClose = () => {
    stopModalCameraPreview();
    setShowBackgroundModal(false);
    
    // Clean up any background elements in modal
    if (modalVideoRef.current?.parentElement) {
      const existingBgVideo = modalVideoRef.current.parentElement.querySelector('.background-video');
      const existingBgImage = modalVideoRef.current.parentElement.querySelector('.background-image');
      const existingCanvas = modalVideoRef.current.parentElement.querySelector('.virtual-bg-canvas');
      if (existingBgVideo) existingBgVideo.remove();
      if (existingBgImage) existingBgImage.remove();
      if (existingCanvas) existingCanvas.remove();
      
      // Restore video visibility
      if (modalVideoRef.current) {
        modalVideoRef.current.style.display = '';
      }
    }
  };

  const toggleVideo = () => {
    const newVideoState = !isVideoEnabled;
    setIsVideoEnabled(newVideoState);
    
    if (newVideoState) {
      startCameraPreview();
      // Also start modal camera if modal is open
      if (showBackgroundModal) {
        startModalCameraPreview();
      }
    } else {
      stopCameraPreview();
      // Also stop modal camera if modal is open
      if (showBackgroundModal) {
        stopModalCameraPreview();
      }
    }
  };

  const toggleAudio = () => {
    setIsAudioEnabled(!isAudioEnabled);
  };

  const openBackgroundModal = async () => {
    setShowBackgroundModal(true);
    // Start modal camera preview when modal opens if video is enabled
    if (isVideoEnabled) {
      await startModalCameraPreview();
    }
  };

  const selectBackground = async (backgroundId: string) => {
    setSelectedBackground(backgroundId);

    try {
      // Check if background engine is properly initialized
      if (!backgroundEngine || !streamRef.current) {
        console.warn('[BG] Background engine or stream not ready');
        toast.error('Camera not ready for background effects');
        return;
      }

      if (backgroundId === 'none') {
        await backgroundEngine.setNone();
        // When selecting 'none', turn off background effects
        setBackgroundEffectsEnabled(false);
        // Save preference (none = disabled)
        saveBackgroundPreferences('none', false);
      } else {
        // For any background (blur, image, video), turn on background effects
        setBackgroundEffectsEnabled(true);
        // Keep track of the last selected background (for when toggle is turned back on)
        setLastSelectedBackground(backgroundId);
        // Save preference (background + enabled)
        saveBackgroundPreferences(backgroundId, true);
        
        if (backgroundId === 'blur') {
          await backgroundEngine.setBlur(8);
        } else {
          // Find the media
          const media = [...defaultMedia, ...customBackgrounds].find(
            (m) => m.id === backgroundId || `default-${m.id}` === backgroundId
          );
          
          if (media) {
            const mediaUrl = 'url' in media ? media.url : media.thumbnail;
            console.log('[BG] Applying background:', mediaUrl);
            
            if (media.type === 'image') {
              await backgroundEngine.setImage(mediaUrl);
            } else if (media.type === 'video') {
              await backgroundEngine.setVideo(mediaUrl);
            }
          }
        }
      }
      
      console.log('[BG] Background applied successfully:', backgroundId);
      
      // Update modal preview to show the same background effect
      if (showBackgroundModal && isVideoEnabled) {
        setTimeout(() => {
          startModalCameraPreview();
        }, 100); // Small delay to ensure the main preview is updated
      }
    } catch (error) {
      console.error('[BG] Error applying background:', error);
      toast.error('Failed to apply background effect');
      // Don't log success message if there was an error
      return;
    }
  };


  const handleDeleteFile = async (fileId: string) => {
    if (!user) return;

    try {
      await fileStorageService.deleteFile(fileId, user.uid);
      
      // Remove from uploaded files
      setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
      
      // Remove from custom backgrounds if it was a background
      setCustomBackgrounds(prev => prev.filter(bg => bg.id !== fileId));
      
      // If this was the selected background, reset to none
      if (selectedBackground === fileId) {
        setSelectedBackground('none');
      }
      
      toast.success('File deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting file:', error);
      // Check if it's a "not found" error - in that case, just remove from UI
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        // Remove from UI even if file doesn't exist in storage
        setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
        setCustomBackgrounds(prev => prev.filter(bg => bg.id !== fileId));
        if (selectedBackground === fileId) {
          setSelectedBackground('none');
        }
        toast.success('File removed from list!');
      } else {
        toast.error(`Failed to delete file: ${error.message}`);
      }
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
      const uploadedFile = await fileStorageService.uploadFile(
        file,
        user.uid,
        (progress) => setUploadProgress(progress)
      );

      // Add to uploaded files
      setUploadedFiles(prev => [uploadedFile, ...prev]);

      // If it's an image or video, add to custom backgrounds
      if (uploadedFile.type === 'image' || uploadedFile.type === 'video') {
        const newBackground: VirtualBackground = {
          id: uploadedFile.id,
          name: uploadedFile.name,
          thumbnail: uploadedFile.thumbnail,
          type: uploadedFile.type === 'video' ? 'video' : 'image',
          hasVideo: uploadedFile.type === 'video'
        };
        
        setCustomBackgrounds(prev => [newBackground, ...prev]);
        setSelectedBackground(newBackground.id);
      }

      toast.success(`${file.name} uploaded successfully!`);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error(`Failed to upload ${file.name}: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      // Reset file input
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight via-techBlue to-violetDeep flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-white/20">
        {/* Header with close button */}
        <div className="bg-white/5 border-b border-white/20 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-goldBright to-yellow-400 rounded flex items-center justify-center">
              <svg className="w-5 h-5 text-midnight" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/>
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-cloud">{roomTitle}</h1>
          </div>
          <button
            onClick={handleClose}
            className="text-cloud/60 hover:text-cloud transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex">
          {/* Video Preview Area */}
          <div className="flex-1 bg-black relative">
            <div className="aspect-video relative overflow-hidden">
              {isVideoEnabled ? (
                <div
                  ref={videoRef}
                  className="w-full h-full relative z-10"
                  style={{
                    backgroundColor: 'transparent'
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                  <div className="text-center text-white">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-600 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                      </svg>
                    </div>
                    <p className="text-lg font-medium">Camera is off</p>
                    <button
                      onClick={requestCameraPermission}
                      className="mt-4 px-6 py-2 bg-goldBright text-black rounded-lg hover:bg-yellow-400 transition-colors font-medium"
                    >
                      Enable Camera
                    </button>
                  </div>
                </div>
              )}
              
              {/* Video Controls Overlay */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-3 z-20">
                <button
                  onClick={toggleAudio}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-all duration-200 border border-white/20 ${
                    isAudioEnabled 
                      ? 'bg-gray-700/90 hover:bg-gray-600/90 text-white backdrop-blur-sm' 
                      : 'bg-red-500/90 hover:bg-red-600/90 text-white backdrop-blur-sm'
                  }`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    {isAudioEnabled ? (
                      <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0A9.972 9.972 0 0119 12a9.972 9.972 0 01-1.929 5.657 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 12a7.971 7.971 0 00-1.343-4.243 1 1 0 010-1.414z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    )}
                  </svg>
                  <span>Audio</span>
                </button>
                
                <button
                  onClick={toggleVideo}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-all duration-200 border border-white/20 ${
                    isVideoEnabled 
                      ? 'bg-gray-700/90 hover:bg-gray-600/90 text-white backdrop-blur-sm' 
                      : 'bg-red-500/90 hover:bg-red-600/90 text-white backdrop-blur-sm'
                  }`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    {isVideoEnabled ? (
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    ) : (
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    )}
                  </svg>
                  <span>Video</span>
                </button>
                
                <button
                  onClick={openBackgroundModal}
                  className="px-4 py-2 rounded-lg bg-gray-700/90 hover:bg-gray-600/90 text-white flex items-center space-x-2 transition-all duration-200 border border-white/20 backdrop-blur-sm"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                  <span>Backgrounds</span>
                </button>
              </div>
            </div>
          </div>

          {/* Control Panel */}
          <div className="w-80 bg-white/5 border-l border-white/20 p-6">
            <div className="space-y-6">
              {/* Device Selection */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-cloud mb-2">Audio Input</label>
                  <select
                    value={selectedMicrophone}
                    onChange={(e) => setSelectedMicrophone(e.target.value)}
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    style={{
                      color: '#F5F5F5',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    {microphones.map((mic) => (
                      <option 
                        key={mic.deviceId} 
                        value={mic.deviceId} 
                        style={{
                          backgroundColor: '#0E0E10',
                          color: '#F5F5F5',
                          padding: '8px'
                        }}
                      >
                        {mic.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-cloud mb-2">Video Input</label>
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                    style={{
                      color: '#F5F5F5',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    {cameras.map((camera) => (
                      <option 
                        key={camera.deviceId} 
                        value={camera.deviceId} 
                        style={{
                          backgroundColor: '#0E0E10',
                          color: '#F5F5F5',
                          padding: '8px'
                        }}
                      >
                        {camera.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <h4 className="font-medium text-cloud">Enable Background Effects</h4>
                    <p className="text-sm text-cloud/70">Use virtual backgrounds, blur, and other effects</p>
                    {backgroundEngineStatus?.error && (
                      <p className="text-sm text-red-400 mt-1">
                        Background effects unavailable: {backgroundEngineStatus.error}
                      </p>
                    )}
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={backgroundEffectsEnabled}
                      onChange={async (e) => {
                        const enabled = e.target.checked;
                        setBackgroundEffectsEnabled(enabled);
                        
                        if (enabled) {
                          // Background effects enabled - apply last selected background
                          if (lastSelectedBackground && lastSelectedBackground !== 'none') {
                            await selectBackground(lastSelectedBackground);
                          } else {
                            // If no background was previously selected, default to blur
                            await selectBackground('blur');
                          }
                        } else {
                          // Background effects disabled - show original video
                          await backgroundEngine.setNone();
                          setSelectedBackground('none');
                          // Save preference (disabled)
                          saveBackgroundPreferences('none', false);
                        }
                      }}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-goldBright/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-goldBright"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <h4 className="font-medium text-cloud">Always show this preview</h4>
                    <p className="text-sm text-cloud/70">Show this setup screen before joining meetings</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-goldBright/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-goldBright"></div>
                  </label>
                </div>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStartMeeting}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-goldBright to-yellow-400 hover:from-yellow-400 hover:to-goldBright text-midnight font-bold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-midnight mr-2"></div>
                    Starting...
                  </div>
                ) : (
                  'Start'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Background & Effects Modal */}
      {showBackgroundModal && (
        <div className="fixed inset-0 bg-transparent flex items-end justify-end z-50 p-4">
          <div className="bg-midnight/95 backdrop-blur-lg rounded-2xl w-full max-w-2xl h-[90vh] border border-white/20 overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="bg-midnight/80 border-b border-white/30 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-goldBright to-yellow-400 rounded flex items-center justify-center">
                  <svg className="w-5 h-5 text-midnight" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/>
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-cloud">Habs Meet</h2>
              </div>
              <button
                onClick={handleModalClose}
                className="text-cloud/60 hover:text-cloud transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Fixed Video Preview Section */}
            <div className="p-4 flex-shrink-0">
              <h3 className="text-xl font-bold text-cloud mb-4">Background & effects</h3>
              
              {/* Video Preview */}
              <div className="mb-4">
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video max-h-48">
                  {isVideoEnabled ? (
                    <div
                      ref={modalVideoRef}
                      className="w-full h-full relative z-10"
                      style={{
                        backgroundColor: 'transparent'
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <svg className="w-12 h-12 text-cloud/50 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                        </svg>
                        <p className="text-cloud/50 text-sm">Camera is off</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <div className="w-6 h-6 bg-black/50 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex space-x-6 border-b border-white/20">
                {[
                  { id: 'camera', label: 'Camera' },
                  { id: 'backgrounds', label: 'Virtual backgrounds' },
                  { id: 'avatars', label: 'Avatars' },
                  { id: 'filters', label: 'Video filters' },
                  { id: 'effects', label: 'Studio effects' }
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

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-4 pt-0">

              {/* Tab Content */}
              <div className="min-h-[200px]">
                {activeTab === 'camera' && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-cloud">Camera Settings</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-cloud mb-2">Video Input</label>
                        <select
                          value={selectedCamera}
                          onChange={(e) => setSelectedCamera(e.target.value)}
                          className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright"
                          style={{
                            color: '#F5F5F5',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          {cameras.map((camera) => (
                            <option 
                              key={camera.deviceId} 
                              value={camera.deviceId} 
                              style={{
                                backgroundColor: '#0E0E10',
                                color: '#F5F5F5',
                                padding: '8px'
                              }}
                            >
                              {camera.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={toggleVideo}
                          className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                            isVideoEnabled 
                              ? 'bg-goldBright text-midnight hover:bg-yellow-400' 
                              : 'bg-red-500 text-white hover:bg-red-600'
                          }`}
                        >
                          {isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'backgrounds' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-semibold text-cloud">Virtual backgrounds</h4>
                      <div className="flex items-center space-x-2">
                        <div className="relative">
                          <input
                            type="file"
                            accept="image/*,video/*,audio/*"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="background-upload"
                            disabled={isUploading}
                          />
                          <label
                            htmlFor="background-upload"
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                              isUploading
                                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                                : 'bg-goldBright hover:bg-yellow-400 cursor-pointer'
                            }`}
                          >
                            <svg className="w-5 h-5 text-midnight" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                          </label>
                        </div>
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

                    {/* Virtual Background Options */}
                    <div className="mb-4">
                      <h5 className="text-sm font-semibold text-cloud mb-2">Virtual Background Options</h5>
                      <div className="grid grid-cols-4 gap-3">
                        {virtualBackgrounds.map((bg) => (
                          <div key={bg.id} className="relative group">
                            <button
                              onClick={() => selectBackground(bg.id)}
                              className={`w-full p-2 rounded-lg border-2 transition-all duration-200 ${
                                selectedBackground === bg.id
                                  ? 'border-goldBright bg-goldBright/20'
                                  : 'border-white/20 hover:border-white/40'
                              }`}
                            >
                              <div className="aspect-video bg-white/10 rounded mb-2 flex items-center justify-center relative overflow-hidden">
                                {bg.type === 'none' ? (
                                  <span className="text-cloud text-xs">None</span>
                                ) : bg.type === 'blur' ? (
                                  <span className="text-cloud text-xs">Blur</span>
                                ) : (
                                  <span className="text-cloud text-xs">{bg.name}</span>
                                )}
                              </div>
                              <p className="text-xs text-cloud text-center truncate">{bg.name}</p>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Default Backgrounds */}
                    {defaultMedia.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-sm font-semibold text-cloud mb-2">Default Backgrounds</h5>
                        <div className="grid grid-cols-4 gap-3">
                          {defaultMedia.map((media) => (
                            <div key={`default-${media.id}`} className="relative group">
                              <button
                                onClick={() => selectBackground(`default-${media.id}`)}
                                className={`w-full p-2 rounded-lg border-2 transition-all duration-200 ${
                                  selectedBackground === `default-${media.id}`
                                    ? 'border-goldBright bg-goldBright/20'
                                    : 'border-white/20 hover:border-white/40'
                                }`}
                              >
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
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* User Uploaded Backgrounds */}
                    {customBackgrounds.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-sm font-semibold text-cloud mb-2">Your Uploads</h5>
                        <div className="grid grid-cols-4 gap-3">
                          {customBackgrounds.map((bg) => (
                            <div key={bg.id} className="relative group">
                              <button
                                onClick={() => selectBackground(bg.id)}
                                className={`w-full p-2 rounded-lg border-2 transition-all duration-200 ${
                                  selectedBackground === bg.id
                                    ? 'border-goldBright bg-goldBright/20'
                                    : 'border-white/20 hover:border-white/40'
                                }`}
                              >
                                <div className="aspect-video bg-white/10 rounded mb-2 flex items-center justify-center relative overflow-hidden">
                                  <img 
                                    src={bg.thumbnail} 
                                    alt={bg.name}
                                    className="w-full h-full object-cover rounded"
                                  />
                                  {bg.hasVideo && (
                                    <div className="absolute bottom-1 left-1">
                                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-cloud text-center truncate">{bg.name}</p>
                              </button>
                              
                              {/* Delete button for custom backgrounds */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFile(bg.id);
                                }}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                              >
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                            {/* Green Screen Toggle */}
                            <div className="flex items-center justify-between p-3 bg-midnight/60 rounded-lg border border-white/10">
                      <div className="flex items-center space-x-2">
                        <span className="text-cloud text-sm font-medium">I have a green screen</span>
                        <svg className="w-4 h-4 text-cloud/60" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={hasGreenScreen}
                          onChange={(e) => {
                            setHasGreenScreen(e.target.checked);
                            // Reapply current background with new green screen setting
                            if (selectedBackground) {
                              selectBackground(selectedBackground);
                            }
                          }}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-goldBright/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-goldBright"></div>
                      </label>
                    </div>
                  </div>
                )}

                {activeTab === 'avatars' && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-cloud">Avatars</h4>
                    <div className="grid grid-cols-4 gap-4">
                      {avatars.map((avatar) => (
                        <button
                          key={avatar.id}
                          onClick={() => setSelectedAvatar(avatar.id)}
                          className={`p-2 rounded-lg border-2 transition-all duration-200 ${
                            selectedAvatar === avatar.id
                              ? 'border-goldBright bg-goldBright/20'
                              : 'border-white/20 hover:border-white/40'
                          }`}
                        >
                          <div className="aspect-video bg-white/10 rounded mb-2 flex items-center justify-center">
                            <span className="text-cloud text-xs">{avatar.name}</span>
                          </div>
                          <p className="text-xs text-cloud text-center">{avatar.name}</p>
                        </button>
                      ))}
                    </div>
                    
                    {/* Uploaded Audio Files */}
                    {uploadedFiles.filter(file => file.type === 'audio').length > 0 && (
                      <div className="mt-6">
                        <h5 className="text-base font-semibold text-cloud mb-3">Uploaded Audio Files</h5>
                        <div className="grid grid-cols-4 gap-4">
                          {uploadedFiles
                            .filter(file => file.type === 'audio')
                            .map((file) => (
                              <div key={file.id} className="relative group">
                                <div className="p-2 rounded-lg border-2 border-white/20 hover:border-white/40 transition-all duration-200">
                                  <div className="aspect-video bg-white/10 rounded mb-2 flex items-center justify-center relative overflow-hidden">
                                    <img 
                                      src={file.thumbnail} 
                                      alt={file.name}
                                      className="w-full h-full object-cover rounded"
                                    />
                                  </div>
                                  <p className="text-xs text-cloud text-center truncate">{file.name}</p>
                                  <p className="text-xs text-cloud/60 text-center">
                                    {(file.size / 1024 / 1024).toFixed(1)} MB
                                  </p>
                                </div>
                                
                                {/* Delete button */}
                                <button
                                  onClick={() => handleDeleteFile(file.id)}
                                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                >
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'filters' && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-cloud">Video filters</h4>
                    <div className="grid grid-cols-4 gap-4">
                      {videoFilters.map((filter) => (
                        <button
                          key={filter.id}
                          onClick={() => setSelectedFilter(filter.id)}
                          className={`p-2 rounded-lg border-2 transition-all duration-200 ${
                            selectedFilter === filter.id
                              ? 'border-goldBright bg-goldBright/20'
                              : 'border-white/20 hover:border-white/40'
                          }`}
                        >
                          <div className="aspect-video bg-white/10 rounded mb-2 flex items-center justify-center">
                            <span className="text-cloud text-xs">{filter.name}</span>
                          </div>
                          <p className="text-xs text-cloud text-center">{filter.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'effects' && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-cloud">Studio effects</h4>
                    <div className="grid grid-cols-4 gap-4">
                      {studioEffects.map((effect) => (
                        <button
                          key={effect.id}
                          onClick={() => setSelectedEffect(effect.id)}
                          className={`p-2 rounded-lg border-2 transition-all duration-200 ${
                            selectedEffect === effect.id
                              ? 'border-goldBright bg-goldBright/20'
                              : 'border-white/20 hover:border-white/40'
                          }`}
                        >
                          <div className="aspect-video bg-white/10 rounded mb-2 flex items-center justify-center">
                            <span className="text-cloud text-xs">{effect.name}</span>
                          </div>
                          <p className="text-xs text-cloud text-center">{effect.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PreMeetingSetup;