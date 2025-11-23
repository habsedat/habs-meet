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
  private currentVideoBlobUrl?: string | null = null; // Track current video blob URL for cleanup
  private currentImageLoadAbortController: AbortController | null = null; // Cancel in-flight image loads
  private isSettingImage: boolean = false; // Prevent concurrent setImage calls

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
        }, 3000); // Increased timeout

        const checkState = () => {
          if (!track || !track.mediaStream) {
            clearTimeout(timeout);
            reject(new Error('Track or mediaStream is null'));
            return;
          }
          const currentTracks = track.mediaStream.getVideoTracks();
          if (currentTracks && currentTracks.length > 0) {
            if (currentTracks[0].readyState === 'live') {
              clearTimeout(timeout);
              resolve();
            } else if (currentTracks[0].readyState === 'ended') {
              clearTimeout(timeout);
              reject(new Error('Track ended while waiting'));
            } else {
              setTimeout(checkState, 100); // Increased interval
            }
          } else {
            clearTimeout(timeout);
            reject(new Error('Video tracks disappeared'));
          }
        };
        
        setTimeout(checkState, 100);
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
      // ✅ CRITICAL: No delays - apply immediately
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
      
      // Set processor IMMEDIATELY - no animation frame delays
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
        
        // ✅ CRITICAL: Set processor IMMEDIATELY - no delays
        if (!this.track) {
          this.processor = null;
          return;
        }
        
        // Final check
        const finalTracks = this.track.mediaStream?.getVideoTracks();
        if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
          this.processor = null;
          return;
        }
        
        // Ensure processor is valid
        if (!processor || typeof processor !== 'object') {
          this.processor = null;
          return;
        }
        
        // Set processor IMMEDIATELY
        const setResult = this.track.setProcessor(processor);
        
        // If setProcessor returns a promise, handle it
        if (setResult && typeof setResult.then === 'function') {
          setResult.catch((_setError: any) => {
            // Handle promise rejection (init errors happen here)
            this.processor = null;
          });
          await setResult;
        }
        
        console.log('[BG] ✅ Blur applied INSTANTLY');
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
      return; // Just return, don't throw
    }

    // Basic validation - don't block if track exists
    if (!this.track.mediaStream) {
      console.warn('[BG] Track has no media stream');
      return;
    }

    const videoTracks = this.track.mediaStream.getVideoTracks();
    if (videoTracks.length === 0 || videoTracks[0].readyState === 'ended') {
      console.warn('[BG] Track is ended');
      return; // Just return, don't throw
    }
    
    // Cancel any in-flight image load
    if (this.currentImageLoadAbortController) {
      this.currentImageLoadAbortController.abort();
      this.currentImageLoadAbortController = null;
    }
    
    // Prevent concurrent setImage calls
    if (this.isSettingImage) {
      console.log('[BG] setImage already in progress, cancelling previous and starting new');
      // Cancel previous and proceed immediately - no delay
    }
    
    this.isSettingImage = true;
    const abortController = new AbortController();
    this.currentImageLoadAbortController = abortController;
    
    // Stop any video updates if switching from video background
    this.stopVideoUpdates();
    
    // Clear previous processor FIRST - ensure it's fully cleared before loading new image
    try {
      if (this.processor) {
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
          try {
            await this.track.setProcessor(undefined as any);
            // No delay - proceed immediately
          } catch (e) {
            // Ignore errors
          }
        }
        this.processor = null;
      }
    } catch {}
    
    // Store the new URL we're trying to set - don't revoke old one until new one is successfully applied
    let newImageBlobUrl: string | null = null;
    let oldImageBlobUrl: string | null = this.bgImageUrl || null;
    
    try {
      // Check if operation was cancelled
      if (abortController.signal.aborted) {
        console.log('[BG] Image load cancelled');
        this.isSettingImage = false;
        return;
      }
      
      // Check if URL is from Firebase Storage (may be cross-project)
      const isFirebaseStorageUrl = url.includes('firebasestorage.googleapis.com') || url.includes('firebase.storage');
      
      let imageBlobUrl: string = url; // Default to original URL
      
      if (isFirebaseStorageUrl) {
        // For Firebase Storage URLs, use Image element with crossOrigin first
        // This works better than fetch for CORS issues
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        try {
          // Try loading image directly first (works if CORS is configured)
          await new Promise<void>((resolve, reject) => {
            // Check if cancelled before starting
            if (abortController.signal.aborted) {
              reject(new Error('Cancelled'));
              return;
            }
            
            const timeout = setTimeout(() => {
              reject(new Error('Image load timeout'));
            }, 10000); // 10 second timeout
            
            img.onload = () => {
              // Check if cancelled
              if (abortController.signal.aborted) {
                clearTimeout(timeout);
                reject(new Error('Cancelled'));
                return;
              }
              
              clearTimeout(timeout);
              // Create canvas and convert to blob URL to avoid CORS issues
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                  if (abortController.signal.aborted) {
                    reject(new Error('Cancelled'));
                    return;
                  }
                  if (blob) {
                    imageBlobUrl = URL.createObjectURL(blob);
                    newImageBlobUrl = imageBlobUrl; // Store for later assignment
                    console.log('[BG] Successfully loaded image via canvas (CORS-safe)');
                    resolve();
                  } else {
                    // Fallback: use image directly if canvas conversion fails
                    imageBlobUrl = url;
                    newImageBlobUrl = url; // Store original URL
                    resolve();
                  }
                }, 'image/jpeg', 0.95);
              } else {
                // Fallback: use image directly if canvas fails
                imageBlobUrl = url;
                newImageBlobUrl = url; // Store original URL
                resolve();
              }
            };
            
            img.onerror = (err) => {
              clearTimeout(timeout);
              if (abortController.signal.aborted) {
                reject(new Error('Cancelled'));
                return;
              }
              console.warn('[BG] Image load failed, trying fetch fallback:', err);
              reject(new Error('Image load failed'));
            };
            
            // Listen for abort
            abortController.signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              img.src = ''; // Stop loading
              reject(new Error('Cancelled'));
            });
            
            // Add cache-busting to URL
            const urlWithCacheBust = url.includes('?') 
              ? `${url}&t=${Date.now()}` 
              : `${url}?t=${Date.now()}`;
            img.src = urlWithCacheBust;
          });
        } catch (imgError: any) {
          // Check if cancelled
          if (abortController.signal.aborted || imgError.message === 'Cancelled') {
            throw imgError;
          }
          
          // If image element fails, try fetch as last resort
          console.warn('[BG] Image element method failed, trying fetch:', imgError.message);
          try {
            const urlWithCacheBust = url.includes('?') 
              ? `${url}&t=${Date.now()}` 
              : `${url}?t=${Date.now()}`;
            
            const res = await fetch(urlWithCacheBust, {
              mode: 'cors',
              cache: 'no-cache',
              signal: abortController.signal, // Support cancellation
            });
            
            if (!res.ok) {
              throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);
            }
            
            const blob = await res.blob();
            
            // Check if cancelled after fetch
            if (abortController.signal.aborted) {
              throw new Error('Cancelled');
            }
            
            imageBlobUrl = URL.createObjectURL(blob);
            newImageBlobUrl = imageBlobUrl; // Store for later assignment
            console.log('[BG] Successfully loaded image via fetch fallback');
          } catch (fetchError: any) {
            if (abortController.signal.aborted || fetchError.name === 'AbortError') {
              throw new Error('Cancelled');
            }
            console.error('[BG] All image loading methods failed:', fetchError);
            // Last resort: use URL directly (will fail if CORS not configured, but worth trying)
            imageBlobUrl = url;
            newImageBlobUrl = url; // Store original URL
            console.warn('[BG] Using URL directly as last resort - CORS may prevent this from working');
          }
        }
      } else {
        // Not a Firebase Storage URL - use directly
        newImageBlobUrl = url;
      }
      
      // Check if cancelled before proceeding
      if (abortController.signal.aborted) {
        if (newImageBlobUrl && newImageBlobUrl.startsWith('blob:') && newImageBlobUrl !== oldImageBlobUrl) {
          URL.revokeObjectURL(newImageBlobUrl);
        }
        this.isSettingImage = false;
        return;
      }
      
      // Ensure we have a valid URL
      if (!newImageBlobUrl) {
        throw new Error('Failed to get valid image URL');
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      const loaded = new Promise<void>((res, rej) => {
        if (abortController.signal.aborted) {
          rej(new Error('Cancelled'));
          return;
        }
        
        img.onload = () => {
          if (abortController.signal.aborted) {
            rej(new Error('Cancelled'));
            return;
          }
          res();
        };
        img.onerror = (e) => rej(e);
        
        // Listen for abort
        abortController.signal.addEventListener('abort', () => {
          img.src = '';
          rej(new Error('Cancelled'));
        }, { once: true });
      });
      img.src = newImageBlobUrl;
      await loaded;
      
      // Check if cancelled after image loaded
      if (abortController.signal.aborted) {
        if (newImageBlobUrl && newImageBlobUrl.startsWith('blob:') && newImageBlobUrl !== oldImageBlobUrl) {
          URL.revokeObjectURL(newImageBlobUrl);
        }
        this.isSettingImage = false;
        return;
      }

      // Quick check - if track ended or cancelled, just return
      if (abortController.signal.aborted) {
        if (newImageBlobUrl && newImageBlobUrl.startsWith('blob:') && newImageBlobUrl !== oldImageBlobUrl) {
          URL.revokeObjectURL(newImageBlobUrl);
        }
        this.isSettingImage = false;
        return;
      }
      
      const videoTracksCheck = this.track.mediaStream?.getVideoTracks();
      if (!videoTracksCheck || videoTracksCheck.length === 0 || videoTracksCheck[0].readyState === 'ended') {
        if (newImageBlobUrl && newImageBlobUrl.startsWith('blob:') && newImageBlobUrl !== oldImageBlobUrl) {
          URL.revokeObjectURL(newImageBlobUrl);
        }
        this.isSettingImage = false;
        return;
      }

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
        
        // Clean up image reference to prevent memory leaks
        img.src = '';
        
        // Ensure newImageBlobUrl is not null
        if (!newImageBlobUrl) {
          throw new Error('Failed to get valid image URL');
        }
        
        // Use the blob URL we created (or create new one from canvas blob)
        // If newImageBlobUrl is already a blob URL, use it; otherwise create one from the canvas blob
        const imageUrl: string = newImageBlobUrl.startsWith('blob:') ? newImageBlobUrl : URL.createObjectURL(blob);
        
        // Check if cancelled before creating processor
        if (abortController.signal.aborted) {
          if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
            URL.revokeObjectURL(imageUrl);
          }
          this.isSettingImage = false;
          return;
        }
        
        // Create processor - just do it, don't over-validate
        let processor;
        try {
          processor = VirtualBackground(imageUrl);
          if (!processor || typeof processor !== 'object') {
            if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
              URL.revokeObjectURL(imageUrl);
            }
            this.isSettingImage = false;
            return; // Just return if processor creation failed
          }
        } catch (createError: any) {
          console.error('[BG] Error creating image processor:', createError);
          if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
            URL.revokeObjectURL(imageUrl);
          }
          this.isSettingImage = false;
          return; // Just return, don't throw
        }
        
        // NOW that we're about to successfully apply, revoke the old blob URL
        if (oldImageBlobUrl && oldImageBlobUrl.startsWith('blob:') && oldImageBlobUrl !== imageUrl) {
          URL.revokeObjectURL(oldImageBlobUrl);
        }
        
        // Check if cancelled before setting processor
        if (abortController.signal.aborted) {
          if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
            URL.revokeObjectURL(imageUrl);
          }
          this.isSettingImage = false;
          return;
        }
        
        // Store the new blob URL - this keeps it alive while the background is active
        this.bgImageUrl = imageUrl;
        
        // Set processor with comprehensive error handling
        try {
          // Store processor reference before setting
          this.processor = processor;
          
          // Set processor with comprehensive error handling
          // Use requestAnimationFrame to ensure DOM/track is fully ready
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(async () => {
                // Check if cancelled
                if (abortController.signal.aborted) {
                  this.processor = null;
                  if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
                    URL.revokeObjectURL(imageUrl);
                  }
                  this.bgImageUrl = oldImageBlobUrl; // Restore old
                  this.isSettingImage = false;
                  resolve();
                  return;
                }
                
                if (!this.track) {
                  this.processor = null;
                  // Don't revoke - keep URL in case we need to retry
                  this.isSettingImage = false;
                  resolve();
                  return;
                }
                
                // Final comprehensive check
                const finalTracks = this.track.mediaStream?.getVideoTracks();
                if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
                  this.processor = null;
                  // Don't revoke - keep URL in case we need to retry
                  this.isSettingImage = false;
                  resolve();
                  return;
                }
                
                // Ensure processor is valid
                if (!processor || typeof processor !== 'object') {
                  this.processor = null;
                  // Don't revoke - keep URL in case we need to retry
                  this.isSettingImage = false;
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
                      if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
                        URL.revokeObjectURL(imageUrl);
                      }
                      this.bgImageUrl = oldImageBlobUrl; // Restore old
                      // Silently ignore init/undefined errors
                    });
                    await setResult;
                  }
                  
                  // Success - clear abort controller and reset flag
                  this.currentImageLoadAbortController = null;
                  this.isSettingImage = false;
                  console.log('[BG] Image background applied successfully');
                  resolve();
                } catch (setError: any) {
                  // Clear processor reference if setting failed
                  this.processor = null;
                  if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
                    URL.revokeObjectURL(imageUrl);
                  }
                  this.bgImageUrl = oldImageBlobUrl; // Restore old
                  this.isSettingImage = false;
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
          // Restore old image URL if we had one
          this.bgImageUrl = oldImageBlobUrl;
          this.isSettingImage = false;
          throw error; // Re-throw so caller knows it failed
        }
        
        // Don't revoke URL here - it needs to stay valid while the background is active
      } else {
        // Check if cancelled
        if (abortController.signal.aborted) {
          this.isSettingImage = false;
          return;
        }
        
        // Wait for track to be fully stable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if cancelled after wait
        if (abortController.signal.aborted) {
          this.isSettingImage = false;
          return;
        }
        
        // Validate track is still valid before creating processor
        const currentTracksBefore = this.track.mediaStream?.getVideoTracks();
        if (!currentTracksBefore || currentTracksBefore.length === 0 || currentTracksBefore[0].readyState === 'ended') {
          console.warn('[BG] Track ended before creating image processor');
          this.isSettingImage = false;
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
          this.isSettingImage = false;
          return;
        }
        
        // Check if cancelled before proceeding
        if (abortController.signal.aborted) {
          this.isSettingImage = false;
          return;
        }
        
        // Double-check track is still valid
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (!currentTracks || currentTracks.length === 0 || currentTracks[0].readyState === 'ended') {
          console.warn('[BG] Track ended before setting image processor');
          this.isSettingImage = false;
          return;
        }
        
        // Set processor with comprehensive error handling
        try {
          // Ensure processor is valid object
          if (!processor || typeof processor !== 'object') {
            this.isSettingImage = false;
            return;
          }
          
          // Final track validation
          const finalCheck = this.track.mediaStream?.getVideoTracks();
          if (!finalCheck || finalCheck.length === 0 || finalCheck[0].readyState === 'ended') {
            this.isSettingImage = false;
            return;
          }
          
          // Store processor reference before setting
          this.processor = processor;
          
          // Set processor with comprehensive error handling
          // Use requestAnimationFrame to ensure DOM/track is fully ready
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(async () => {
                // Check if cancelled
                if (abortController.signal.aborted) {
                  this.processor = null;
                  this.isSettingImage = false;
                  resolve();
                  return;
                }
                
                if (!this.track) {
                  this.processor = null;
                  this.isSettingImage = false;
                  resolve();
                  return;
                }
                
                // Final comprehensive check
                const finalTracks = this.track.mediaStream?.getVideoTracks();
                if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
                  this.processor = null;
                  this.isSettingImage = false;
                  resolve();
                  return;
                }
                
                // Ensure processor is valid
                if (!processor || typeof processor !== 'object') {
                  this.processor = null;
                  this.isSettingImage = false;
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
                  
                  // Success - clear abort controller and reset flag
                  this.currentImageLoadAbortController = null;
                  this.isSettingImage = false;
                  console.log('[BG] Image background applied successfully (non-Firebase URL)');
                  resolve();
                } catch (setError: any) {
                  // Clear processor reference if setting failed
                  this.processor = null;
                  this.isSettingImage = false;
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
          this.isSettingImage = false;
        }
      }
    } catch (error: any) {
      // Only log non-track-related and non-cancellation errors
      const errorMsg = error?.message || '';
      if (!errorMsg.includes('Track ended') && 
          !errorMsg.includes('not ready') && 
          !errorMsg.includes('Cancelled') &&
          !errorMsg.includes('aborted')) {
        console.error('[BG] Error setting image:', error);
      }
      try {
        // Only try to clear processor if track is still valid
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
          this.track.setProcessor(undefined as any);
        }
      } catch (clearError) {
        // Silently ignore cleanup errors
      } finally {
        // Always reset flags
        this.isSettingImage = false;
        this.currentImageLoadAbortController = null;
      }
    }
  }

  private async loadVideoElement(url: string): Promise<HTMLVideoElement> {
    // Revoke previous object URL if any
    if (this.bgVideoUrl) {
      URL.revokeObjectURL(this.bgVideoUrl);
      this.bgVideoUrl = null;
    }

    // Validate URL
    if (!url || url.trim() === '' || url.includes('example.com')) {
      throw new Error('Video URL is not available. Please provide a valid video URL.');
    }

    const el = document.createElement('video');
    el.muted = true;          // required for autoplay
    el.loop = true;
    el.playsInline = true;
    el.preload = 'auto';
    
    // Check if URL is from Firebase Storage
    const isFirebaseStorageUrl = url.includes('firebasestorage.googleapis.com') || url.includes('firebase.storage');
    
    if (isFirebaseStorageUrl) {
      // For Firebase Storage URLs, use Firebase SDK to get blob directly
      // This avoids CORS issues since SDK handles authentication properly
      try {
        // Extract path from Firebase Storage URL
        // URL format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
        const urlObj = new URL(url);
        const pathMatch = urlObj.pathname.match(/\/o\/(.+)$/);
        if (!pathMatch) {
          throw new Error('Invalid Firebase Storage URL format');
        }
        
        // Decode the path (it's URL encoded)
        const storagePath = decodeURIComponent(pathMatch[1].replace(/%2F/g, '/'));
        
        // Use Firebase Storage SDK to get blob (handles auth automatically)
        // This will use the current project's storage, which may be different from the URL's bucket
        // If the file doesn't exist in current project, fall back to direct fetch
        const { getStorage, ref, getBlob } = await import('firebase/storage');
        const storage = getStorage();
        const storageRef = ref(storage, storagePath);
        
        try {
          const blob = await getBlob(storageRef);
          // Create blob URL - no CORS issues since it's same-origin
          const objectUrl = URL.createObjectURL(blob);
          el.crossOrigin = 'anonymous'; // Safe to set for blob URLs
          el.src = objectUrl;
          this.bgVideoUrl = objectUrl;
          // Success - video element is set up, continue to wait for load
        } catch (storageError: any) {
          // If file doesn't exist in current project's storage, fall back to direct fetch
          console.warn('[BG] File not found in current project storage, trying direct fetch:', storageError.message);
          // Continue to fallback below
          el.crossOrigin = 'anonymous';
          el.src = url;
          this.bgVideoUrl = null;
        }
      } catch (error: any) {
        // Fallback: try direct fetch without credentials
        console.warn('[BG] Firebase SDK failed, trying direct fetch:', error.message);
        try {
          const res = await fetch(url, {
            mode: 'cors',
            // NO credentials - Firebase Storage doesn't support credentials mode
          });
          if (!res.ok) {
            throw new Error(`Video fetch failed: ${res.status} ${res.statusText}`);
          }
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          el.crossOrigin = 'anonymous';
          el.src = objectUrl;
          this.bgVideoUrl = objectUrl;
        } catch (fetchError: any) {
          throw new Error(`Failed to load video from Firebase Storage: ${fetchError.message}. Please ensure you have access to the file.`);
        }
      }
    } else {
      // For other URLs, fetch as blob to avoid CORS issues
      el.crossOrigin = 'anonymous'; // allow WebGL to sample it
      
      try {
        // Fetch → blob → object URL (avoids taint)
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) {
          throw new Error(`Video fetch failed: ${res.status} ${res.statusText}`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        el.src = objectUrl;
        this.bgVideoUrl = objectUrl;
      } catch (error: any) {
        // If fetch fails, try using URL directly as fallback
        console.warn('[BG] Fetch failed, trying direct URL:', error.message);
        el.crossOrigin = 'anonymous';
        el.src = url;
        this.bgVideoUrl = null;
      }
    }

    try {
      // Wait for it to be actually decodable
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Video load timeout'));
        }, 30000); // 30 second timeout

        const onLoaded = () => {
          clearTimeout(timeout);
          resolve();
        };
        const onError = (e: any) => {
          clearTimeout(timeout);
          reject(new Error(`Video load error: ${e.message || 'Unknown error'}`));
        };
        el.addEventListener('loadeddata', onLoaded, { once: true });
        el.addEventListener('error', onError, { once: true });
      });

      // CRITICAL: Force video to play immediately and continuously
      // Try multiple times to ensure it starts playing
      let playAttempts = 0;
      const maxPlayAttempts = 5;
      while (playAttempts < maxPlayAttempts && (el.paused || el.ended)) {
        try {
          await el.play();
          console.log(`[BG] Video play attempt ${playAttempts + 1} succeeded`);
          break;
        } catch (error: any) {
          playAttempts++;
          console.warn(`[BG] Video play attempt ${playAttempts} failed:`, error.message);
          if (playAttempts < maxPlayAttempts) {
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }
      
      // Verify video is actually playing
      if (el.paused) {
        console.warn('[BG] Video is still paused after all play attempts');
      } else {
        console.log('[BG] Video is playing successfully');
      }

      return el;
    } catch (error: any) {
      // Clean up on error
      if (this.bgVideoUrl) {
        URL.revokeObjectURL(this.bgVideoUrl);
        this.bgVideoUrl = null;
      }
      throw error;
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
      
      // Hide video element but keep it in DOM and playing
      vid.style.display = 'none';
      vid.style.width = '1px';
      vid.style.height = '1px';
      vid.style.opacity = '0';
      vid.style.position = 'absolute';
      vid.style.pointerEvents = 'none';
      vid.style.top = '-9999px'; // Move off-screen
      vid.style.left = '-9999px';
      
      // Add to DOM (hidden) to ensure it works properly and keeps playing
      document.body.appendChild(vid);
      
      // CRITICAL: Ensure video plays continuously
      // Force play immediately and keep it playing
      const ensurePlaying = async () => {
        if (vid.paused && !vid.ended) {
          try {
            await vid.play();
            console.log('[BG] Video resumed playback');
          } catch (e) {
            console.warn('[BG] Failed to resume video:', e);
          }
        }
      };
      
      // Ensure playing immediately
      await ensurePlaying();
      
      // Set up event listeners to keep video playing
      vid.addEventListener('pause', async () => {
        if (!vid.ended) {
          console.log('[BG] Video paused, resuming...');
          await ensurePlaying();
        }
      });
      
      vid.addEventListener('ended', async () => {
        if (vid.loop) {
          vid.currentTime = 0;
          await ensurePlaying();
        }
      });
      
      // Also listen for timeupdate to ensure it's actually playing
      vid.addEventListener('timeupdate', () => {
        if (vid.paused && !vid.ended) {
          ensurePlaying();
        }
      });
      
      // Periodic check to ensure video is playing (every 500ms)
      const playCheckInterval = setInterval(() => {
        if (vid && !vid.paused && !vid.ended) {
          // Video is playing, good
        } else if (vid && !vid.ended) {
          // Video should be playing but isn't - force play
          ensurePlaying();
        } else {
          // Video ended or removed - clear interval
          clearInterval(playCheckInterval);
        }
      }, 500);
      
      // Store interval for cleanup
      if (!this.playCheckIntervalId) {
        this.playCheckIntervalId = playCheckInterval as any;
      }

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
      
      // Ensure video has crossOrigin set before drawing to canvas
      if (!vid.crossOrigin) {
        vid.crossOrigin = 'anonymous';
        // Reload video if crossOrigin was just set
        const currentSrc = vid.src;
        vid.src = '';
        vid.src = currentSrc;
        // Wait for video to reload
        await new Promise((resolve) => {
          vid.addEventListener('loadeddata', resolve, { once: true });
          vid.addEventListener('error', resolve, { once: true });
        });
      }
      
      ctx.drawImage(vid, drawX, drawY, drawWidth, drawHeight);
      
      // Create blob from first frame
      const blob = await new Promise<Blob>((resolve, reject) => {
        try {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error('Failed to create blob - canvas may be tainted'));
          }, 'image/jpeg', 0.95);
        } catch (error: any) {
          reject(new Error(`Canvas toBlob error: ${error.message}`));
        }
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
      // Update frequently for smooth video background (every 100ms = ~10fps)
      let lastUpdateTime = 0;
      const UPDATE_THROTTLE = 100; // Update every 100ms (10fps) for smooth video playback
      let updateCount = 0;
      const MAX_UPDATES = 3000; // Maximum updates before stopping (5 minutes at 10fps)
      
      // Log initial setup
      console.log('[BG] Starting video frame update loop, throttle:', UPDATE_THROTTLE, 'ms');
      
      // Define updateVideoFrame in outer scope so it has access to canvas, vid, ctx, etc
      const updateVideoFrame = async () => {
        // Throttle is handled by setInterval, but add safety check
        const now = Date.now();
        if (now - lastUpdateTime < UPDATE_THROTTLE) {
          return;
        }
        lastUpdateTime = now;
        
        // Safety check: prevent infinite loops
        updateCount++;
        if (updateCount > MAX_UPDATES) {
          console.warn('[BG] Maximum video update count reached, stopping updates');
          this.stopVideoUpdates();
          return;
        }
        
        if (!this.track || !vid || !ctx || !this.processor) {
          return;
        }
        
        // CRITICAL: Verify video is actually playing and advancing
        if (vid.paused || vid.ended) {
          console.warn('[BG] Video is paused/ended, skipping frame update');
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
          // Ensure video has crossOrigin set before drawing to canvas
          if (!vid.crossOrigin) {
            vid.crossOrigin = 'anonymous';
          }
          
          // CRITICAL: Check if video time has actually advanced (video is playing)
          const currentTime = vid.currentTime;
          const lastTime = (vid as any).__lastFrameTime || 0;
          
          // Only update if video time has advanced (video is actually playing)
          // Use smaller threshold (0.05 seconds) to allow for frame updates
          if (Math.abs(currentTime - lastTime) < 0.05 && lastTime > 0) {
            // Video time hasn't advanced much - might be paused or stuck
            // But still try to update frame in case it's just slow
            console.log(`[BG] Video time check: current=${currentTime.toFixed(3)}, last=${lastTime.toFixed(3)}, diff=${Math.abs(currentTime - lastTime).toFixed(3)}`);
            
            // If video is definitely paused, try to play it
            if (vid.paused) {
              console.warn('[BG] Video is paused, forcing play');
              try {
                await vid.play();
              } catch (e) {
                console.warn('[BG] Failed to play video:', e);
              }
            }
            
            // Don't skip frame update - still update even if time hasn't changed much
            // This ensures we get frames even if video is slow
          }
          
          // Store current time for next check
          (vid as any).__lastFrameTime = currentTime;
          
          // Draw current video frame to canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(vid, drawX, drawY, drawWidth, drawHeight);
          
          // Create blob from current frame with balanced quality
          const blob = await new Promise<Blob>((resolve, reject) => {
            try {
              canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Failed to create blob - canvas may be tainted'));
              }, 'image/jpeg', 0.8); // Balanced quality for smooth playback
            } catch (error: any) {
              reject(new Error(`Canvas toBlob error: ${error.message}`));
            }
          });

          // Clean up previous blob URL before creating new one
          if (this.currentVideoBlobUrl) {
            try {
              URL.revokeObjectURL(this.currentVideoBlobUrl);
            } catch (e) {
              // Ignore cleanup errors
            }
          }

          const newImageUrl = URL.createObjectURL(blob);
          this.currentVideoBlobUrl = newImageUrl;

          // Validate track is still valid
          const tracksCheck = this.track.mediaStream?.getVideoTracks();
          if (!tracksCheck || tracksCheck.length === 0 || tracksCheck[0].readyState === 'ended') {
            URL.revokeObjectURL(newImageUrl);
            this.currentVideoBlobUrl = null;
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
                this.currentVideoBlobUrl = null;
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

                // CRITICAL: Update processor reference immediately
                this.processor = newProcessor;
                
                // Log successful frame update for debugging
                if (updateCount % 10 === 0) { // Log every 10th frame to avoid spam
                  console.log(`[BG] Frame ${updateCount} updated successfully, video time: ${vid.currentTime.toFixed(2)}s`);
                }

                // Revoke old blob URL after delay (but keep currentBlobUrl for next cleanup)
                // Don't revoke immediately - let it be cleaned up on next update
              } catch (setError) {
                console.error('[BG] Error setting processor:', setError);
                URL.revokeObjectURL(newImageUrl);
                this.currentVideoBlobUrl = null;
                // Silently handle set processor errors
              }
            } else {
              console.error('[BG] Failed to create processor from blob URL');
              URL.revokeObjectURL(newImageUrl);
              this.currentVideoBlobUrl = null;
            }
          } catch (processorError) {
            console.error('[BG] Processor creation error:', processorError);
            URL.revokeObjectURL(newImageUrl);
            this.currentVideoBlobUrl = null;
            // Silently handle processor creation errors
          }
        } catch (error) {
          // Silently handle errors
        }
      };

      // Use setInterval for consistent frame updates
      // Update frequently to show smooth video playback
      const videoUpdateInterval = setInterval(async () => {
        if (!this.track || !vid) {
          clearInterval(videoUpdateInterval);
          this.stopVideoUpdates();
          return;
        }

        // CRITICAL: Ensure video is playing before updating frames
        if (vid.paused && !vid.ended) {
          try {
            await vid.play();
            console.log('[BG] Video resumed in update loop');
          } catch (e) {
            console.warn('[BG] Failed to play video in update loop:', e);
          }
        }

        // Only update if video is actually playing and has loaded enough data
        if (vid && !vid.paused && !vid.ended && vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
          // Video is playing - update frame
          await updateVideoFrame();
        } else {
          // Video not ready - log status and try to ensure it's playing
          if (vid) {
            console.log(`[BG] Video not ready: paused=${vid.paused}, ended=${vid.ended}, readyState=${vid.readyState}, dimensions=${vid.videoWidth}x${vid.videoHeight}`);
            if (!vid.ended) {
              try {
                await vid.play();
                console.log('[BG] Forced video play in update loop');
              } catch (e) {
                console.warn('[BG] Failed to play video:', e);
              }
            }
          }
        }
      }, UPDATE_THROTTLE); // Update at throttled rate (100ms = 10fps for smooth video)

      // Store interval ID for cleanup (use existing updateIntervalId property)
      this.updateIntervalId = videoUpdateInterval;

      // Video play enforcement is already handled above with the playCheckInterval

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

              // Video update interval is already started above

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
      const errorMessage = error?.message || 'Unknown error';
      console.error('[BG] Error setting video background:', errorMessage);
      
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
      // Clean up video blob URL
      if (this.currentVideoBlobUrl) {
        try {
          URL.revokeObjectURL(this.currentVideoBlobUrl);
          this.currentVideoBlobUrl = null;
        } catch (e) {
          // Ignore cleanup errors
        }
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
    // Clean up any video-specific blob URLs
    if (this.currentVideoBlobUrl) {
      try {
        URL.revokeObjectURL(this.currentVideoBlobUrl);
        this.currentVideoBlobUrl = null;
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  private releaseSources() {
    // Cancel any in-flight image loads
    if (this.currentImageLoadAbortController) {
      this.currentImageLoadAbortController.abort();
      this.currentImageLoadAbortController = null;
    }
    
    // Reset image setting flag
    this.isSettingImage = false;
    
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

