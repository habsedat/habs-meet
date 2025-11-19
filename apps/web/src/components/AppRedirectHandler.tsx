import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { checkIfAppInstalled, isStandalone } from '../utils/deepLinkHandler';

/**
 * Component that handles redirecting to the app if installed
 * This runs on pages that can be accessed via external links (join, invite, etc.)
 */
const AppRedirectHandler: React.FC = () => {
  const location = useLocation();
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Only run redirect logic once and if we're in the browser (not already in app)
    if (hasChecked || isStandalone()) {
      // Already checked or already in app, no redirect needed
      return;
    }

    // Check if this is a join/invite/room link that should open in app
    const shouldRedirectToApp = 
      location.pathname.startsWith('/join/') ||
      location.pathname.startsWith('/invite/') ||
      location.pathname.startsWith('/room/') ||
      location.pathname.startsWith('/pre-meeting') ||
      location.pathname.startsWith('/waiting-room');

    if (shouldRedirectToApp) {
      setHasChecked(true);
      
      // Check if app is installed
      checkIfAppInstalled().then((installed) => {
        if (installed) {
          // App is installed - the browser should automatically open in app
          // due to manifest.json handle_links: "preferred" setting
          // But we can try to help by using the Launch Handler API if available
          
          // Use Launch Handler API (Chrome/Edge 110+)
          if ('launchQueue' in window && 'LaunchParams' in window) {
            try {
              (window as any).launchQueue.setConsumer((launchParams: any) => {
                if (launchParams.targetURL) {
                  // Browser will handle opening in app
                  console.log('[AppRedirectHandler] Launch Handler API active');
                }
              });
            } catch (e) {
              console.log('[AppRedirectHandler] Launch Handler API not available');
            }
          }
          
          // For iOS, we can try to use a custom URL scheme redirect
          // But since we're a PWA, the manifest should handle it
          console.log('[AppRedirectHandler] App is installed, browser should open in app');
        } else {
          console.log('[AppRedirectHandler] App not installed, continuing in browser');
        }
      });
    }
  }, [location.pathname, hasChecked]);

  return null; // This component doesn't render anything
};

export default AppRedirectHandler;

