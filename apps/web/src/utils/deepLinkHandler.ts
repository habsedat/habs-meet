// Deep Link Handler for PWA
// Ensures links open in the installed app instead of browser

export const isStandalone = (): boolean => {
  // Check if running in standalone mode (installed PWA)
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://') ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
};

export const isInstalled = (): Promise<boolean> => {
  return new Promise((resolve) => {
    // Check if running in standalone mode
    if (isStandalone()) {
      resolve(true);
      return;
    }
    
    // Check if service worker is registered and active
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        resolve(registration.active !== null);
      }).catch(() => {
        resolve(false);
      });
    } else {
      resolve(false);
    }
  });
};

export const checkIfAppInstalled = async (): Promise<boolean> => {
  // Check localStorage for installation status
  const installStatus = localStorage.getItem('pwa-installed');
  if (installStatus === 'true') {
    return true;
  }
  
  // Check if in standalone mode
  if (isStandalone()) {
    localStorage.setItem('pwa-installed', 'true');
    return true;
  }
  
  // Check service worker
  const installed = await isInstalled();
  if (installed) {
    localStorage.setItem('pwa-installed', 'true');
  }
  
  return installed;
};

export const handleDeepLink = (url: string): void => {
  // If app is installed and running in standalone mode, navigate internally
  if (isStandalone()) {
    const appUrl = new URL(url);
    const path = appUrl.pathname + appUrl.search + appUrl.hash;
    
    // Use React Router navigation if available, otherwise use window.location
    if (window.location.pathname !== path) {
      window.location.href = path;
    }
    return;
  }
  
  // If not in standalone mode, check if we should prompt to open in app
  // For now, just navigate normally - the browser will handle it
  window.location.href = url;
};

// Intercept clicks on external links that match our domain
export const setupDeepLinkInterception = (): void => {
  // Only set up if not already in standalone mode
  if (isStandalone()) {
    return;
  }

  document.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const link = target.closest('a');
    
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!href) return;
    
    // Check if link is to our domain
    try {
      const url = new URL(href, window.location.origin);
      const isOurDomain = url.hostname === window.location.hostname ||
                         url.hostname === 'habs-meet-dev.web.app' ||
                         url.hostname === 'habs-meet-dev.firebaseapp.com';
      
      if (isOurDomain) {
        // Check if PWA is installed
        const installed = await checkIfAppInstalled();
        if (installed) {
          // Prevent default navigation
          event.preventDefault();
          
          // Try to open in app
          const path = url.pathname + url.search + url.hash;
          
          // If service worker is available, use it to navigate
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'NAVIGATE',
              url: path
            });
          }
          
          window.location.href = path;
        }
      }
    } catch (e) {
      // Invalid URL, let it handle normally
    }
  }, true); // Use capture phase
};

// Handle launch from external link
export const handleAppLaunch = (): void => {
  // Check if we were launched from an external link
  const urlParams = new URLSearchParams(window.location.search);
  const returnUrl = urlParams.get('returnUrl');
  const link = urlParams.get('link');
  const url = urlParams.get('url');
  
  // Handle different link formats
  let targetUrl: string | null = null;
  
  if (returnUrl) {
    targetUrl = returnUrl;
  } else if (link) {
    targetUrl = decodeURIComponent(link);
  } else if (url) {
    targetUrl = decodeURIComponent(url);
  }
  
  if (targetUrl && isStandalone()) {
    // We're in the app, navigate to the target URL
    try {
      const parsedUrl = new URL(targetUrl);
      const path = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
      window.location.href = path;
    } catch (e) {
      // If it's a relative path, use it directly
      if (targetUrl.startsWith('/')) {
        window.location.href = targetUrl;
      } else {
        console.error('Invalid target URL:', targetUrl);
      }
    }
  }
};

// Redirect to app if installed, otherwise stay in browser
export const redirectToAppIfInstalled = async (url: string): Promise<boolean> => {
  const installed = await checkIfAppInstalled();
  
  if (installed && !isStandalone()) {
    // App is installed but we're in browser - try to open in app
    // This uses the manifest's handle_links: "preferred" setting
    const appUrl = new URL(url);
    const path = appUrl.pathname + appUrl.search + appUrl.hash;
    
    // Try to use the Launch Handler API if available
    if ('launchQueue' in window) {
      (window as any).launchQueue.setConsumer((launchParams: any) => {
        if (launchParams.targetURL) {
          window.location.href = launchParams.targetURL;
        }
      });
    }
    
    // Navigate to the path - browser should handle opening in app
    window.location.href = path;
    return true;
  }
  
  return false;
};


