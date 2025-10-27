// BackgroundEngine.ts
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import type { LocalVideoTrack } from 'livekit-client';

class BackgroundEngine {
  private processor: any | null = null;
  private track: LocalVideoTrack | null = null;

  // keep strong refs so GC doesn't kill sources
  private vidEl: HTMLVideoElement | null = null;
  private canvasContexts: CanvasRenderingContext2D[] = [];

  async init(track: LocalVideoTrack) {
    this.track = track;
    
    // Check WebGL support before initializing
    if (!this.checkWebGLSupport()) {
      console.warn('[BG] WebGL not supported, background effects may not work properly');
    }
    
    console.log('[BG] Track initialized');
  }

  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return gl !== null;
    } catch (e) {
      console.error('[BG] WebGL check failed:', e);
      return false;
    }
  }

  async setNone() {
    if (!this.track) {
      console.warn('[BG] No track available for setNone');
      return;
    }
    
    try {
      this.track.setProcessor(undefined as any);
      this.releaseSources();
      console.log('[BG] mode: none');
    } catch (error) {
      console.error('[BG] Error in setNone:', error);
    }
  }

  async setBlur(blurRadius = 8) {
    if (!this.track) {
      console.warn('[BG] No track available for setBlur');
      return;
    }
    
    this.releaseSources();
    
    try {
      this.processor = BackgroundBlur(blurRadius);
      // Don't call init() - BackgroundBlur handles initialization internally
      this.track.setProcessor(this.processor);
      console.log('[BG] mode: blur');
    } catch (error) {
      console.error('[BG] Error setting blur:', error);
      // Fallback to no processor if blur fails
      try {
        this.track.setProcessor(undefined as any);
      } catch (fallbackError) {
        console.error('[BG] Error in blur fallback:', fallbackError);
      }
    }
  }

  // ---------- IMAGE BACKGROUND ----------
  async setImage(url: string) {
    if (!this.track) {
      console.warn('[BG] No track available for setImage');
      return;
    }
    
    try {
      // Preload with CORS so WebGL can sample it
      const img = new Image();
      img.crossOrigin = 'anonymous'; // important for Firebase Storage URLs
      img.decoding = 'async';
      const loaded = new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = (e) => rej(e);
      });
      img.src = url;
      await loaded;

      this.vidEl = null;            // ensure video not referenced

      this.processor = VirtualBackground(url);
      // Don't call init() - VirtualBackground handles initialization internally
      this.track.setProcessor(this.processor);
      console.log('[BG] mode: image', url);
    } catch (error) {
      console.error('[BG] Error setting image:', error);
      // Fallback to no processor if image fails
      try {
        this.track.setProcessor(undefined as any);
      } catch (fallbackError) {
        console.error('[BG] Error in image fallback:', fallbackError);
      }
    }
  }

  // ---------- VIDEO BACKGROUND ----------
  async setVideo(url: string) {
    if (!this.track) {
      console.warn('[BG] No track available for setVideo');
      return;
    }
    
    try {
      // Create a dedicated element; do NOT attach/remove it from DOM.
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.loop = true;
      v.playsInline = true;

      // Load enough data before enabling
      const ready = new Promise<void>((res) => {
        const onReady = () => { v.removeEventListener('loadeddata', onReady); res(); };
        v.addEventListener('loadeddata', onReady, { once: true });
      });
      v.src = url;
      await ready;

      // Autoplay (ignore InterruptedError if user gesture not present)
      try { await v.play(); } catch {}

      this.vidEl = v;               // keep strong ref

      // For video backgrounds, we'll use a different approach
      // Since VirtualBackground only supports images, we'll create a canvas-based solution
      // that captures frames from the video and uses them as background
      
      // Create a canvas to capture video frames
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Track canvas context for cleanup
        this.canvasContexts.push(ctx);
        // Start capturing video frames
        const captureFrame = () => {
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            
            // Convert canvas to blob and create object URL
            canvas.toBlob((blob) => {
              if (blob) {
                const imageUrl = URL.createObjectURL(blob);
                
                // Use the captured frame as background image
                this.processor = VirtualBackground(imageUrl);
                // Don't call init() - VirtualBackground handles initialization internally
                this.track?.setProcessor(this.processor);
                
                // Clean up the previous object URL
                setTimeout(() => {
                  URL.revokeObjectURL(imageUrl);
                }, 100);
              }
            }, 'image/jpeg', 0.8);
          }
          
          // Continue capturing frames
          requestAnimationFrame(captureFrame);
        };
        
        // Start capturing when video is ready
        v.addEventListener('loadeddata', () => {
          captureFrame();
        });
        
        // If video is already loaded, start immediately
        if (v.readyState >= 2) {
          captureFrame();
        }
        
        console.log('[BG] mode: video', url);
      }
    } catch (error) {
      console.error('[BG] Error setting video:', error);
      // Fallback to no processor if video fails
      try {
        this.track.setProcessor(undefined as any);
      } catch (fallbackError) {
        console.error('[BG] Error in video fallback:', fallbackError);
      }
    }
  }

  // ---------- helpers ----------
  private releaseSources() {
    if (this.vidEl) {
      try { this.vidEl.pause(); this.vidEl.src = ''; } catch {}
    }
    this.vidEl = null;
    
    // Clean up canvas contexts to prevent WebGL context leaks
    this.canvasContexts.forEach(ctx => {
      try {
        const canvas = ctx.canvas;
        canvas.width = 0;
        canvas.height = 0;
      } catch (e) {
        console.warn('[BG] Error cleaning up canvas context:', e);
      }
    });
    this.canvasContexts = [];
  }
}

export const backgroundEngine = new BackgroundEngine();