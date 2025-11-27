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
  private isSettingImage: boolean = false; // Track if setImage is in progress
  private pendingImageUrl: string | null = null; // Track the URL that should be applied

  async init(track: LocalVideoTrack) {
    // ✅ CRITICAL: If already initialized with same track, skip
    if (this.track === track && this.track) {
      console.log('[BG] Already initialized with this track, skipping');
      return;
    }
    
    // ✅ CRITICAL: Quick validation - don't block
    if (!track || !track.mediaStream) {
      throw new Error('Track not ready');
    }

    const videoTracks = track.mediaStream.getVideoTracks();
    if (videoTracks.length === 0 || videoTracks[0].readyState === 'ended') {
      throw new Error('Track not ready');
    }

    // ✅ CRITICAL: Don't wait for track to become live - just check and proceed
    if (videoTracks[0].readyState !== 'live') {
      // Quick check - if not live, wait max 500ms then proceed anyway
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 500);
        const checkState = () => {
          const currentTracks = track.mediaStream?.getVideoTracks();
          if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState === 'live') {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkState, 50);
          }
        };
        checkState();
      });
    }

    // ✅ CRITICAL: Clean up previous track quickly - don't wait
    if (this.track && this.track !== track) {
      try {
        const oldTracks = this.track.mediaStream?.getVideoTracks();
        if (oldTracks && oldTracks.length > 0 && oldTracks[0].readyState !== 'ended') {
          // Fire and forget - don't wait
          this.track.setProcessor(undefined as any).catch(() => {});
        }
      } catch (e) {
        // Ignore
      }
    }

    this.track = track;
    console.log('[BG] Track initialized');
  }

  checkWebGLSupport(): boolean {
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
    console.log('[BG] setImage called for URL:', url, 'hasTrack:', !!this.track);
    
    if (!this.track) {
      console.error('[BG] ❌ No track available for setImage - track not initialized');
      throw new Error('Track not initialized. Please wait for camera to be ready.');
    }

    if (!this.track.mediaStream) {
      console.error('[BG] ❌ Track has no media stream');
      throw new Error('Track media stream not available');
    }

    const videoTracks = this.track.mediaStream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.error('[BG] ❌ No video tracks in stream');
      throw new Error('No video tracks available');
    }
    
    if (videoTracks[0].readyState === 'ended') {
      console.error('[BG] ❌ Track is ended');
      throw new Error('Video track has ended');
    }
    
    // ✅ CRITICAL: Don't wait - just check and proceed
    if (videoTracks[0].readyState !== 'live') {
      console.warn('[BG] ⚠️ Track not live yet, proceeding anyway');
      // Don't wait - proceed immediately to prevent blocking
    }
    
    console.log('[BG] ✅ Track validated, proceeding with setImage for URL:', url);
    
    // ✅ CRITICAL FIX: Cancel ALL previous operations immediately (like Zoom)
    if (this.currentImageLoadAbortController) {
      this.currentImageLoadAbortController.abort();
      this.currentImageLoadAbortController = null;
    }
    
    // ✅ CRITICAL FIX: Clear processor immediately - don't wait (like Zoom)
    if (this.processor && this.track) {
      try {
        const currentTracks = this.track.mediaStream?.getVideoTracks();
        if (currentTracks && currentTracks.length > 0 && currentTracks[0].readyState !== 'ended') {
          // Fire and forget - don't wait for cleanup
          this.track.setProcessor(undefined as any).catch(() => {});
        }
      } catch (e) {
        // Ignore
      }
      this.processor = null;
    }
    
    // ✅ CRITICAL FIX: Clear old image URL immediately
    if (this.bgImageUrl && this.bgImageUrl !== url) {
      if (this.bgImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(this.bgImageUrl);
      }
      this.bgImageUrl = null;
    }
    
    // ✅ CRITICAL FIX: Set flags with THIS URL immediately - this is the source of truth
    this.isSettingImage = true;
    this.pendingImageUrl = url; // This URL is what we want to apply
    const abortController = new AbortController();
    this.currentImageLoadAbortController = abortController;
    
    // Stop any video updates if switching from video background
    this.stopVideoUpdates();
    
    // Store the new URL we're trying to set - don't revoke old one until new one is successfully applied
    let newImageBlobUrl: string | null = null;
    let oldImageBlobUrl: string | null = this.bgImageUrl || null;
    
    try {
      // ✅ CRITICAL: Check if operation was cancelled or URL changed
      if (abortController.signal.aborted || this.pendingImageUrl !== url) {
        console.log('[BG] Image load cancelled or URL changed');
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
            
            // ✅ CRITICAL: Increased timeout to handle network issues (10 seconds)
            // Network can be slow, but we still want reasonable timeout
            const timeout = setTimeout(() => {
              reject(new Error('Image load timeout'));
            }, 10000); // 10 seconds to handle network connectivity issues
            
            img.onload = () => {
              // ✅ CRITICAL: Check if cancelled or URL changed
              if (abortController.signal.aborted || this.pendingImageUrl !== url) {
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
                  // ✅ CRITICAL: Check if cancelled or URL changed
                  if (abortController.signal.aborted || this.pendingImageUrl !== url) {
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
            
            // ✅ CRITICAL: Try cached image first (faster), then cache-bust if needed
            // This helps when network is slow - use cached version if available
            let loadAttempts = 0;
            const maxAttempts = 2;
            
            const tryLoadImage = (useCacheBust: boolean) => {
              if (abortController.signal.aborted || this.pendingImageUrl !== url) {
                clearTimeout(timeout);
                reject(new Error('Cancelled'));
                return;
              }
              
              const imageUrl = useCacheBust && loadAttempts > 0
                ? (url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`)
                : url;
              
              img.src = imageUrl;
              loadAttempts++;
            };
            
            img.onerror = (err) => {
              clearTimeout(timeout);
              if (abortController.signal.aborted || this.pendingImageUrl !== url) {
                reject(new Error('Cancelled'));
                return;
              }
              
              // Retry with cache-bust if we haven't exceeded max attempts
              if (loadAttempts < maxAttempts) {
                console.log(`[BG] Image load attempt ${loadAttempts} failed, retrying with cache-bust...`);
                tryLoadImage(true);
              } else {
                console.warn('[BG] Image load failed after retries, trying fetch fallback:', err);
                reject(new Error('Image load failed'));
              }
            };
            
            // Listen for abort
            abortController.signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              img.src = ''; // Stop loading
              reject(new Error('Cancelled'));
            });
            
            // Start with cached version first
            tryLoadImage(false);
          });
        } catch (imgError: any) {
          // Check if cancelled
          if (abortController.signal.aborted || imgError.message === 'Cancelled') {
            throw imgError;
          }
          
          // If image element fails, try fetch with retry logic
          console.warn('[BG] Image element method failed, trying fetch with retries:', imgError.message);
          
          let fetchAttempts = 0;
          const maxFetchAttempts = 3;
          let lastFetchError: any = null;
          
          while (fetchAttempts < maxFetchAttempts) {
            // Check if cancelled before each attempt
            if (abortController.signal.aborted || this.pendingImageUrl !== url) {
              throw new Error('Cancelled');
            }
            
            try {
              // Try cached first, then cache-bust on retries
              const fetchUrl = fetchAttempts === 0
                ? url // First attempt: use cached
                : (url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`); // Retries: cache-bust
              
              // ✅ CRITICAL: Add timeout to fetch to prevent hanging
              const fetchController = new AbortController();
              const fetchTimeout = setTimeout(() => {
                fetchController.abort();
              }, 10000); // 10 second timeout for fetch
              
              // Combine abort signals
              const combinedSignal = abortController.signal.aborted 
                ? abortController.signal 
                : fetchController.signal;
              
              try {
                const res = await fetch(fetchUrl, {
                  mode: 'cors',
                  cache: fetchAttempts === 0 ? 'default' : 'no-cache', // Use cache on first attempt
                  signal: combinedSignal,
                });
                
                clearTimeout(fetchTimeout);
                
                if (!res.ok) {
                  throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);
                }
                
                const blob = await res.blob();
                
                // Check if cancelled after fetch
                if (abortController.signal.aborted || this.pendingImageUrl !== url) {
                  throw new Error('Cancelled');
                }
                
                imageBlobUrl = URL.createObjectURL(blob);
                newImageBlobUrl = imageBlobUrl; // Store for later assignment
                console.log(`[BG] Successfully loaded image via fetch (attempt ${fetchAttempts + 1})`);
                break; // Success - exit retry loop
              } catch (fetchErr: any) {
                clearTimeout(fetchTimeout);
                if (abortController.signal.aborted || fetchErr.name === 'AbortError' || this.pendingImageUrl !== url) {
                  throw new Error('Cancelled');
                }
                lastFetchError = fetchErr;
                fetchAttempts++;
                
                if (fetchAttempts < maxFetchAttempts) {
                  // Wait before retry (exponential backoff)
                  const retryDelay = Math.min(1000 * Math.pow(2, fetchAttempts - 1), 3000);
                  console.log(`[BG] Fetch attempt ${fetchAttempts} failed, retrying in ${retryDelay}ms...`);
                  await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
              }
            } catch (fetchErr: any) {
              if (abortController.signal.aborted || fetchErr.name === 'AbortError' || fetchErr.message === 'Cancelled') {
                throw new Error('Cancelled');
              }
              lastFetchError = fetchErr;
              fetchAttempts++;
              
              if (fetchAttempts < maxFetchAttempts) {
                const retryDelay = Math.min(1000 * Math.pow(2, fetchAttempts - 1), 3000);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            }
          }
          
          // If all fetch attempts failed, try URL directly as last resort
          if (fetchAttempts >= maxFetchAttempts && !imageBlobUrl) {
            console.error('[BG] All fetch attempts failed, using URL directly as last resort:', lastFetchError);
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
      
      // ✅ CRITICAL: Check if cancelled or URL changed before proceeding
      if (abortController.signal.aborted || this.pendingImageUrl !== url) {
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
        // ✅ CRITICAL: Check if cancelled or URL changed
        if (abortController.signal.aborted || this.pendingImageUrl !== url) {
          rej(new Error('Cancelled'));
          return;
        }
        
        img.onload = () => {
          // ✅ CRITICAL: Check if cancelled or URL changed
          if (abortController.signal.aborted || this.pendingImageUrl !== url) {
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
      
      // ✅ CRITICAL: Check if cancelled or URL changed after image loaded
      if (abortController.signal.aborted || this.pendingImageUrl !== url) {
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
          // ✅ CRITICAL: Try to create processor even with direct URL (last resort)
          // This allows background to apply even if network is slow
          processor = VirtualBackground(imageUrl);
          if (!processor || typeof processor !== 'object') {
            console.error('[BG] Failed to create processor from URL:', imageUrl.substring(0, 50));
            if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
              URL.revokeObjectURL(imageUrl);
            }
            this.isSettingImage = false;
            throw new Error('Failed to create background processor');
          }
          console.log('[BG] ✅ Processor created successfully from URL');
        } catch (createError: any) {
          console.error('[BG] Error creating image processor:', createError);
          if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
            URL.revokeObjectURL(imageUrl);
          }
          this.isSettingImage = false;
          // Re-throw so caller knows it failed and can handle it
          throw createError;
        }
        
        // ✅ CRITICAL FIX: Revoke old blob URL IMMEDIATELY before applying new one
        // This prevents old background from persisting during transition
        if (oldImageBlobUrl && oldImageBlobUrl.startsWith('blob:') && oldImageBlobUrl !== imageUrl) {
          URL.revokeObjectURL(oldImageBlobUrl);
          oldImageBlobUrl = null; // Clear reference
        }
        
        // ✅ CRITICAL FIX: Clear old bgImageUrl reference immediately to prevent persistence
        if (this.bgImageUrl && this.bgImageUrl !== imageUrl && this.bgImageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(this.bgImageUrl);
          this.bgImageUrl = null; // Clear immediately to prevent old background from persisting
        }
        
        // Check if cancelled before setting processor
        if (abortController.signal.aborted) {
          if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
            URL.revokeObjectURL(imageUrl);
          }
          this.isSettingImage = false;
          return;
        }
        
        // ✅ CRITICAL FIX: Store the new blob URL IMMEDIATELY - this keeps it alive while the background is active
        this.bgImageUrl = imageUrl;
        
        // ✅ CRITICAL FIX: Set processor IMMEDIATELY - no requestAnimationFrame delays
        try {
          // Check if cancelled before setting
          if (abortController.signal.aborted) {
            this.processor = null;
            if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
              URL.revokeObjectURL(imageUrl);
            }
            this.bgImageUrl = oldImageBlobUrl;
            this.isSettingImage = false;
            return;
          }
          
          if (!this.track) {
            this.processor = null;
            this.isSettingImage = false;
            return;
          }
          
          // Final check
          const finalTracks = this.track.mediaStream?.getVideoTracks();
          if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
            this.processor = null;
            this.isSettingImage = false;
            return;
          }
          
          if (!processor || typeof processor !== 'object') {
            this.processor = null;
            this.isSettingImage = false;
            return;
          }
          
          // ✅ CRITICAL FIX: Store processor reference and set IMMEDIATELY
          this.processor = processor;
          
          // Set processor IMMEDIATELY - no delays
          const setResult = this.track.setProcessor(processor);
          
          // If setProcessor returns a promise, handle it
          if (setResult && typeof setResult.then === 'function') {
            try {
              await setResult;
              console.log('[BG] ✅ Processor set successfully on track');
              
              // ✅ CRITICAL: Verify processor is actually attached
              const attachedElements = (this.track as any)?.processor || (this.track as any)?._processor;
              if (attachedElements || this.processor) {
                console.log('[BG] ✅ Processor verified as attached to track');
              } else {
                console.warn('[BG] ⚠️ Processor may not be attached - checking track state');
              }
            } catch (setError: any) {
              // ✅ CRITICAL: Log and throw error - don't silently fail
              console.error('[BG] ❌ Failed to set processor on track:', setError);
              console.error('[BG] Error details:', {
                error: setError,
                message: setError?.message,
                stack: setError?.stack,
                trackReady: this.track?.mediaStream?.getVideoTracks()?.[0]?.readyState,
                hasTrack: !!this.track
              });
              this.processor = null;
              if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
                URL.revokeObjectURL(imageUrl);
              }
              this.bgImageUrl = oldImageBlobUrl;
              this.isSettingImage = false;
              throw new Error(`Failed to apply background: ${setError?.message || 'Processor setup failed'}`);
            }
          } else {
            // If setProcessor doesn't return a promise, wait a bit to ensure it's applied
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('[BG] ✅ Processor set (synchronous)');
            
            // Verify processor is attached
            const attachedElements = (this.track as any)?.processor || (this.track as any)?._processor;
            if (attachedElements || this.processor) {
              console.log('[BG] ✅ Processor verified as attached (synchronous)');
            }
          }
          
          // ✅ CRITICAL: Only apply if this is still the pending URL (user didn't click another)
          if (this.pendingImageUrl !== url || !this.isSettingImage) {
            console.log('[BG] ⚠️ URL changed or operation cancelled! Expected:', url, 'Current pending:', this.pendingImageUrl, 'isSettingImage:', this.isSettingImage);
            // Different URL is pending or operation was cancelled - don't apply this one
            this.processor = null;
            if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
              URL.revokeObjectURL(imageUrl);
            }
            this.isSettingImage = false;
            return; // Don't apply - let the new operation handle it
          }
          
          // ✅ CRITICAL: Mark as complete if not cancelled AND this is still the pending URL
          if (!abortController.signal.aborted && this.pendingImageUrl === url && this.isSettingImage) {
            this.currentImageLoadAbortController = null;
            this.isSettingImage = false;
            this.pendingImageUrl = null;
            console.log('[BG] ✅ Image background applied:', url);
          } else {
            // Was cancelled - clean up
            this.processor = null;
            if (imageUrl.startsWith('blob:') && imageUrl !== oldImageBlobUrl) {
              URL.revokeObjectURL(imageUrl);
            }
            this.bgImageUrl = oldImageBlobUrl;
            this.isSettingImage = false;
            if (this.pendingImageUrl === url) {
              this.pendingImageUrl = null;
            }
          }
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
          
          // ✅ CRITICAL FIX: Set processor IMMEDIATELY - no requestAnimationFrame delays
          // Check if cancelled
          if (abortController.signal.aborted) {
            this.processor = null;
            this.isSettingImage = false;
            return;
          }
          
          if (!this.track) {
            this.processor = null;
            this.isSettingImage = false;
            return;
          }
          
          // Final check
          const finalTracks = this.track.mediaStream?.getVideoTracks();
          if (!finalTracks || finalTracks.length === 0 || finalTracks[0].readyState !== 'live') {
            this.processor = null;
            this.isSettingImage = false;
            return;
          }
          
          if (!processor || typeof processor !== 'object') {
            this.processor = null;
            this.isSettingImage = false;
            return;
          }
          
          // ✅ CRITICAL FIX: Store processor reference and set IMMEDIATELY
          this.processor = processor;
          
          // Set processor IMMEDIATELY - no delays
          const setResult = this.track.setProcessor(processor);
          
          // If setProcessor returns a promise, handle it
          if (setResult && typeof setResult.then === 'function') {
            try {
              await setResult;
              console.log('[BG] ✅ Processor set successfully on track (non-Firebase)');
            } catch (setError: any) {
              // ✅ CRITICAL: Log and throw error - don't silently fail
              console.error('[BG] ❌ Failed to set processor on track (non-Firebase):', setError);
              this.processor = null;
              this.isSettingImage = false;
              throw new Error(`Failed to apply background: ${setError?.message || 'Processor setup failed'}`);
            }
          } else {
            // If setProcessor doesn't return a promise, wait a bit to ensure it's applied
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('[BG] ✅ Processor set (synchronous, non-Firebase)');
          }
          
          // ✅ CRITICAL: Only apply if this is still the pending URL
          if (this.pendingImageUrl !== url || !this.isSettingImage) {
            console.log('[BG] ⚠️ URL changed or operation cancelled (non-Firebase)! Expected:', url, 'Current pending:', this.pendingImageUrl, 'isSettingImage:', this.isSettingImage);
            this.processor = null;
            this.isSettingImage = false;
            return; // Don't apply - let the new operation handle it
          }
          
          // ✅ CRITICAL: Mark as complete if not cancelled AND this is still the pending URL
          if (!abortController.signal.aborted && this.pendingImageUrl === url && this.isSettingImage) {
            this.currentImageLoadAbortController = null;
            this.isSettingImage = false;
            this.pendingImageUrl = null;
            console.log('[BG] ✅ Image background applied (non-Firebase):', url);
          } else {
            // Was cancelled - clean up
            this.processor = null;
            this.isSettingImage = false;
            if (this.pendingImageUrl === url) {
              this.pendingImageUrl = null;
            }
          }
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
        // ✅ CRITICAL: Only reset if this was the operation for this URL
        if (this.pendingImageUrl === url || !this.pendingImageUrl) {
          this.isSettingImage = false;
          this.currentImageLoadAbortController = null;
          if (this.pendingImageUrl === url) {
            this.pendingImageUrl = null;
          }
        }
        // If different URL is pending, don't reset - let new operation proceed
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

