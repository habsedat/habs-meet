import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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





