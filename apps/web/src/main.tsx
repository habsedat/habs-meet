import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupDeepLinkInterception, handleAppLaunch } from './utils/deepLinkHandler';

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  
  // Handle background engine initialization errors gracefully
  if (error?.message?.includes('Cannot read properties of undefined') && 
      (error?.message?.includes('init') || error?.stack?.includes('BackgroundEngine'))) {
    console.warn('[BG] Background engine initialization issue (non-critical):', error?.message);
    event.preventDefault(); // Prevent console error for background engine init issues
    return;
  }
  
  // Silently handle LiveKit processor init errors - they're race conditions
  if (error?.message?.includes('Cannot read properties of undefined') && 
      error?.stack?.includes('livekit-client')) {
    event.preventDefault(); // Prevent console error
    return;
  }
  
  // Log other unhandled rejections for debugging
  if (error?.stack?.includes('livekit-client') && 
      (error?.message?.includes('init') || error?.message?.includes('undefined'))) {
    event.preventDefault(); // Prevent console error for LiveKit init issues
    return;
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Setup deep link handling
setupDeepLinkInterception();
handleAppLaunch();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered successfully:', registration.scope);
        
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, prompt user to refresh
                console.log('[PWA] New version available. Please refresh the page.');
                // Optionally show a notification to the user
                if (window.confirm('A new version of Habs Meet is available. Would you like to refresh?')) {
                  window.location.reload();
                }
              }
            });
          }
        });
      })
      .catch((error) => {
        console.log('[PWA] Service Worker registration failed:', error);
      });
  });
  
  // Handle service worker updates
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}





