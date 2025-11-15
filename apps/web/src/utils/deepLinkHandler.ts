// Deep Link Handler for PWA
// Ensures links open in the installed app instead of browser

export const isStandalone = (): boolean => {
  // Check if running in standalone mode (installed PWA)
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
};

export const isInstalled = (): boolean => {
  // Check if PWA is installed
  if (isStandalone()) {
    return true;
  }
  
  // Check if service worker is registered (indicates PWA capability)
  if ('serviceWorker' in navigator) {
    return navigator.serviceWorker.controller !== null;
  }
  
  return false;
};

export const handleDeepLink = (url: string): void => {
  // If app is installed and running in standalone mode, navigate internally
  if (isStandalone()) {
    const appUrl = new URL(url);
    const path = appUrl.pathname + appUrl.search;
    
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

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const link = target.closest('a');
    
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!href) return;
    
    // Check if link is to our domain
    try {
      const url = new URL(href, window.location.origin);
      const isOurDomain = url.hostname === window.location.hostname ||
                         url.hostname === 'habs-meet-dev.web.app';
      
      if (isOurDomain) {
        // Check if PWA is installed
        if (isInstalled()) {
          // Prevent default navigation
          event.preventDefault();
          
          // Try to open in app
          const path = url.pathname + url.search + url.hash;
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
  
  if (returnUrl && isStandalone()) {
    // We're in the app, navigate to the return URL
    try {
      const url = new URL(returnUrl);
      const path = url.pathname + url.search + url.hash;
      window.location.href = path;
    } catch (e) {
      console.error('Invalid return URL:', returnUrl);
    }
  }
};


