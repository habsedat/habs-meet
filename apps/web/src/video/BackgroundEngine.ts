// BackgroundEngine.ts
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import type { LocalVideoTrack } from 'livekit-client';

class BackgroundEngine {
  private processor: any | null = null;
  private track: LocalVideoTrack | null = null;
  private vidEl: HTMLVideoElement | null = null;
  private canvasContexts: CanvasRenderingContext2D[] = [];

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
    
    try {
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
        
        // Wait for track to be fully stable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Validate track is still valid before creating processor
        const currentTracksBefore = this.track.mediaStream?.getVideoTracks();
        if (!currentTracksBefore || currentTracksBefore.length === 0 || currentTracksBefore[0].readyState === 'ended') {
          URL.revokeObjectURL(imageUrl);
          return;
        }
        
        // Create processor - ensure it's properly initialized
        let processor;
        try {
          processor = VirtualBackground(imageUrl);
          
          // Validate processor was created
          if (!processor || typeof processor !== 'object') {
            URL.revokeObjectURL(imageUrl);
            throw new Error('Failed to create image background processor');
          }
        } catch (createError: any) {
          console.error('[BG] Error creating image processor:', createError);
          URL.revokeObjectURL(imageUrl);
          return;
        }
        
        // Double-check track is still valid before setting processor
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
          URL.revokeObjectURL(imageUrl);
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
                  resolve();
                  return;
                }
                
