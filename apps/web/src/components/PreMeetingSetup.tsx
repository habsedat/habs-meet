import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLocalVideoTrack, createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';
import { backgroundEngine } from '../video/BackgroundEngine';
import BackgroundEffectsPanel from './BackgroundEffectsPanel';
import { useAuth } from '../contexts/AuthContext';
import toast from '../lib/toast';

interface PreMeetingSetupProps {
  roomId: string;
  roomTitle: string;
  isParticipant?: boolean;
}

interface MediaDevice {
  deviceId: string;
  label: string;
}

// Also use MediaDeviceInfo for compatibility

const PreMeetingSetup: React.FC<PreMeetingSetupProps> = ({ roomId, roomTitle, isParticipant = false }) => {
  const navigate = useNavigate();
  const { userProfile, updateSavedBackground, updateUserPreferences } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | null>(null);
  const isApplyingBackgroundRef = useRef(false); // Lock to prevent track cleanup during background application
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  // Load backgroundEffectsEnabled from userProfile (Firestore) - user-specific, not device-specific
  const [isBackgroundEffectsEnabled, setIsBackgroundEffectsEnabled] = useState(
    userProfile?.preferences?.backgroundEffectsEnabled || false
  );
  
  // Update when userProfile changes (e.g., when user logs in/out)
  useEffect(() => {
    setIsBackgroundEffectsEnabled(userProfile?.preferences?.backgroundEffectsEnabled || false);
  }, [userProfile?.preferences?.backgroundEffectsEnabled]);
  // ✅ CRITICAL FIX: Track pre-meeting background locally (not from Firestore)
  // This prevents Firestore timing issues from randomly overriding user selection
  // Initialize from userProfile on mount, but then manage independently
  const [previewBackground, setPreviewBackground] = useState<{ type: 'none' | 'blur' | 'image' | 'video'; url?: string } | null>(
    userProfile?.savedBackground || null
  );
  
  // Update previewBackground only on initial load or when userProfile changes (e.g., when user logs in/out)
  // But don't override if user is actively selecting (that's handled by handlePreMeetingBackgroundChange)
  useEffect(() => {
    // Only update if previewBackground is null/empty (initial load)
    // This prevents Firestore updates from overriding active user selection
    if (!previewBackground && userProfile?.savedBackground) {
      setPreviewBackground(userProfile.savedBackground);
    }
  }, [userProfile?.savedBackground]);
  
  // Keep savedBackground for backward compatibility with existing code
  // But it will be updated via handlePreMeetingBackgroundChange, not directly
  const [savedBackground, setSavedBackground] = useState<{ type: 'none' | 'blur' | 'image' | 'video'; url?: string } | null>(
    userProfile?.savedBackground || null
  );
  // Load alwaysShowPreview from userProfile (Firestore) - user-specific, not device-specific
  const [alwaysShowPreview, setAlwaysShowPreview] = useState(
    userProfile?.preferences?.alwaysShowPreview !== undefined 
      ? userProfile.preferences.alwaysShowPreview 
      : true
  );
  
  // Update when userProfile changes
  useEffect(() => {
    setAlwaysShowPreview(
      userProfile?.preferences?.alwaysShowPreview !== undefined 
        ? userProfile.preferences.alwaysShowPreview 
        : true
    );
  }, [userProfile?.preferences?.alwaysShowPreview]);
  
  const [audioDevices, setAudioDevices] = useState<MediaDevice[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDevice[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [deviceErrors, setDeviceErrors] = useState<{ video?: string; audio?: string }>({});
  
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  
  // Camera facing mode for mobile/tablet (front/back)
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  
  // Detect mobile/tablet screen size
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Get optimized video constraints based on device type
  const getVideoConstraints = useCallback(() => {
    if (isMobile || isTablet) {
      // Mobile/Tablet: Lower resolution and frame rate for better performance and bandwidth
      return {
        width: 640,
        height: 360,
        frameRate: 15, // Lower frame rate for mobile
      };
    } else {
      // Desktop: Higher quality
      return {
        width: 1280,
        height: 720,
        frameRate: 30,
      };
    }
  }, [isMobile, isTablet]);
  
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 640); // sm breakpoint
      setIsTablet(width >= 640 && width < 1024); // tablet: sm to lg
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  
  // Hide device inputs on mobile/tablet (phones and tablets don't have external devices)
  const showDeviceInputs = !isMobile && !isTablet;
  
  // Memoize close handler to prevent effect re-running
  const handleClosePanel = useCallback(() => {
    setShowBackgroundPanel(false);
  }, []);
  
  // Handle native back button on mobile
  useEffect(() => {
    if (!isMobile || showBackgroundPanel) return; // Don't handle if background panel is open
    
    const handlePopState = () => {
      // User pressed back button, navigate to home
      navigate('/home');
    };
    
    // Push a history state so back button works
    window.history.pushState({ preMeetingOpen: true }, '');
    
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isMobile, navigate, showBackgroundPanel]);

  // Function to refresh device list
  const refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }));
      const videoInputs = devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
      
      setAudioDevices(audioInputs);
      // Validate selected audio device still exists
      if (selectedAudioDevice && !audioInputs.find(d => d.deviceId === selectedAudioDevice)) {
        // Selected audio device no longer available
        if (audioInputs.length > 0) {
          setSelectedAudioDevice(audioInputs[0].deviceId);
          toast.error('Selected microphone is no longer available. Switched to default.');
        } else {
          setSelectedAudioDevice('');
          setIsMicEnabled(false);
          toast.error('No microphones available');
        }
      } else if (!selectedAudioDevice && audioInputs.length > 0) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }

      setVideoDevices(videoInputs);
      // Validate selected video device still exists
      if (selectedVideoDevice && !videoInputs.find(d => d.deviceId === selectedVideoDevice)) {
        // Selected video device no longer available
        if (videoInputs.length > 0) {
          setSelectedVideoDevice(videoInputs[0].deviceId);
          toast.error('Selected camera is no longer available. Switched to default.');
        } else {
          setSelectedVideoDevice('');
          setIsVideoEnabled(false);
          toast.error('No cameras available');
        }
      } else if (!selectedVideoDevice && videoInputs.length > 0) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
    } catch (error: any) {
      console.error('Error refreshing devices:', error);
    }
  };

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        // First, request permissions with getUserMedia to ensure devices are accessible
        // This is required for external devices to be enumerated properly
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: isMobile || isTablet 
            ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, 
          audio: true 
        });
        
        // Stop the stream immediately - we just needed it for permissions
        stream.getTracks().forEach(track => track.stop());
        
        // Small delay to ensure devices are enumerated after permission grant
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Now enumerate devices with full access
        await refreshDevices();
        
        // Create tracks with selected devices
        await createTracks();
      } catch (error: any) {
        console.error('Error initializing media:', error);
        if (error.name === 'NotAllowedError') {
          toast.error('Camera/microphone permission denied. Please allow access and refresh.');
        } else if (error.name === 'NotFoundError') {
          toast.error('No camera/microphone found. Please connect a device.');
        } else {
          toast.error('Failed to access camera/microphone: ' + error.message);
        }
      }
    };

    initializeMedia();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      // Don't stop tracks if background is being applied
      if (!isApplyingBackgroundRef.current) {
        if (videoTrack) {
          videoTrack.stop();
          videoTrack.detach();
        }
        if (audioTrack) {
          audioTrack.stop();
          audioTrack.detach();
        }
      }
    };
  }, []);

  // Handle device changes - recreate tracks when device selection changes
  useEffect(() => {
    // Only recreate tracks if devices are selected and we have initialized tracks before
    if (selectedVideoDevice || selectedAudioDevice) {
      // Only recreate if tracks already exist (initial creation happens in initializeMedia)
      if (videoTrack || audioTrack) {
        createTracks();
      }
    }
  }, [selectedVideoDevice, selectedAudioDevice]);

  useEffect(() => {
    if (videoTrack && containerRef.current) {
      const existingVideo = containerRef.current.querySelector('video');
      if (existingVideo) {
        existingVideo.remove();
      }
      
      const element = videoTrack.attach();
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.objectFit = 'cover'; // Fill container completely
      element.style.objectPosition = 'center';
      element.style.backgroundColor = 'transparent'; // Use container gradient instead
      element.style.borderRadius = '0.5rem';
      containerRef.current.appendChild(element);
    }
    
    return () => {
      if (videoTrack && containerRef.current) {
        const video = containerRef.current.querySelector('video');
        if (video) {
          videoTrack.detach();
        }
      }
    };
  }, [videoTrack]);

  // ✅ CRITICAL FIX: Effect to handle background effects toggle - ONLY on initial load or toggle change
  // This effect should NOT run when user actively selects a background (that's handled by handlePreMeetingBackgroundChange)
  // It only runs on initial load to apply saved background from Firestore
  const hasInitializedRef = useRef(false);
  const lastVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const lastAppliedBackgroundRef = useRef<string | null>(null); // Track last applied background to prevent re-applying same one
  
  useEffect(() => {
    if (!videoTrack) return;
    
    // ✅ CRITICAL: Reset initialization if videoTrack changed (e.g., camera switch)
    if (lastVideoTrackRef.current !== videoTrack) {
      hasInitializedRef.current = false;
      lastVideoTrackRef.current = videoTrack;
      lastAppliedBackgroundRef.current = null; // Reset when track changes
    }
    
    // ✅ CRITICAL: Don't run if user is actively changing background
    if (isApplyingBackgroundRef.current) {
      console.log('[PreMeeting] Skipping auto-apply - user is actively changing background');
      return;
    }
    
    // ✅ CRITICAL: Only run on initial load (when videoTrack first becomes available)
    // Don't run when savedBackground changes from Firestore - that causes flashing
    if (hasInitializedRef.current) {
      // Already initialized - only re-run if toggle changes, not if savedBackground changes
      return;
    }
    
    // Mark as initialized
    hasInitializedRef.current = true;
    
    // Save toggle state
    // Save to Firestore (user-specific), not localStorage (device-specific)
    updateUserPreferences({ backgroundEffectsEnabled: isBackgroundEffectsEnabled }).catch(console.error);
    
    const applyBackground = async () => {
      if (!videoTrack) return;

      // Re-validate track is still ready and active
      const tracks = videoTrack.mediaStream?.getVideoTracks();
      if (!tracks || tracks.length === 0 || tracks[0].readyState === 'ended') {
        console.warn('Video track not ready, skipping background effect');
        return;
      }
      
      // Initialize background engine first, with validation
      try {
        // Double-check backgroundEngine is available
        if (!backgroundEngine) {
          console.error('[BG] Background engine is not available');
          return;
        }
        
        if (typeof backgroundEngine.init !== 'function') {
          console.error('[BG] Background engine init is not a function');
          return;
        }
        
        await backgroundEngine.init(videoTrack);
      } catch (err: any) {
        console.error('[BG] Failed to initialize background engine:', err);
        return; // Don't try to apply effects if init failed
      }
      
      // Double-check track is still ready after init
      const tracksAfterInit = videoTrack.mediaStream?.getVideoTracks();
      if (!tracksAfterInit || tracksAfterInit.length === 0 || tracksAfterInit[0].readyState === 'ended') {
        console.warn('[BG] Video track ended during init, skipping background effect');
        return;
      }
      
      // Double-check backgroundEngine is still available
      if (!backgroundEngine) {
        console.error('[BG] Background engine became unavailable after init');
        return;
      }
      
      try {
        // ✅ CRITICAL: Use previewBackground (user's actual selection) not savedBackground (Firestore)
        // This prevents Firestore updates from overriding user's active selection
        const backgroundToApply = previewBackground || savedBackground;
        
        // ✅ CRITICAL: Create a unique key for this background to prevent re-applying the same one
        const backgroundKey = backgroundToApply 
          ? `${backgroundToApply.type}:${backgroundToApply.url || ''}`
          : `none:${isBackgroundEffectsEnabled ? 'blur' : 'none'}`;
        
        // ✅ CRITICAL: Skip if we already applied this exact background
        if (lastAppliedBackgroundRef.current === backgroundKey) {
          console.log('[PreMeeting] Skipping - same background already applied:', backgroundKey);
          return;
        }
        
        if (isBackgroundEffectsEnabled) {
          // When turned ON: apply saved background or blur
          if (backgroundToApply) {
            if (backgroundToApply.type === 'blur') {
              if (backgroundEngine && typeof backgroundEngine.setBlur === 'function') {
                await backgroundEngine.setBlur();
                lastAppliedBackgroundRef.current = backgroundKey;
              }
            } else if (backgroundToApply.type === 'image' && backgroundToApply.url) {
              if (backgroundEngine && typeof backgroundEngine.setImage === 'function') {
                // ✅ CRITICAL: Apply immediately - no retries, no delays
                await backgroundEngine.setImage(backgroundToApply.url);
                lastAppliedBackgroundRef.current = backgroundKey;
              }
            } else if (backgroundToApply.type === 'video' && backgroundToApply.url) {
              if (backgroundEngine && typeof backgroundEngine.setVideo === 'function') {
                await backgroundEngine.setVideo(backgroundToApply.url);
                lastAppliedBackgroundRef.current = backgroundKey;
              }
            }
          } else {
            // No saved background - default to blur when toggle is ON
            if (backgroundEngine && typeof backgroundEngine.setBlur === 'function') {
              await backgroundEngine.setBlur();
              lastAppliedBackgroundRef.current = backgroundKey;
            }
          }
        } else {
          // When turned OFF: remove background effects
          if (backgroundEngine && typeof backgroundEngine.setNone === 'function') {
            await backgroundEngine.setNone();
            lastAppliedBackgroundRef.current = backgroundKey;
          }
        }
      } catch (error) {
        console.error('[BG] Error applying background:', error);
      }
    };
    
    // ✅ CRITICAL FIX: Apply immediately - no delays (like Zoom)
    applyBackground();
  }, [isBackgroundEffectsEnabled, videoTrack]); // ✅ CRITICAL: Removed savedBackground and previewBackground from dependencies to prevent re-running on user selections
  
  // ✅ CRITICAL FIX: Handle toggle changes separately from initial load
  // This only runs when the toggle changes (not when background is selected)
  const lastToggleStateRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!videoTrack || !hasInitializedRef.current) return; // Only run after initial load
    if (isApplyingBackgroundRef.current) return; // Don't run if user is actively changing background
    
    // ✅ CRITICAL: Only run if toggle actually changed
    if (lastToggleStateRef.current === isBackgroundEffectsEnabled) {
      return; // Toggle didn't change, skip
    }
    lastToggleStateRef.current = isBackgroundEffectsEnabled;
    
    // Save toggle state
    updateUserPreferences({ backgroundEffectsEnabled: isBackgroundEffectsEnabled }).catch(console.error);
    
    const applyToggle = async () => {
      if (!videoTrack) return;
      
      try {
        if (!backgroundEngine) return;
        
        // Initialize if needed
        await backgroundEngine.init(videoTrack);
        
        // ✅ CRITICAL: Create background key to prevent re-applying same one
        const backgroundToApply = previewBackground || savedBackground;
        const backgroundKey = isBackgroundEffectsEnabled
          ? (backgroundToApply 
              ? `${backgroundToApply.type}:${backgroundToApply.url || ''}`
              : 'blur:blur')
          : 'none:none';
        
        // ✅ CRITICAL: Skip if we already applied this exact background
        if (lastAppliedBackgroundRef.current === backgroundKey) {
          console.log('[PreMeeting] Toggle - skipping, same background already applied');
          return;
        }
        
        if (isBackgroundEffectsEnabled) {
          // Toggle ON: apply current previewBackground or savedBackground
          if (backgroundToApply) {
            if (backgroundToApply.type === 'blur') {
              await backgroundEngine.setBlur();
              lastAppliedBackgroundRef.current = backgroundKey;
            } else if (backgroundToApply.type === 'image' && backgroundToApply.url) {
              await backgroundEngine.setImage(backgroundToApply.url);
              lastAppliedBackgroundRef.current = backgroundKey;
            } else if (backgroundToApply.type === 'video' && backgroundToApply.url) {
              await backgroundEngine.setVideo(backgroundToApply.url);
              lastAppliedBackgroundRef.current = backgroundKey;
            }
          } else {
            await backgroundEngine.setBlur();
            lastAppliedBackgroundRef.current = backgroundKey;
          }
        } else {
          // Toggle OFF: remove background
          await backgroundEngine.setNone();
          lastAppliedBackgroundRef.current = backgroundKey;
        }
      } catch (error) {
        console.error('[BG] Error applying toggle:', error);
      }
    };
    
    applyToggle();
  }, [isBackgroundEffectsEnabled, videoTrack]); // Only run when toggle or track changes

  const createTracks = async () => {
    try {
      // Clear previous errors
      setDeviceErrors({});

      // Validate devices are available
      const isVideoDeviceAvailable = !selectedVideoDevice || videoDevices.some(d => d.deviceId === selectedVideoDevice);
      const isAudioDeviceAvailable = !selectedAudioDevice || audioDevices.some(d => d.deviceId === selectedAudioDevice);

      if (selectedVideoDevice && !isVideoDeviceAvailable) {
        // Selected video device not available - switch to default or disable
        if (videoDevices.length > 0) {
          setSelectedVideoDevice(videoDevices[0].deviceId);
          toast.error('Selected camera is not available. Using default camera.');
        } else {
          setIsVideoEnabled(false);
          setDeviceErrors(prev => ({ ...prev, video: 'No camera available' }));
          toast.error('No cameras available');
        }
        return;
      }

      if (selectedAudioDevice && !isAudioDeviceAvailable) {
        // Selected audio device not available - switch to default or disable
        if (audioDevices.length > 0) {
          setSelectedAudioDevice(audioDevices[0].deviceId);
          toast.error('Selected microphone is not available. Using default microphone.');
        } else {
          setIsMicEnabled(false);
          setDeviceErrors(prev => ({ ...prev, audio: 'No microphone available' }));
          toast.error('No microphones available');
        }
        return;
      }

          // Don't clean up if background is being applied
          if (isApplyingBackgroundRef.current) {
            console.log('[BG] Skipping track cleanup - background application in progress');
            return;
          }

          // Clean up background engine and tracks properly
          if (videoTrack) {
            // Remove processor first, before stopping track
            try {
              if (backgroundEngine && typeof backgroundEngine.setNone === 'function') {
                await backgroundEngine.setNone();
                // Small delay to ensure processor is removed
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            } catch (e) {
              console.warn('[BG] Error cleaning up background engine:', e);
            }

        // Detach from DOM first
        if (containerRef.current) {
          const existingVideo = containerRef.current.querySelector('video');
          if (existingVideo) {
            existingVideo.remove();
          }
        }
        
        // Check if track is still active before stopping
        const tracks = videoTrack.mediaStream?.getVideoTracks();
        if (tracks && tracks.length > 0 && tracks[0].readyState !== 'ended') {
          videoTrack.stop();
        }
        videoTrack.detach();
      }
      if (audioTrack) {
        audioTrack.stop();
        audioTrack.detach();
      }

      // Create new tracks with selected devices - use exact constraints for external devices
      try {
        let video: LocalVideoTrack;
        
        if (selectedVideoDevice) {
          // Use exact constraint to force the specific device - this is required for external devices
          try {
            const videoConstraints = getVideoConstraints();
            video = await createLocalVideoTrack({ 
              deviceId: { exact: selectedVideoDevice },
              resolution: videoConstraints
            });
            
            // Verify the correct device is being used
            const actualSettings = video.mediaStream?.getVideoTracks()[0]?.getSettings();
            if (actualSettings?.deviceId && actualSettings.deviceId !== selectedVideoDevice) {
              // Device mismatch - try without exact to see if device is available
              try {
                video.stop();
                video.detach();
              } catch {}
              
              // Try with ideal constraint instead (some devices need this)
              try {
                const videoConstraints = getVideoConstraints();
                video = await createLocalVideoTrack({ 
                  deviceId: { ideal: selectedVideoDevice },
                  resolution: videoConstraints
                });
              } catch (idealError: any) {
                throw new Error(`Failed to access camera: ${idealError?.message || 'Device unavailable'}`);
              }
            }
          } catch (exactError: any) {
            // If exact fails, try ideal constraint (less strict)
            if (exactError.name !== 'NotAllowedError' && exactError.name !== 'NotFoundError') {
              try {
                const videoConstraints = getVideoConstraints();
                video = await createLocalVideoTrack({ 
                  deviceId: { ideal: selectedVideoDevice },
                  resolution: videoConstraints
                });
              } catch (idealError: any) {
                // Try with just deviceId as string (fallback)
                try {
                  const videoConstraints = getVideoConstraints();
                  video = await createLocalVideoTrack({ 
                    deviceId: selectedVideoDevice,
                    resolution: videoConstraints
                  });
                } catch (fallbackError: any) {
                  throw new Error(`Camera "${videoDevices.find(d => d.deviceId === selectedVideoDevice)?.label || selectedVideoDevice}" is unavailable: ${fallbackError?.message || 'Device access denied'}`);
                }
              }
            } else {
              throw new Error(`Camera access denied or not found: ${exactError?.message || 'Please check permissions'}`);
            }
          }
        } else {
          // No device selected - use facingMode for mobile/tablet, or default for desktop
          try {
            const videoConstraints = getVideoConstraints();
            if (isMobile || isTablet) {
              // Use facingMode for mobile/tablet devices
              video = await createLocalVideoTrack({
                facingMode: cameraFacingMode,
                resolution: videoConstraints
              });
            } else {
              // Desktop - use default camera
              video = await createLocalVideoTrack({
                resolution: videoConstraints
              });
            }
          } catch (defaultError: any) {
            throw new Error(`Failed to access default camera: ${defaultError?.message || 'Please check permissions'}`);
          }
        }

        // Wait for track to be ready (have active video tracks)
        const videoTracks = video.mediaStream?.getVideoTracks();
        if (!videoTracks || videoTracks.length === 0) {
          throw new Error('Video track has no video tracks');
        }

        // Ensure track is not ended and is in 'live' state
        const videoTrackState = videoTracks[0].readyState;
        if (videoTrackState === 'ended') {
          throw new Error('Video track is already ended');
        }
        
        // Wait a bit for track to fully initialize
        await new Promise(resolve => {
          if (videoTrackState === 'live') {
            resolve(undefined);
          } else {
            // Wait for track to become live
            const checkState = () => {
              const currentTracks = video.mediaStream?.getVideoTracks();
              if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState === 'live') {
                resolve(undefined);
              } else {
                setTimeout(checkState, 50);
              }
            };
            setTimeout(checkState, 50);
          }
        });

        // Verify the track is using the correct device - accept silently
        const actualDeviceSettings = video.mediaStream?.getVideoTracks()[0]?.getSettings();
        if (selectedVideoDevice && actualDeviceSettings?.deviceId && actualDeviceSettings.deviceId !== selectedVideoDevice) {
          // Accept the device that's actually being used and update selection silently
          const matchingDevice = videoDevices.find(d => d.deviceId === actualDeviceSettings.deviceId);
          if (matchingDevice && actualDeviceSettings.deviceId) {
            setSelectedVideoDevice(actualDeviceSettings.deviceId);
          }
        }
        
        if (!isVideoEnabled) {
          video.mute();
        }
        
        // Set video track state - this will trigger the background effects effect
        setVideoTrack(video);
        setDeviceErrors(prev => ({ ...prev, video: undefined }));
      } catch (videoError: any) {
        console.error('Error creating video track:', videoError);
        setDeviceErrors(prev => ({ ...prev, video: videoError.message || 'Camera unavailable' }));
        
        // Try fallback to default camera
        if (videoDevices.length > 0 && selectedVideoDevice !== videoDevices[0].deviceId) {
          toast.error(`Camera "${videoDevices.find(d => d.deviceId === selectedVideoDevice)?.label || selectedVideoDevice}" is unavailable. Switching to default.`);
          setSelectedVideoDevice(videoDevices[0].deviceId);
          return; // Will retry with default device
        } else {
          setIsVideoEnabled(false);
          toast.error('Failed to access camera: ' + (videoError.message || 'Device unavailable'));
        }
      }

      // Create audio track with exact constraints for external devices
      if (isMicEnabled || selectedAudioDevice) {
        try {
          let audio: LocalAudioTrack;
          
          if (selectedAudioDevice) {
            // Use exact constraint to force the specific device - required for external devices
            try {
              audio = await createLocalAudioTrack({ 
                deviceId: { exact: selectedAudioDevice }
              });
              
              // Verify the correct device is being used
              const actualSettings = audio.mediaStream?.getAudioTracks()[0]?.getSettings();
              if (actualSettings?.deviceId && actualSettings.deviceId !== selectedAudioDevice) {
                // Device mismatch - try with ideal constraint instead
                try {
                  audio.stop();
                  audio.detach();
                } catch {}
                
                try {
                  audio = await createLocalAudioTrack({ 
                    deviceId: { ideal: selectedAudioDevice }
                  });
                } catch (idealError: any) {
                  throw new Error(`Failed to access microphone: ${idealError?.message || 'Device unavailable'}`);
                }
              }
            } catch (exactError: any) {
              // If exact fails, try ideal constraint (less strict)
              if (exactError.name !== 'NotAllowedError' && exactError.name !== 'NotFoundError') {
                try {
                  audio = await createLocalAudioTrack({ 
                    deviceId: { ideal: selectedAudioDevice }
                  });
                } catch (idealError: any) {
                  // Try with just deviceId as string (fallback)
                  try {
                    audio = await createLocalAudioTrack({ 
                      deviceId: selectedAudioDevice
                    });
                  } catch (fallbackError: any) {
                    throw new Error(`Microphone "${audioDevices.find(d => d.deviceId === selectedAudioDevice)?.label || selectedAudioDevice}" is unavailable: ${fallbackError?.message || 'Device access denied'}`);
                  }
                }
              } else {
                throw new Error(`Microphone access denied or not found: ${exactError?.message || 'Please check permissions'}`);
              }
            }
          } else {
            // No device selected - use default
            try {
              audio = await createLocalAudioTrack();
            } catch (defaultError: any) {
              throw new Error(`Failed to access default microphone: ${defaultError?.message || 'Please check permissions'}`);
            }
          }
          
          // Wait for track to be ready (have active audio tracks)
          const audioTracks = audio.mediaStream?.getAudioTracks();
          if (!audioTracks || audioTracks.length === 0) {
            throw new Error('Audio track has no audio tracks');
          }

          // Ensure track is not ended
          if (audioTracks[0].readyState === 'ended') {
            throw new Error('Audio track is already ended');
          }
          
          // Verify the track is using the correct device - accept silently
          const actualAudioSettings = audio.mediaStream?.getAudioTracks()[0]?.getSettings();
          if (selectedAudioDevice && actualAudioSettings?.deviceId && actualAudioSettings.deviceId !== selectedAudioDevice) {
            // Accept the device that's actually being used and update selection silently
            const matchingDevice = audioDevices.find(d => d.deviceId === actualAudioSettings.deviceId);
            if (matchingDevice && actualAudioSettings.deviceId) {
              setSelectedAudioDevice(actualAudioSettings.deviceId);
            }
          }
          
          if (!isMicEnabled) {
            audio.mute();
          }
          setAudioTrack(audio);
          setDeviceErrors(prev => ({ ...prev, audio: undefined }));
        } catch (audioError: any) {
          console.error('Error creating audio track:', audioError);
          setDeviceErrors(prev => ({ ...prev, audio: audioError.message || 'Microphone unavailable' }));
          
          // Try fallback to default microphone
          if (audioDevices.length > 0 && selectedAudioDevice !== audioDevices[0].deviceId) {
            toast.error(`Microphone "${audioDevices.find(d => d.deviceId === selectedAudioDevice)?.label || selectedAudioDevice}" is unavailable. Switching to default.`);
            setSelectedAudioDevice(audioDevices[0].deviceId);
            return; // Will retry with default device
          } else {
            setIsMicEnabled(false);
            toast.error('Failed to access microphone: ' + (audioError.message || 'Device unavailable'));
          }
        }
      }

      // Reapply background effect after track is created (will happen in the videoTrack effect)
    } catch (error: any) {
      console.error('Error creating tracks:', error);
      toast.error('Failed to switch device: ' + error.message);
    }
  };

      const handleToggleMic = () => {
        const newState = !isMicEnabled;
        setIsMicEnabled(newState);
        if (audioTrack) {
          if (newState) {
            audioTrack.unmute();
          } else {
            audioTrack.mute();
          }
        } else if (newState) {
          // Use exact constraint for selected device
          const audioConstraints = selectedAudioDevice 
            ? { deviceId: { exact: selectedAudioDevice } }
            : {};
          
          createLocalAudioTrack(audioConstraints)
            .then(track => {
              setAudioTrack(track);
            })
            .catch(err => {
              console.error('Error creating audio track:', err);
              // Try with ideal constraint as fallback
              if (selectedAudioDevice) {
                createLocalAudioTrack({ deviceId: { ideal: selectedAudioDevice } })
                  .then(track => {
                    setAudioTrack(track);
                  })
                  .catch(() => {
                    toast.error('Failed to enable microphone. Please check device connection.');
                  });
              } else {
                toast.error('Failed to enable microphone');
              }
            });
        }
      };

  const handleToggleVideo = () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    if (videoTrack) {
      if (newState) {
        videoTrack.unmute();
      } else {
        videoTrack.mute();
      }
    }
  };

  // Switch between front and back camera (mobile/tablet only)
  const handleSwitchCamera = async () => {
    if (!isMobile && !isTablet) return; // Only available on mobile/tablet
    
    const newFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(newFacingMode);
    
    // Recreate video track with new facing mode
    if (isVideoEnabled) {
      try {
        // Stop and detach current track
        if (videoTrack) {
          try {
            if (backgroundEngine && typeof backgroundEngine.setNone === 'function') {
              await backgroundEngine.setNone();
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          } catch (e) {
            console.warn('[BG] Error cleaning up background engine:', e);
          }
          
          if (containerRef.current) {
            const existingVideo = containerRef.current.querySelector('video');
            if (existingVideo) {
              existingVideo.remove();
            }
          }
          
          const tracks = videoTrack.mediaStream?.getVideoTracks();
          if (tracks && tracks.length > 0 && tracks[0].readyState !== 'ended') {
            videoTrack.stop();
          }
          videoTrack.detach();
        }
        
        // Create new track with new facing mode - optimized for device type
        const videoConstraints = getVideoConstraints();
        const newVideo = await createLocalVideoTrack({
          facingMode: newFacingMode,
          resolution: videoConstraints
        });
        
        setVideoTrack(newVideo);
        setDeviceErrors(prev => ({ ...prev, video: undefined }));
        
        // ✅ CRITICAL FIX: Reapply background effects immediately - no delays (like Zoom)
        if (isBackgroundEffectsEnabled) {
          // Apply immediately without setTimeout
          (async () => {
            try {
              if (!backgroundEngine) {
                console.warn('[BG] Background engine not available');
                return;
              }
              
              // Initialize background engine with new video track
              await backgroundEngine.init(newVideo);
              
              // Reapply the saved background effect immediately
              if (savedBackground) {
                if (savedBackground.type === 'blur') {
                  if (typeof backgroundEngine.setBlur === 'function') {
                    await backgroundEngine.setBlur();
                  }
                } else if (savedBackground.type === 'image' && savedBackground.url) {
                  if (typeof backgroundEngine.setImage === 'function') {
                    await backgroundEngine.setImage(savedBackground.url);
                  }
                } else if (savedBackground.type === 'video' && savedBackground.url) {
                  if (typeof backgroundEngine.setVideo === 'function') {
                    await backgroundEngine.setVideo(savedBackground.url);
                  }
                }
              } else {
                // No saved background but effects are enabled - apply blur as default
                if (typeof backgroundEngine.setBlur === 'function') {
                  await backgroundEngine.setBlur();
                }
              }
            } catch (error) {
              console.error('[BG] Error reapplying background after camera switch:', error);
              // Don't show error to user, just log it
            }
          })();
        }
      } catch (error: any) {
        console.error('Error switching camera:', error);
        toast.error('Failed to switch camera: ' + (error.message || 'Unknown error'));
        setDeviceErrors(prev => ({ ...prev, video: error.message || 'Camera switch failed' }));
      }
    }
  };

  const handleStart = async () => {
    setIsStarting(true);
    try {
      // Save to Firestore (user-specific), not localStorage (device-specific)
      await updateUserPreferences({ alwaysShowPreview });
      
      // Save device preferences to Firestore (user-specific), not localStorage
      await updateUserPreferences({
        videoDeviceId: selectedVideoDevice || null,
        audioDeviceId: selectedAudioDevice || null,
        videoEnabled: isVideoEnabled !== false,
        audioEnabled: isMicEnabled !== false,
        backgroundEffectsEnabled: isBackgroundEffectsEnabled === true,
      });
      
      if (videoTrack) {
        videoTrack.stop();
        videoTrack.detach();
      }
      if (audioTrack) {
        audioTrack.stop();
        audioTrack.detach();
      }

      navigate(`/room/${roomId}`);
    } catch (error: any) {
      console.error('Error starting meeting:', error);
      toast.error('Failed to start meeting: ' + error.message);
      setIsStarting(false);
    }
  };

      // ✅ CRITICAL FIX: Pre-meeting background change handler
      // This applies the background to the preview track IMMEDIATELY, then saves to Firestore
      // This ensures the exact clicked image is applied, not a different one
      const handlePreMeetingBackgroundChange = useCallback(
        async (type: 'none' | 'blur' | 'image' | 'video', url?: string) => {
          // 1. Apply to the preview camera track immediately
          if (videoTrack) {
            try {
              // Validate URL immediately before proceeding
              if ((type === 'image' || type === 'video') && (!url || url.trim() === '')) {
                console.error('[BG] Invalid URL provided:', { type, url });
                toast.error('Invalid background URL');
                throw new Error('Invalid background URL');
              }

              // Quick validation - don't block if track is valid
              const videoTracks = videoTrack.mediaStream?.getVideoTracks();
              if (!videoTracks || videoTracks.length === 0 || videoTracks[0].readyState === 'ended') {
                console.warn('[BG] Track is not valid, cannot apply background');
                throw new Error('Video track not ready');
              }

              // Set lock to prevent track cleanup during background application
              isApplyingBackgroundRef.current = true;

              try {
                // Validate backgroundEngine is available
                if (!backgroundEngine) {
                  console.error('[BG] Background engine is not available');
                  throw new Error('Background engine not available');
                }

                // Initialize background engine with preview track
                console.log('[PreMeeting] Initializing background engine...');
                await backgroundEngine.init(videoTrack);
                console.log('[PreMeeting] Background engine initialized');

                // Apply the background effect immediately
                if (type === 'none') {
                  if (typeof backgroundEngine.setNone === 'function') {
                    await backgroundEngine.setNone();
                    console.log('[PreMeeting] ✅ Background removed');
                  }
                } else if (type === 'blur') {
                  if (typeof backgroundEngine.setBlur === 'function') {
                    await backgroundEngine.setBlur();
                    console.log('[PreMeeting] ✅ Blur applied');
                  }
                } else if (type === 'image' && url) {
                  if (typeof backgroundEngine.setImage === 'function') {
                    console.log('[PreMeeting] Applying image background:', url);
                    await backgroundEngine.setImage(url);
                    console.log('[PreMeeting] ✅ Image background applied');
                  } else {
                    throw new Error('setImage function not available');
                  }
                } else if (type === 'video' && url) {
                  // Validate video URL before attempting to load
                  if (url.includes('example.com')) {
                    toast.error('Video URL is not available. Please configure a valid video URL.');
                    throw new Error('Video URL not available');
                  }
                  if (typeof backgroundEngine.setVideo === 'function') {
                    console.log('[PreMeeting] Applying video background:', url);
                    await backgroundEngine.setVideo(url);
                    console.log('[PreMeeting] ✅ Video background applied');
                  } else {
                    throw new Error('setVideo function not available');
                  }
                }

                console.log('[PreMeeting] ✅ Applied background to preview:', { type, url });
                
                // ✅ CRITICAL: Update last applied background ref to prevent effect from re-applying
                const backgroundKey = type === 'none' 
                  ? 'none:none'
                  : `${type}:${url || ''}`;
                lastAppliedBackgroundRef.current = backgroundKey;
              } catch (error: any) {
                console.error('[PreMeeting] ❌ Failed to apply preview background:', error);
                // ✅ CRITICAL: Show user-friendly error message
                const errorMsg = error?.message || 'Unknown error';
                if (!errorMsg.includes('Cancelled') && !errorMsg.includes('aborted')) {
                  if (errorMsg.includes('timeout') || errorMsg.includes('load') || errorMsg.includes('fetch')) {
                    toast.error('Background failed to load. Please check your internet connection.');
                  } else if (errorMsg.includes('processor') || errorMsg.includes('Failed to apply')) {
                    toast.error('Failed to apply background. The video track may not be ready.');
                  } else {
                    toast.error('Failed to apply background: ' + errorMsg);
                  }
                }
                // Throw so BackgroundEffectsPanel can revert selection on error
                throw error;
              } finally {
                // Release lock
                isApplyingBackgroundRef.current = false;
              }
            } catch (error: any) {
              // Re-throw to caller
              throw error;
            }
          } else {
            console.warn('[PreMeeting] No previewTrack available, skipping preview background apply');
            // Don't throw - allow Firestore save to proceed even if preview track isn't ready
          }

          // 2. Build the value to store as preference
          const backgroundToSave =
            type === 'none'
              ? null
              : ({ type, url } as { type: 'blur' | 'image' | 'video'; url?: string });

          try {
            // Enable or disable background effects based on selection
            await updateUserPreferences({
              backgroundEffectsEnabled: type !== 'none',
            });

            // Save chosen background to Firestore (used later when joining the real room)
            await updateSavedBackground(backgroundToSave);

            // 3. Keep local pre-meeting state in sync for the panel
            setPreviewBackground(backgroundToSave);
            setSavedBackground(backgroundToSave); // Also update savedBackground for backward compatibility

            console.log('[PreMeeting] ✅ Saved background preference to Firestore:', backgroundToSave);
          } catch (error: any) {
            console.error('[PreMeeting] ❌ Failed to save background preference:', error);
            // Re-throw so the panel can show an error & revert selection
            throw error;
          }
        },
        [videoTrack, updateSavedBackground, updateUserPreferences]
      );

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight via-techBlue to-violetDeep flex flex-col">
      {/* Header - Compact on Mobile */}
      <div className="bg-midnight/80 backdrop-blur-sm border-b border-white/10 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-goldBright rounded flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-midnight" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </div>
          <h1 className="text-xs sm:text-sm font-semibold text-cloud truncate">{roomTitle}</h1>
        </div>
        {!isMobile && (
          <button
            onClick={() => navigate('/home')}
            className="text-cloud/50 hover:text-cloud transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Content - Maximize Camera Preview */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video Preview - Full Screen, Maximized */}
        <div className="flex-1 flex items-center justify-center p-2 sm:p-4 lg:p-6 relative" style={{ paddingBottom: isMobile || isTablet ? '140px' : '0' }}>
          <div 
            ref={containerRef}
            className="w-full h-full max-w-full max-h-full bg-gradient-to-br from-techBlue/30 to-violetDeep/30 rounded-lg overflow-hidden relative flex items-center justify-center"
            style={{ 
              minHeight: isMobile ? 'calc(100vh - 220px)' : 'calc(100vh - 180px)',
              aspectRatio: '16/9'
            }}
          >
            {!isVideoEnabled && (
              <div className="absolute inset-0 bg-midnight/80 flex items-center justify-center z-10">
                <div className="text-center">
                  <svg className="w-16 h-16 text-cloud/60 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-cloud/60 text-sm">Camera is off</p>
                </div>
              </div>
            )}

            {/* Floating Control Icons - Inside Camera Preview */}
            <div className="absolute bottom-3 sm:bottom-4 left-1/2 transform -translate-x-1/2 z-20 flex items-center space-x-2 sm:space-x-3 bg-midnight/90 backdrop-blur-md rounded-full px-2 sm:px-4 py-2 sm:py-3 shadow-xl">
            {/* Audio Icon Button */}
            <button
              onClick={handleToggleMic}
              className={`p-2 sm:p-3 rounded-full transition-all ${
                isMicEnabled
                  ? 'bg-white/10 text-cloud hover:bg-white/20'
                  : 'bg-red-500 text-white hover:bg-red-600'
              }`}
              title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMicEnabled ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                )}
              </svg>
            </button>

            {/* Video Icon Button */}
            <button
              onClick={handleToggleVideo}
              className={`p-2 sm:p-3 rounded-full transition-all ${
                isVideoEnabled
                  ? 'bg-goldBright text-midnight hover:bg-yellow-400'
                  : 'bg-white/10 text-cloud hover:bg-white/20'
              }`}
              title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Backgrounds Icon Button */}
            <button
              onClick={() => setShowBackgroundPanel(true)}
              className={`p-2 sm:p-3 rounded-full transition-all ${
                showBackgroundPanel
                  ? 'bg-goldBright text-midnight hover:bg-yellow-400'
                  : 'bg-white/10 text-cloud hover:bg-white/20'
              }`}
              title="Background effects"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Camera Switch Button - Mobile/Tablet Only */}
            {(isMobile || isTablet) && (
              <button
                onClick={handleSwitchCamera}
                className="p-2 sm:p-3 rounded-full transition-all bg-white/10 text-cloud hover:bg-white/20"
                title={cameraFacingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}
          </div>
          </div>
        </div>

        {/* Settings Panel - Minimal on Mobile, Full on Desktop */}
        <div className={`${isMobile || isTablet ? 'fixed bottom-0 left-0 right-0' : 'lg:w-80 xl:w-96 border-l'} border-white/10 bg-midnight/95 backdrop-blur-sm ${isMobile || isTablet ? 'p-3 rounded-t-xl' : 'p-4 lg:p-6 overflow-y-auto'}`}>
          <div className={`${isMobile || isTablet ? 'space-y-3' : 'space-y-4'}`}>
            {/* Audio Input - Hidden on Mobile/Tablet */}
            {showDeviceInputs && (
              <div>
                <label className="block text-sm font-medium text-cloud/80 mb-2">
                  Audio Input
                  {deviceErrors.audio && (
                    <span className="ml-2 text-red-400 text-xs">⚠ {deviceErrors.audio}</span>
                  )}
                </label>
                <select
                  value={selectedAudioDevice}
                  onChange={(e) => setSelectedAudioDevice(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-midnight border rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright ${
                    deviceErrors.audio ? 'border-red-500' : 'border-white/10'
                  }`}
                  disabled={audioDevices.length === 0}
                >
                  {audioDevices.length === 0 ? (
                    <option value="">No microphones available</option>
                  ) : (
                    audioDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))
                  )}
                </select>
                {!deviceErrors.audio && audioTrack && (
                  <p className="text-xs text-green-400 mt-1">✓ Active</p>
                )}
              </div>
            )}

            {/* Video Input - Hidden on Mobile/Tablet */}
            {showDeviceInputs && (
              <div>
                <label className="block text-sm font-medium text-cloud/80 mb-2">
                  Video Input
                  {deviceErrors.video && (
                    <span className="ml-2 text-red-400 text-xs">⚠ {deviceErrors.video}</span>
                  )}
                </label>
                <select
                  value={selectedVideoDevice}
                  onChange={(e) => setSelectedVideoDevice(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-midnight border rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright ${
                    deviceErrors.video ? 'border-red-500' : 'border-white/10'
                  }`}
                  disabled={videoDevices.length === 0}
                >
                  {videoDevices.length === 0 ? (
                    <option value="">No cameras available</option>
                  ) : (
                    videoDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))
                  )}
                </select>
                {!deviceErrors.video && videoTrack && (
                  <p className="text-xs text-green-400 mt-1">✓ Active</p>
                )}
              </div>
            )}

            {/* Enable Background Effects - Smaller labels on Mobile/Tablet */}
            <div>
              <div className="flex items-center justify-between">
                <label className={`${isMobile || isTablet ? 'text-xs' : 'text-sm'} font-medium text-cloud`}>
                  Enable Background Effects
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBackgroundEffectsEnabled}
                    onChange={(e) => setIsBackgroundEffectsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`${isMobile || isTablet ? 'w-10 h-5 after:h-4 after:w-4' : 'w-11 h-6 after:h-5 after:w-5'} bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-goldBright rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:transition-all peer-checked:bg-goldBright`}></div>
                </label>
              </div>
              {!isMobile && !isTablet && (
                <p className="text-xs text-cloud/50 mt-1">
                  Use virtual backgrounds, blur, and other effects
                </p>
              )}
            </div>

            {/* Always show this preview - Smaller labels on Mobile/Tablet */}
            <div>
              <div className="flex items-center justify-between">
                <label className={`${isMobile || isTablet ? 'text-xs' : 'text-sm'} font-medium text-cloud`}>
                  Always show this preview
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alwaysShowPreview}
                    onChange={(e) => setAlwaysShowPreview(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`${isMobile || isTablet ? 'w-10 h-5 after:h-4 after:w-4' : 'w-11 h-6 after:h-5 after:w-5'} bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-goldBright rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:transition-all peer-checked:bg-goldBright`}></div>
                </label>
              </div>
              {!isMobile && !isTablet && (
                <p className="text-xs text-cloud/50 mt-1">
                  Show this setup screen before joining meetings
                </p>
              )}
            </div>

            {/* Start/Join Button */}
            <button
              onClick={handleStart}
              disabled={isStarting}
              className={`w-full bg-goldBright text-midnight ${isMobile || isTablet ? 'py-2.5 text-sm' : 'py-3 text-base'} rounded-lg font-semibold hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isMobile || isTablet ? 'mt-2' : 'mt-6'}`}
            >
              {isStarting ? 'Joining...' : (isParticipant ? 'Join Meeting' : 'Start')}
            </button>
          </div>
        </div>
      </div>

      {/* Background Effects Panel */}
          {showBackgroundPanel && (
            <BackgroundEffectsPanel
              onClose={handleClosePanel}
              onBackgroundChange={handlePreMeetingBackgroundChange}
              videoTrack={videoTrack}
              onDeviceChange={(videoDeviceId, audioDeviceId) => {
                if (videoDeviceId && videoDeviceId !== selectedVideoDevice) {
                  setSelectedVideoDevice(videoDeviceId);
                }
                if (audioDeviceId && audioDeviceId !== selectedAudioDevice) {
                  setSelectedAudioDevice(audioDeviceId);
                }
              }}
              audioDevices={audioDevices}
              videoDevices={videoDevices}
              selectedVideoDevice={selectedVideoDevice}
              selectedAudioDevice={selectedAudioDevice}
              savedBackground={previewBackground}
            />
          )}
    </div>
  );
};

export default PreMeetingSetup;

