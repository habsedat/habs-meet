import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLocalVideoTrack, createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';
import { backgroundEngine } from '../video/BackgroundEngine';
import BackgroundEffectsPanel from './BackgroundEffectsPanel';
import toast from 'react-hot-toast';

interface PreMeetingSetupProps {
  roomId: string;
  roomTitle: string;
}

interface MediaDevice {
  deviceId: string;
  label: string;
}

// Also use MediaDeviceInfo for compatibility

const PreMeetingSetup: React.FC<PreMeetingSetupProps> = ({ roomId, roomTitle }) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isBackgroundEffectsEnabled, setIsBackgroundEffectsEnabled] = useState(() => {
    const saved = localStorage.getItem('backgroundEffectsEnabled');
    return saved ? JSON.parse(saved) : false; // OFF by default
  });
  const [savedBackground, setSavedBackground] = useState<{ type: 'none' | 'blur' | 'image' | 'video'; url?: string } | null>(() => {
    const saved = localStorage.getItem('savedBackground');
    return saved ? JSON.parse(saved) : null;
  });
  const [alwaysShowPreview, setAlwaysShowPreview] = useState(() => {
    const saved = localStorage.getItem('alwaysShowPreview');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [audioDevices, setAudioDevices] = useState<MediaDevice[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDevice[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [deviceErrors, setDeviceErrors] = useState<{ video?: string; audio?: string }>({});
  
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  
  // Detect mobile/tablet screen size
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint in Tailwind
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
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
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
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
      if (videoTrack) {
        videoTrack.stop();
        videoTrack.detach();
      }
      if (audioTrack) {
        audioTrack.stop();
        audioTrack.detach();
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
      element.style.objectFit = 'cover';
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

  // Effect to handle background effects toggle and saved background
  useEffect(() => {
    if (!videoTrack) return;
    
    // Save toggle state
    localStorage.setItem('backgroundEffectsEnabled', JSON.stringify(isBackgroundEffectsEnabled));
    
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
        if (isBackgroundEffectsEnabled) {
          // When turned ON: apply saved background or blur
          if (savedBackground) {
            if (savedBackground.type === 'blur') {
              if (backgroundEngine && typeof backgroundEngine.setBlur === 'function') {
                await backgroundEngine.setBlur();
              }
            } else if (savedBackground.type === 'image' && savedBackground.url) {
              if (backgroundEngine && typeof backgroundEngine.setImage === 'function') {
                await backgroundEngine.setImage(savedBackground.url);
              }
            } else if (savedBackground.type === 'video' && savedBackground.url) {
              if (backgroundEngine && typeof backgroundEngine.setVideo === 'function') {
                await backgroundEngine.setVideo(savedBackground.url);
              }
            }
          } else {
            // No saved background - default to blur when toggle is ON
            if (backgroundEngine && typeof backgroundEngine.setBlur === 'function') {
              await backgroundEngine.setBlur();
            }
          }
        } else {
          // When turned OFF: remove background effects
          if (backgroundEngine && typeof backgroundEngine.setNone === 'function') {
            await backgroundEngine.setNone();
          }
        }
      } catch (error) {
        console.error('[BG] Error applying background:', error);
      }
    };
    
    // Wait longer to ensure track is fully ready and attached, especially for external devices
    const timer = setTimeout(() => {
      applyBackground();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [isBackgroundEffectsEnabled, savedBackground, videoTrack]);

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
            video = await createLocalVideoTrack({ 
              deviceId: { exact: selectedVideoDevice },
              resolution: { width: 1280, height: 720 }
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
                video = await createLocalVideoTrack({ 
                  deviceId: { ideal: selectedVideoDevice },
                  resolution: { width: 1280, height: 720 }
                });
              } catch (idealError: any) {
                throw new Error(`Failed to access camera: ${idealError?.message || 'Device unavailable'}`);
              }
            }
          } catch (exactError: any) {
            // If exact fails, try ideal constraint (less strict)
            if (exactError.name !== 'NotAllowedError' && exactError.name !== 'NotFoundError') {
              try {
                video = await createLocalVideoTrack({ 
                  deviceId: { ideal: selectedVideoDevice },
                  resolution: { width: 1280, height: 720 }
                });
              } catch (idealError: any) {
                // Try with just deviceId as string (fallback)
                try {
                  video = await createLocalVideoTrack({ 
                    deviceId: selectedVideoDevice,
                    resolution: { width: 1280, height: 720 }
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
          // No device selected - use default (facingMode for mobile, or default for desktop)
          try {
            video = await createLocalVideoTrack({
              facingMode: 'user',
              resolution: { width: 1280, height: 720 }
            });
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

  const handleStart = async () => {
    setIsStarting(true);
    try {
      localStorage.setItem('alwaysShowPreview', JSON.stringify(alwaysShowPreview));
      
      // Save pre-meeting settings for room
      const settings = {
        videoDeviceId: selectedVideoDevice || null,
        audioDeviceId: selectedAudioDevice || null,
        videoEnabled: isVideoEnabled !== false,
        audioEnabled: isMicEnabled !== false,
        backgroundEffectsEnabled: isBackgroundEffectsEnabled === true,
        savedBackground: (() => {
          try {
            const raw = localStorage.getItem('savedBackground');
            return raw ? JSON.parse(raw) : savedBackground;
          } catch { return savedBackground; }
        })(),
      };
      localStorage.setItem('preMeetingSettings', JSON.stringify(settings));
      
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

      const handleBackgroundChange = async (type: 'none' | 'blur' | 'image' | 'video', url?: string) => {
        if (!videoTrack) return;

        try {
          // Validate backgroundEngine is available
          if (!backgroundEngine) {
            console.error('[BG] Background engine is not available');
            toast.error('Background effects are not available');
            return;
          }

          // persist selection in localStorage
          if (type === 'none') {
            setSavedBackground(null);
            localStorage.removeItem('savedBackground');
          } else if (type === 'blur') {
            const backgroundToSave = { type: 'blur' as const };
            setSavedBackground(backgroundToSave);
            localStorage.setItem('savedBackground', JSON.stringify(backgroundToSave));
          } else {
            const backgroundToSave = { type, url };
            setSavedBackground(backgroundToSave);
            localStorage.setItem('savedBackground', JSON.stringify(backgroundToSave));
          }

          // ensure feature is ON so processor stays attached
          if (!isBackgroundEffectsEnabled) setIsBackgroundEffectsEnabled(true);

          // Apply (keeping your swapped none/blur behavior)
          // Note: Each method (setBlur, setNone, setImage, setVideo) will handle init internally
          if (type === 'none') {
            await backgroundEngine.setBlur?.();
          } else if (type === 'blur') {
            await backgroundEngine.setNone?.();
          } else if (type === 'image' && url) {
            await backgroundEngine.setImage?.(url);
          } else if (type === 'video' && url) {
            await backgroundEngine.setVideo?.(url); // uses the new robust loader
          }
        } catch (error) {
          console.error('[BG] Error setting background:', error);
          toast.error('Failed to apply background effect');
        }
      };

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight via-techBlue to-violetDeep flex items-center justify-center p-2 sm:p-4">
      {/* Compact Modal */}
      <div className="bg-midnight/98 backdrop-blur-lg rounded-xl w-full max-w-4xl border border-white/10 overflow-hidden shadow-2xl max-h-[95vh] sm:max-h-none">
        {/* Compact Header */}
        <div className="bg-midnight/90 border-b border-white/10 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 bg-goldBright rounded flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 sm:w-4 sm:h-4 md:w-5 md:h-5 text-midnight" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            </div>
            <h1 className="text-xs sm:text-xs md:text-sm font-semibold text-cloud truncate">{roomTitle}</h1>
          </div>
          {/* Hide X button on mobile, show on desktop */}
          <button
            onClick={() => navigate('/home')}
            className={`text-cloud/50 hover:text-cloud transition-colors p-1 ${isMobile ? 'hidden' : ''}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row overflow-y-auto max-h-[calc(95vh-60px)] sm:max-h-none">
          {/* Left Panel - Compact Video Preview */}
          <div className="lg:w-2/3 p-3 sm:p-4 md:p-6 flex flex-col">
            <div 
              ref={containerRef}
              className="bg-black rounded-lg overflow-hidden mb-2 sm:mb-3 relative aspect-video w-full"
            >
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-midnight/80 flex items-center justify-center z-10">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-cloud/60 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p className="text-cloud/60 text-sm">Camera is off</p>
                  </div>
                </div>
              )}
            </div>

            {/* Compact Control Buttons */}
            <div className="flex space-x-2 sm:space-x-3 justify-center">
              <button
                onClick={handleToggleMic}
                className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  isMicEnabled
                    ? 'bg-white/10 text-cloud hover:bg-white/20'
                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isMicEnabled ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  )}
                </svg>
                <span>Audio</span>
              </button>

              <button
                onClick={handleToggleVideo}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isVideoEnabled
                    ? 'bg-goldBright text-midnight hover:bg-yellow-400'
                    : 'bg-white/10 text-cloud hover:bg-white/20'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Video</span>
              </button>

              <button
                onClick={() => setShowBackgroundPanel(true)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  showBackgroundPanel
                    ? 'bg-goldBright text-midnight hover:bg-yellow-400'
                    : 'bg-white/10 text-cloud hover:bg-white/20'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Backgrounds</span>
              </button>
            </div>
          </div>

          {/* Right Panel - Compact Settings */}
          <div className="lg:w-1/3 border-t lg:border-t-0 lg:border-l border-white/10 p-3 sm:p-4 bg-midnight/50">
            <div className="space-y-3 sm:space-y-4">
              {/* Audio Input */}
              <div>
                <label className="block text-xs font-medium text-cloud/80 mb-1.5">
                  Audio Input
                  {deviceErrors.audio && (
                    <span className="ml-2 text-red-400 text-xs">⚠ {deviceErrors.audio}</span>
                  )}
                </label>
                <select
                  value={selectedAudioDevice}
                  onChange={(e) => setSelectedAudioDevice(e.target.value)}
                  className={`w-full px-3 py-1.5 text-sm bg-midnight border rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright ${
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

              {/* Video Input */}
              <div>
                <label className="block text-xs font-medium text-cloud/80 mb-1.5">
                  Video Input
                  {deviceErrors.video && (
                    <span className="ml-2 text-red-400 text-xs">⚠ {deviceErrors.video}</span>
                  )}
                </label>
                <select
                  value={selectedVideoDevice}
                  onChange={(e) => setSelectedVideoDevice(e.target.value)}
                  className={`w-full px-3 py-1.5 text-sm bg-midnight border rounded-lg text-cloud focus:outline-none focus:ring-2 focus:ring-goldBright ${
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

              {/* Enable Background Effects */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-cloud">
                    Enable Background Effects
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isBackgroundEffectsEnabled}
                      onChange={(e) => setIsBackgroundEffectsEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-goldBright rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-goldBright"></div>
                  </label>
                </div>
                <p className="text-xs text-cloud/50">
                  Use virtual backgrounds, blur, and other effects
                </p>
              </div>

              {/* Always show this preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-cloud">
                    Always show this preview
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alwaysShowPreview}
                      onChange={(e) => setAlwaysShowPreview(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-goldBright rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-goldBright"></div>
                  </label>
                </div>
                <p className="text-xs text-cloud/50">
                  Show this setup screen before joining meetings
                </p>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStart}
                disabled={isStarting}
                className="w-full bg-goldBright text-midnight py-2.5 rounded-lg font-semibold hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-4"
              >
                {isStarting ? 'Starting...' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Background Effects Panel */}
          {showBackgroundPanel && (
            <BackgroundEffectsPanel
              onClose={handleClosePanel}
              onBackgroundChange={handleBackgroundChange}
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
              savedBackground={savedBackground}
            />
          )}
    </div>
  );
};

export default PreMeetingSetup;

