// BackgroundEngine.ts
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import type { LocalVideoTrack } from 'livekit-client';

class BackgroundEngine {
  private processor: any | null = null;
  private track: LocalVideoTrack | null = null;
  private vidEl: HTMLVideoElement | null = null;
  private canvasContexts: CanvasRenderingContext2D[] = [];
  private updateIntervalId: NodeJS.Timeout | null = null;
  private playCheckIntervalId: NodeJS.Timeout | null = null;
  private animationFrameId: number | null = null;
  private bgVideo?: HTMLVideoElement | null = null;
  private bgVideoUrl?: string | null = null;
  private bgImageUrl?: string | null = null;

  async init(track: LocalVideoTrack) {
    // Validate track is ready and not ended
    if (!track || !track.mediaStream) {
      console.warn('[BG] Track not ready for initialization');
      throw new Error('Track not ready');
    }

    const videoTracks = track.mediaStream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.warn('[BG] No video tracks in stream');
      throw new Error('No video tracks in stream');
    }

    const videoTrack = videoTracks[0];
    if (videoTrack.readyState === 'ended') {
      console.warn('[BG] Track is already ended, cannot initialize');
      throw new Error('Track is ended');
    }

    // Wait for track to be in 'live' state if it's not already
    if (videoTrack.readyState !== 'live') {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Track did not become live in time'));
        }, 2000);

        const checkState = () => {
          const currentTracks = track.mediaStream?.getVideoTracks();
          if (currentTracks && currentTracks.length > 0) {
            if (currentTracks[0].readyState === 'live') {
              clearTimeout(timeout);
              resolve();
            } else if (currentTracks[0].readyState === 'ended') {
              clearTimeout(timeout);
              reject(new Error('Track ended while waiting'));
            } else {
              setTimeout(checkState, 50);
            }
          } else {
            clearTimeout(timeout);
            reject(new Error('Video tracks disappeared'));
          }
        };
        
        setTimeout(checkState, 50);
      });
    }

    // Clean up previous processor if exists
    if (this.track && this.track !== track) {
      try {
        // Only clean up if the old track is still valid
        const oldTracks = this.track.mediaStream?.getVideoTracks();
        if (oldTracks && oldTracks.length > 0 && oldTracks[0].readyState !== 'ended') {
          await this.setNone();
        }
      } catch (e) {
        console.warn('[BG] Error cleaning up previous track:', e);
      }
    }

    this.track = track;
    
    if (!this.checkWebGLSupport()) {
      console.warn('[BG] WebGL not supported');
    }
    console.log('[BG] Track initialized');
  }

  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return gl !== null;
    } catch (e) {
      return false;
    }
  }

  async setNone() {
    // Clear processor reference first
    this.processor = null;
    
    if (!this.track) {
      this.releaseSources();
      return;
    }
    
    // Validate track is still active
    if (!this.track.mediaStream) {
      this.releaseSources();
      return;
    }

    const videoTracks = this.track.mediaStream.getVideoTracks();
    if (videoTracks.length === 0 || videoTracks[0].readyState === 'ended') {
      this.releaseSources();
      return;
    }

    try {
      // Set processor to undefined to clear it
      const currentTracks = this.track.mediaStream?.getVideoTracks();
      if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
        try {
          this.track.setProcessor(undefined as any);
        } catch (setError) {
          // Ignore errors when clearing processor
        }
      }
    } catch (error) {
      // Silently handle errors
    } finally {
      this.releaseSources();
    }
  }

  async setBlur(blurRadius = 8) {
    if (!this.track) {
      console.warn('[BG] No track available for setBlur');
      return;
    }

    // Validate track is ready
    if (!this.track.mediaStream) {
      console.warn('[BG] Track has no media stream in setBlur');
      return;
    }

    const videoTracks = this.track.mediaStream.getVideoTracks();
    if (videoTracks.length === 0 || videoTracks[0].readyState === 'ended') {
      console.warn('[BG] Track is ended, cannot apply blur');
      return;
    }

    // Stop any video updates if switching from video background
    this.stopVideoUpdates();

    // Clear previous processor first
    try {
      if (this.processor) {
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
          try {
            this.track.setProcessor(undefined as any);
          } catch {}
        }
        this.processor = null;
      }
    } catch {}
    
    this.releaseSources();
    
    try {
      // Wait for track to be fully stable
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Validate track is still valid before creating processor
      const currentTracksBefore = this.track.mediaStream?.getVideoTracks();
      if (!currentTracksBefore || currentTracksBefore.length === 0 || currentTracksBefore[0].readyState === 'ended') {
        console.warn('[BG] Track ended before creating blur processor');
        return;
      }
      
      // Create processor - ensure it's properly initialized
      let processor;
      try {
        processor = BackgroundBlur(blurRadius);
        
        // Validate processor was created and has required methods
        if (!processor || typeof processor !== 'object') {
          throw new Error('Failed to create blur processor');
        }
      } catch (createError: any) {
        console.error('[BG] Error creating blur processor:', createError);
        return;
      }
      
      // Double-check track is still valid before setting processor
      const currentTracks = this.track.mediaStream?.getVideoTracks();
      if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
        console.warn('[BG] Track ended before setting blur processor');
        return;
      }
      
      // Set processor with comprehensive error handling
      try {
        // Ensure processor is valid object with required structure
        if (!processor || typeof processor !== 'object') {
          console.error('[BG] Invalid processor object');
          return;
        }
        
        // Ensure track is still valid
        const finalCheck = this.track.mediaStream?.getVideoTracks();
        if (!finalCheck || finalCheck.length === 0 || finalCheck[0].readyState === 'ended') {
          console.warn('[BG] Track ended before setting processor');
          return;
        }
        
        // Store processor reference before setting
        this.processor = processor;
        
        // Set processor with comprehensive error handling
        // Use requestAnimationFrame to ensure DOM/track is fully ready
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(async () => {
              if (!this.track) {
                this.processor = null;
                resolve();
                return;
              }
              
              // Final comprehensive check
              const finalTracks = this.track.mediaStream?.getVideoTracks();
              if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
                this.processor = null;
                resolve();
                return;
              }
              
              // Ensure processor is valid
              if (!processor || typeof processor !== 'object') {
                this.processor = null;
                resolve();
                return;
              }
              
              try {
                // Set processor - it may return a promise that can reject
                const setResult = this.track.setProcessor(processor);
                
                // If setProcessor returns a promise, handle it
                if (setResult && typeof setResult.then === 'function') {
                  setResult.catch((_setError: any) => {
                    // Handle promise rejection (init errors happen here)
                    this.processor = null;
                    // Silently ignore init/undefined errors
                  });
                  await setResult;
                }
                
                console.log('[BG] Blur applied successfully');
                resolve();
              } catch (setError: any) {
                // Clear processor reference if setting failed
                this.processor = null;
                // Silently handle init/undefined errors
                if (!setError?.message?.includes('init') && 
                    !setError?.message?.includes('undefined') &&
                    !setError?.message?.includes('Cannot read properties')) {
                  console.error('[BG] Error setting blur processor:', setError);
                }
                resolve(); // Always resolve to prevent hanging
              }
            });
          });
        });
      } catch (error: any) {
        console.error('[BG] Unexpected error in setBlur:', error);
        this.processor = null;
      }
    } catch (error) {
      console.error('[BG] Error setting blur:', error);
      try {
        // Only try to clear processor if track is still valid
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
          this.track.setProcessor(undefined as any);
        }
      } catch (clearError) {
        // Silently ignore cleanup errors
      }
    }
  }

  async setImage(url: string) {
    if (!this.track) {
      console.warn('[BG] No track available for setImage');
      return;
    }

    // Validate track is ready
    if (!this.track.mediaStream) {
      console.warn('[BG] Track has no media stream in setImage');
      return;
    }

    const videoTracks = this.track.mediaStream.getVideoTracks();
    if (videoTracks.length === 0 || videoTracks[0].readyState === 'ended') {
      console.warn('[BG] Track is ended, cannot apply image background');
      return;
    }
    
    // Stop any video updates if switching from video background
    this.stopVideoUpdates();
    
    try {
      // Clean up previous image blob URL if exists
      if (this.bgImageUrl) {
        URL.revokeObjectURL(this.bgImageUrl);
        this.bgImageUrl = null;
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      const loaded = new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = (e) => rej(e);
      });
      img.src = url;
      await loaded;

      this.vidEl = null;
      const canvas = document.createElement('canvas');
      const videoWidth = 640;
      const videoHeight = 480;
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const imgAspect = img.width / img.height;
        const canvasAspect = canvas.width / canvas.height;
        
        let drawWidth, drawHeight, drawX, drawY;
        
        if (imgAspect > canvasAspect) {
          drawWidth = canvas.width;
          drawHeight = canvas.width / imgAspect;
          drawX = 0;
          drawY = (canvas.height - drawHeight) / 2;
        } else {
          drawHeight = canvas.height;
          drawWidth = canvas.height * imgAspect;
          drawX = (canvas.width - drawWidth) / 2;
          drawY = 0;
        }
        
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          }, 'image/png');
        });
        
        const imageUrl = URL.createObjectURL(blob);
        this.bgImageUrl = imageUrl; // Store for cleanup
        
        // Wait for track to be fully stable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Validate track is still valid before creating processor
        const currentTracksBefore = this.track.mediaStream?.getVideoTracks();
        if (!currentTracksBefore || currentTracksBefore.length === 0 || currentTracksBefore[0].readyState === 'ended') {
          URL.revokeObjectURL(imageUrl);
          this.bgImageUrl = null;
          return;
        }
        
        // Create processor - ensure it's properly initialized
        let processor;
        try {
          processor = VirtualBackground(imageUrl);
          
          // Validate processor was created
          if (!processor || typeof processor !== 'object') {
            URL.revokeObjectURL(imageUrl);
            this.bgImageUrl = null;
            throw new Error('Failed to create image background processor');
          }
        } catch (createError: any) {
          console.error('[BG] Error creating image processor:', createError);
          URL.revokeObjectURL(imageUrl);
          this.bgImageUrl = null;
          return;
        }
        
        // Double-check track is still valid before setting processor
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
          URL.revokeObjectURL(imageUrl);
          this.bgImageUrl = null;
          return;
        }
        
        // Set processor with comprehensive error handling
        try {
          // Store processor reference before setting
          this.processor = processor;
          
          // Set processor with comprehensive error handling
          // Use requestAnimationFrame to ensure DOM/track is fully ready
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(async () => {
                if (!this.track) {
                  this.processor = null;
                  URL.revokeObjectURL(imageUrl);
                  this.bgImageUrl = null;
                  resolve();
                  return;
                }
                
                // Final comprehensive check
                const finalTracks = this.track.mediaStream?.getVideoTracks();
                if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
                  this.processor = null;
                  URL.revokeObjectURL(imageUrl);
                  this.bgImageUrl = null;
                  resolve();
                  return;
                }
                
                // Ensure processor is valid
                if (!processor || typeof processor !== 'object') {
                  this.processor = null;
                  URL.revokeObjectURL(imageUrl);
                  this.bgImageUrl = null;
                  resolve();
                  return;
                }
                
                try {
                  // Set processor - it may return a promise that can reject
                  const setResult = this.track.setProcessor(processor);
                  
                  // If setProcessor returns a promise, handle it
                  if (setResult && typeof setResult.then === 'function') {
                    setResult.catch((_setError: any) => {
                      // Handle promise rejection (init errors happen here)
                      this.processor = null;
                      URL.revokeObjectURL(imageUrl);
                      this.bgImageUrl = null;
                      // Silently ignore init/undefined errors
                    });
                    await setResult;
                  }
                  
                  resolve();
                } catch (setError: any) {
                  // Clear processor reference if setting failed
                  this.processor = null;
                  URL.revokeObjectURL(imageUrl);
                  this.bgImageUrl = null;
                  // Silently handle init/undefined errors
                  if (!setError?.message?.includes('init') && 
                      !setError?.message?.includes('undefined') &&
                      !setError?.message?.includes('Cannot read properties')) {
                    console.error('[BG] Error setting image processor:', setError);
                  }
                  resolve();
                }
              });
            });
          });
        } catch (error: any) {
          console.error('[BG] Unexpected error in setImage:', error);
          this.processor = null;
          URL.revokeObjectURL(imageUrl);
          this.bgImageUrl = null;
        }
        
        // Don't revoke URL here - it needs to stay valid while the background is active
      } else {
        // Wait for track to be fully stable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Validate track is still valid before creating processor
        const currentTracksBefore = this.track.mediaStream?.getVideoTracks();
        if (!currentTracksBefore || currentTracksBefore.length === 0 || currentTracksBefore[0].readyState === 'ended') {
          console.warn('[BG] Track ended before creating image processor');
          return;
        }
        
        // Create processor - ensure it's properly initialized
        let processor;
        try {
          processor = VirtualBackground(url);
          
          // Validate processor was created and has required methods
          if (!processor || typeof processor !== 'object') {
            throw new Error('Failed to create image background processor');
          }
        } catch (createError: any) {
          console.error('[BG] Error creating image processor:', createError);
          return;
        }
        
        // Double-check track is still valid
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
          console.warn('[BG] Track ended before setting image processor');
          return;
        }
        
        // Set processor with comprehensive error handling
        try {
          // Ensure processor is valid object
          if (!processor || typeof processor !== 'object') {
            return;
          }
          
          // Final track validation
          const finalCheck = this.track.mediaStream?.getVideoTracks();
          if (!finalCheck || finalCheck.length === 0 || finalCheck[0].readyState === 'ended') {
            return;
          }
          
          // Store processor reference before setting
          this.processor = processor;
          
          // Set processor with comprehensive error handling
          // Use requestAnimationFrame to ensure DOM/track is fully ready
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(async () => {
                if (!this.track) {
                  this.processor = null;
                  resolve();
                  return;
                }
                
                // Final comprehensive check
                const finalTracks = this.track.mediaStream?.getVideoTracks();
                if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
                  this.processor = null;
                  resolve();
                  return;
                }
                
                // Ensure processor is valid
                if (!processor || typeof processor !== 'object') {
                  this.processor = null;
                  resolve();
                  return;
                }
                
                try {
                  // Set processor - it may return a promise that can reject
                  const setResult = this.track.setProcessor(processor);
                  
                  // If setProcessor returns a promise, handle it
                  if (setResult && typeof setResult.then === 'function') {
                    setResult.catch((_setError: any) => {
                      // Handle promise rejection (init errors happen here)
                      this.processor = null;
                      // Silently ignore init/undefined errors
                    });
                    await setResult;
                  }
                  
                  resolve();
                } catch (setError: any) {
                  // Clear processor reference if setting failed
                  this.processor = null;
                  // Silently handle init/undefined errors
                  if (!setError?.message?.includes('init') && 
                      !setError?.message?.includes('undefined') &&
                      !setError?.message?.includes('Cannot read properties')) {
                    console.error('[BG] Error setting image processor:', setError);
                  }
                  resolve();
                }
              });
            });
          });
        } catch (error: any) {
          console.error('[BG] Unexpected error in setImage:', error);
          this.processor = null;
        }
      }
    } catch (error) {
      console.error('[BG] Error setting image:', error);
      try {
        // Only try to clear processor if track is still valid
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
          this.track.setProcessor(undefined as any);
        }
      } catch (clearError) {
        // Silently ignore cleanup errors
      }
    }
  }

  private async loadVideoElement(url: string): Promise<HTMLVideoElement> {
    // Revoke previous object URL if any
    if (this.bgVideoUrl) {
      URL.revokeObjectURL(this.bgVideoUrl);
      this.bgVideoUrl = null;
    }

    const el = document.createElement('video');
    el.muted = true;          // required for autoplay
    el.loop = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous'; // allow WebGL to sample it

    // Fetch → blob → object URL (avoids taint)
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`Video fetch failed: ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    el.src = objectUrl;
    this.bgVideoUrl = objectUrl;

    // Wait for it to be actually decodable
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => resolve();
      const onError = () => reject(new Error('video load error'));
      el.addEventListener('loadeddata', onLoaded, { once: true });
      el.addEventListener('error', onError, { once: true });
    });

    // Try to start (some browsers return a promise)
    try { 
      await el.play(); 
    } catch { 
      /* already muted, retry */ 
      try { 
        await el.play(); 
      } catch {} 
    }

    return el;
  }

  async setVideo(url: string) {
    if (!this.track) {
      console.warn('[BG] No track available for setVideo');
      return;
    }

    // Validate track is ready
    if (!this.track.mediaStream) {
      console.warn('[BG] Track has no media stream in setVideo');
      return;
    }

    const videoTracks = this.track.mediaStream.getVideoTracks();
    if (videoTracks.length === 0 || videoTracks[0].readyState === 'ended') {
      console.warn('[BG] Track is ended, cannot apply video background');
      return;
    }

    // Clean up previous video background
    if (this.bgVideo) {
      if (this.bgVideoUrl) {
        URL.revokeObjectURL(this.bgVideoUrl);
        this.bgVideoUrl = null;
      }
      try {
        this.bgVideo.pause();
        this.bgVideo.src = '';
        if (this.bgVideo.parentNode) {
          this.bgVideo.parentNode.removeChild(this.bgVideo);
        }
      } catch {}
      this.bgVideo = null;
    }

    // Stop any previous updates
    this.stopVideoUpdates();
    this.releaseSources();

    try {
      // Clear previous processor first
      try {
        if (this.processor) {
          const currentTracks = this.track.mediaStream?.getVideoTracks();
          if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
            try {
              this.track.setProcessor(undefined as any);
            } catch {}
          }
          this.processor = null;
        }
      } catch {}

      // Load video element with proper CORS handling
      const vid = await this.loadVideoElement(url);
      this.bgVideo = vid;
      
      // Re-validate track is still valid after loading video (may have taken time)
      if (!this.track || !this.track.mediaStream) {
        console.warn('[BG] Track lost during video load, aborting');
        if (this.bgVideo) {
          try {
            this.bgVideo.pause();
            this.bgVideo.src = '';
            if (this.bgVideo.parentNode) {
              this.bgVideo.parentNode.removeChild(this.bgVideo);
            }
          } catch {}
          this.bgVideo = null;
        }
        if (this.bgVideoUrl) {
          URL.revokeObjectURL(this.bgVideoUrl);
          this.bgVideoUrl = null;
        }
        return;
      }
      
      const trackCheck = this.track.mediaStream.getVideoTracks();
      if (trackCheck.length === 0 || trackCheck[0].readyState === 'ended') {
        console.warn('[BG] Track ended during video load, aborting');
        if (this.bgVideo) {
          try {
            this.bgVideo.pause();
            this.bgVideo.src = '';
            if (this.bgVideo.parentNode) {
              this.bgVideo.parentNode.removeChild(this.bgVideo);
            }
          } catch {}
          this.bgVideo = null;
        }
        if (this.bgVideoUrl) {
          URL.revokeObjectURL(this.bgVideoUrl);
          this.bgVideoUrl = null;
        }
        return;
      }
      
      // Hide video element
      vid.style.display = 'none';
      vid.style.width = '1px';
      vid.style.height = '1px';
      vid.style.opacity = '0';
      vid.style.position = 'absolute';
      vid.style.pointerEvents = 'none';
      
      // Add to DOM (hidden) to ensure it works properly
      document.body.appendChild(vid);

      // Wait for track to be fully stable
      await new Promise(resolve => setTimeout(resolve, 100));

      // VirtualBackground only accepts URLs, not video elements
      // We'll use the first frame approach and avoid frequent processor replacements
      // to prevent VideoFrame garbage collection warnings
      
      // Create processor with first frame from video
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create canvas context for video processor');
      }
      
      // Wait for video to have dimensions
      await new Promise((resolve) => {
        const checkReady = () => {
          if (vid.videoWidth > 0 && vid.videoHeight > 0) {
            resolve(undefined);
          } else {
            setTimeout(checkReady, 50);
          }
        };
        checkReady();
      });
      
      // Draw first frame to canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const videoAspect = vid.videoWidth / vid.videoHeight;
      const canvasAspect = canvas.width / canvas.height;
      let drawWidth, drawHeight, drawX, drawY;
      
      if (videoAspect > canvasAspect) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / videoAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      } else {
        drawHeight = canvas.height;
        drawWidth = canvas.height * videoAspect;
        drawX = (canvas.width - drawWidth) / 2;
        drawY = 0;
      }
      
      ctx.drawImage(vid, drawX, drawY, drawWidth, drawHeight);
      
      // Create blob from first frame
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.95);
      });
      
      const initialImageUrl = URL.createObjectURL(blob);
      const processor = VirtualBackground(initialImageUrl);
      
      if (!processor || typeof processor !== 'object') {
        URL.revokeObjectURL(initialImageUrl);
        throw new Error('Failed to create video background processor');
      }
      
      // Double-check track is still valid before setting processor
      const currentTracks = this.track.mediaStream?.getVideoTracks();
      if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
        URL.revokeObjectURL(initialImageUrl);
        throw new Error('Track ended before setting video processor');
      }

      // Store canvas reference for frame updates
      this.canvasContexts.push(ctx);
      
      // Frame update loop for smooth video playback
      // Use throttling to prevent VideoFrame GC warnings
      let lastUpdateTime = 0;
      const UPDATE_THROTTLE = 200; // Update every 200ms (5fps) to reduce GC issues
      
      // Define updateVideoFrame in outer scope so it has access to canvas, vid, ctx, etc
      const updateVideoFrame = async () => {
        // Throttle updates
        const now = Date.now();
        if (now - lastUpdateTime < UPDATE_THROTTLE) {
          return;
        }
        lastUpdateTime = now;
        
        if (!this.track || !vid || !ctx || !this.processor) {
          return;
        }

        // Validate track is still valid
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
          this.stopVideoUpdates();
          return;
        }

        // Check if video is ready
        if (vid.videoWidth === 0 || vid.videoHeight === 0 || vid.readyState < 2) {
          return;
        }

        try {
          // Draw current video frame to canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(vid, drawX, drawY, drawWidth, drawHeight);
          
          // Create blob from current frame
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => {
              if (b) resolve(b);
              else reject(new Error('Failed to create blob'));
            }, 'image/jpeg', 0.95);
          });

          const newImageUrl = URL.createObjectURL(blob);

          // Validate track is still valid
          const tracksCheck = this.track.mediaStream?.getVideoTracks();
          if (!tracksCheck || tracksCheck.length === 0 || tracksCheck[0].readyState === 'ended') {
            URL.revokeObjectURL(newImageUrl);
            this.stopVideoUpdates();
            return;
          }

          // Create new processor with current frame
          try {
            const newProcessor = VirtualBackground(newImageUrl);

            if (newProcessor && typeof newProcessor === 'object') {
              // Validate track one more time
              const finalTracks = this.track.mediaStream?.getVideoTracks();
              if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState === 'ended') {
                URL.revokeObjectURL(newImageUrl);
                return;
              }

              // Set new processor (replace old one smoothly)
              try {
                const setResult = this.track.setProcessor(newProcessor);

                if (setResult && typeof setResult.then === 'function') {
                  await setResult.catch((_err: any) => {
                    // Silently handle errors
                  });
                }

                this.processor = newProcessor;

                // Revoke old blob URL after short delay
                setTimeout(() => {
                  URL.revokeObjectURL(newImageUrl);
                }, 100);
              } catch (setError) {
                URL.revokeObjectURL(newImageUrl);
                // Silently handle set processor errors
              }
            } else {
              URL.revokeObjectURL(newImageUrl);
            }
          } catch (processorError) {
            URL.revokeObjectURL(newImageUrl);
            // Silently handle processor creation errors
          }
        } catch (error) {
          // Silently handle errors
        }
      };

      // Use requestAnimationFrame for smooth updates
      const animate = async () => {
        if (!this.track || !vid) {
          this.stopVideoUpdates();
          return;
        }

        // Only update if video is actually playing and not paused
        if (vid && !vid.paused && vid.readyState >= 2) {
          await updateVideoFrame();
        }

        // Schedule next frame
        this.animationFrameId = requestAnimationFrame(animate);
      };

      // Also ensure video keeps playing
      const ensurePlaying = () => {
        if (vid && vid.paused && !vid.ended) {
          vid.play().catch(() => {});
        }
      };

      // Set processor with comprehensive error handling
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(async () => {
            if (!this.track) {
              URL.revokeObjectURL(initialImageUrl);
              resolve();
              return;
            }

            // Final comprehensive check
            const finalTracks = this.track.mediaStream?.getVideoTracks();
            if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
              URL.revokeObjectURL(initialImageUrl);
              resolve();
              return;
            }

            // Ensure processor is valid
            if (!processor || typeof processor !== 'object') {
              URL.revokeObjectURL(initialImageUrl);
              resolve();
              return;
            }

            try {
              // Store processor reference before setting
              this.processor = processor;

              // Set processor - it may return a promise that can reject
              const setResult = this.track.setProcessor(processor);

              // If setProcessor returns a promise, handle it
              if (setResult && typeof setResult.then === 'function') {
                setResult.catch((_setError: any) => {
                  // Handle promise rejection (init errors happen here)
                  this.processor = null;
                  URL.revokeObjectURL(initialImageUrl);
                });
                await setResult;
              }

              // Start animation loop
              this.animationFrameId = requestAnimationFrame(animate);

              // Check every second if video is still playing
              this.playCheckIntervalId = setInterval(ensurePlaying, 1000);

              // Clean up intervals when video ends or track is destroyed
              vid.addEventListener('pause', ensurePlaying);
              vid.addEventListener('ended', () => {
                if (vid.loop) {
                  vid.currentTime = 0;
                  vid.play().catch(() => {});
                }
              });
              
              console.log('[BG] Video background applied successfully with frame updates');
              resolve();
            } catch (setError: any) {
              // Clear processor reference if setting failed
              this.processor = null;
              URL.revokeObjectURL(initialImageUrl);
              // Silently handle init/undefined errors
              if (!setError?.message?.includes('init') && 
                  !setError?.message?.includes('undefined') &&
                  !setError?.message?.includes('Cannot read properties')) {
                console.error('[BG] Error setting video processor:', setError);
              }
              resolve();
            }
          });
        });
      });
    } catch (error: any) {
      console.error('[BG] Error setting video background:', error);
      
      // Clean up on error
      if (this.bgVideo) {
        if (this.bgVideoUrl) {
          URL.revokeObjectURL(this.bgVideoUrl);
          this.bgVideoUrl = null;
        }
        try {
          this.bgVideo.pause();
          this.bgVideo.src = '';
          if (this.bgVideo.parentNode) {
            this.bgVideo.parentNode.removeChild(this.bgVideo);
          }
        } catch {}
        this.bgVideo = null;
      }

      try {
        // Only try to clear processor if track is still valid
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
          this.track.setProcessor(undefined as any);
        }
      } catch (clearError) {
        // Silently ignore cleanup errors
      }

      this.processor = null;
    }
  }

  private stopVideoUpdates() {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    if (this.playCheckIntervalId) {
      clearInterval(this.playCheckIntervalId);
      this.playCheckIntervalId = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private releaseSources() {
    // Clear intervals
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    if (this.playCheckIntervalId) {
      clearInterval(this.playCheckIntervalId);
      this.playCheckIntervalId = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Clean up video element
    if (this.vidEl) {
      try {
        // Call cleanup function if exists
        if ((this.vidEl as any).__cleanup) {
          (this.vidEl as any).__cleanup();
        }
        this.vidEl.pause();
        this.vidEl.src = '';
        // Remove from DOM if it exists
        if (this.vidEl.parentNode) {
          this.vidEl.parentNode.removeChild(this.vidEl);
        }
      } catch {}
      this.vidEl = null;
    }
    
    // Clean up background video element
    if (this.bgVideo) {
      if (this.bgVideoUrl) {
        URL.revokeObjectURL(this.bgVideoUrl);
        this.bgVideoUrl = null;
      }
      try {
        this.bgVideo.pause();
        this.bgVideo.src = '';
        if (this.bgVideo.parentNode) {
          this.bgVideo.parentNode.removeChild(this.bgVideo);
        }
      } catch {}
      this.bgVideo = null;
    }
    
    // Clean up background image blob URL
    if (this.bgImageUrl) {
      URL.revokeObjectURL(this.bgImageUrl);
      this.bgImageUrl = null;
    }
    
    // Clean up canvas contexts
    this.canvasContexts.forEach(ctx => {
      try {
        const canvas = ctx.canvas;
        canvas.width = 0;
        canvas.height = 0;
      } catch (e) {}
    });
    this.canvasContexts = [];
  }
}

export const backgroundEngine = new BackgroundEngine();