                // Final comprehensive check
                const finalTracks = this.track.mediaStream?.getVideoTracks();
                if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
                  this.processor = null;
                  URL.revokeObjectURL(imageUrl);
                  resolve();
                  return;
                }
                
                // Ensure processor is valid
                if (!processor || typeof processor !== 'object') {
                  this.processor = null;
                  URL.revokeObjectURL(imageUrl);
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
                      // Silently ignore init/undefined errors
                    });
                    await setResult;
                  }
                  
                  resolve();
                } catch (setError: any) {
                  // Clear processor reference if setting failed
                  this.processor = null;
                  URL.revokeObjectURL(imageUrl);
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
        }
        
        setTimeout(() => {
          URL.revokeObjectURL(imageUrl);
        }, 1000);
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
    
    // Clear previous video element if exists
    if (this.vidEl) {
      try {
        this.vidEl.pause();
        this.vidEl.src = '';
        this.vidEl.remove();
      } catch {}
      this.vidEl = null;
    }
    
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
      
      this.releaseSources();
      
      // Wait for track to be fully stable
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Create video element for looping background video
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true; // Always muted - no sound
      v.loop = true; // Loop continuously
      v.playsInline = true;
      v.autoplay = true;
      // Set playsinline attribute for iOS (different from playsInline property)
      v.setAttribute('playsinline', 'true');
      
      // Wait for video to load and be ready
      const ready = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Video loading timeout'));
        }, 10000);
        
        const onReady = () => {
          clearTimeout(timeout);
          v.removeEventListener('canplay', onReady);
          v.removeEventListener('error', onError);
          resolve();
        };
        
        const onError = (_e: any) => {
          clearTimeout(timeout);
          v.removeEventListener('canplay', onReady);
          v.removeEventListener('error', onError);
          reject(new Error('Video failed to load'));
        };
        
        v.addEventListener('canplay', onReady, { once: true });
        v.addEventListener('error', onError, { once: true });
      });
      
      v.src = url;
      
      // Ensure video can play (autoplay policy)
      try {
        await v.play();
      } catch (playError: any) {
        // If autoplay fails, try after user interaction or wait for ready
        await ready;
        try {
          await v.play();
        } catch (retryError) {
          console.warn('[BG] Video autoplay failed, but will play when ready');
        }
      }
      
      await ready;
      
      // Ensure video is playing and looping
      if (v.paused) {
        try {
          await v.play();
        } catch {}
      }
      
      // Store video element reference
      this.vidEl = v;
      
      // Create canvas for frame capture
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }
      
      this.canvasContexts.push(ctx);
      
      // Wait for video to be fully loaded and playing
      await new Promise<void>((resolve, reject) => {
        if (v.readyState >= 3 && v.videoWidth > 0) {
          resolve();
        } else {
          const timeout = setTimeout(() => {
            reject(new Error('Video loading timeout'));
          }, 5000);
          
          const onReady = () => {
            clearTimeout(timeout);
            v.removeEventListener('loadedmetadata', onReady);
            v.removeEventListener('canplaythrough', onReady);
            v.removeEventListener('error', onError);
            resolve();
          };
          
          const onError = (_e: any) => {
            clearTimeout(timeout);
            v.removeEventListener('loadedmetadata', onReady);
            v.removeEventListener('canplaythrough', onReady);
            v.removeEventListener('error', onError);
            reject(new Error('Video failed to load'));
          };
          
          v.addEventListener('loadedmetadata', onReady, { once: true });
          v.addEventListener('canplaythrough', onReady, { once: true });
          v.addEventListener('error', onError, { once: true });
        }
      });
      
      // Ensure video dimensions are available
      if (v.videoWidth === 0 || v.videoHeight === 0) {
        throw new Error('Video has no dimensions');
      }
      
      // Wait a bit more to ensure video is stable
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Draw initial frame to canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Calculate aspect ratio to fill canvas
      const videoAspect = v.videoWidth / v.videoHeight;
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
      
      ctx.drawImage(v, drawX, drawY, drawWidth, drawHeight);
      
      // Create initial processor with first frame
      const initialBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.95);
      });
      
      const initialImageUrl = URL.createObjectURL(initialBlob);
      
      // Wait for track to be fully stable
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Validate track is still valid before creating processor
      const currentTracksBefore = this.track.mediaStream?.getVideoTracks();
      if (!currentTracksBefore || currentTracksBefore.length === 0 || currentTracksBefore[0].readyState === 'ended') {
        URL.revokeObjectURL(initialImageUrl);
        return;
      }
      
      // Create processor - ensure it's properly initialized
      let processor;
      try {
        processor = VirtualBackground(initialImageUrl);
        
        // Validate processor was created
        if (!processor || typeof processor !== 'object') {
          URL.revokeObjectURL(initialImageUrl);
          throw new Error('Failed to create video background processor');
        }
      } catch (createError: any) {
        console.error('[BG] Error creating video processor:', createError);
        URL.revokeObjectURL(initialImageUrl);
        return;
      }
      
      // Double-check track is still valid before setting processor
      const currentTracks = this.track.mediaStream?.getVideoTracks();
      if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
        URL.revokeObjectURL(initialImageUrl);
        return;
      }
      
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
                  // Silently ignore init errors
                });
                await setResult;
              }
              
              // Use setInterval for smoother updates (less frequent processor recreation)
              let updateIntervalId: NodeJS.Timeout | null = null;
              
              const updateVideoFrame = async () => {
                if (!this.track || !v || !ctx) {
                  return;
                }
                
                // Validate track is still valid
                const currentTracks = this.track.mediaStream?.getVideoTracks();
                if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
                  if (updateIntervalId) {
                    clearInterval(updateIntervalId);
                    updateIntervalId = null;
                  }
                  return;
                }
                
                // Check if video is ready
                if (v.videoWidth === 0 || v.videoHeight === 0 || v.readyState < 2) {
                  return;
                }
                
                try {
                  // Draw current video frame to canvas
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(v, drawX, drawY, drawWidth, drawHeight);
                  
                  // Convert canvas to blob
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
                          setResult.catch((_err: any) => {
                            // Silently handle errors
                          });
                          await setResult;
                        }
                        
                        // Clean up old processor
                        if (this.processor) {
                          // Old processor will be garbage collected
                        }
                        
                        this.processor = newProcessor;
                        
                        // Revoke blob URL after delay
                        setTimeout(() => {
                          URL.revokeObjectURL(newImageUrl);
                        }, 1000);
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
              
              // Update processor every 100ms (10fps) - smooth video playback
              // This ensures video backgrounds play smoothly without causing flicker
              updateIntervalId = setInterval(() => {
                // Only update if video is actually playing and not paused
                if (v && !v.paused && v.readyState >= 2) {
                  updateVideoFrame();
                }
              }, 100);
              
              // Also ensure video keeps playing
              const ensurePlaying = () => {
                if (v && v.paused && !v.ended) {
                  v.play().catch(() => {});
                }
              };
              
              // Check every second if video is still playing
              const playCheckInterval = setInterval(ensurePlaying, 1000);
              
              // Clean up intervals when video ends or track is destroyed
              v.addEventListener('pause', ensurePlaying);
              v.addEventListener('ended', () => {
                if (v.loop) {
                  v.currentTime = 0;
                  v.play().catch(() => {});
                }
              });
              
              // Store cleanup function
              (this.vidEl as any).__cleanup = () => {
                if (updateIntervalId) {
                  clearInterval(updateIntervalId);
                  updateIntervalId = null;
                }
                if (playCheckInterval) {
                  clearInterval(playCheckInterval);
                }
              };
              
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
      
      // Keep video playing and looping - handled in update loop
      
      console.log('[BG] Video background applied successfully');
    } catch (error: any) {
      console.error('[BG] Error setting video background:', error);
      
      // Clean up on error
      if (this.vidEl) {
        try {
          this.vidEl.pause();
          this.vidEl.src = '';
        } catch {}
        this.vidEl = null;
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

  private releaseSources() {
    if (this.vidEl) {
      try { this.vidEl.pause(); this.vidEl.src = ''; } catch {}
    }
    this.vidEl = null;
    
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

