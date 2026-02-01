// Canonical app URL for Auth0 authentication
// This URL must be whitelisted in Auth0 Application Settings
// Using preview URL for beta testing without publishing
export const CANONICAL_APP_URL = 'https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app';

/**
 * Detects if the device is a mobile device using userAgent
 */
export const isMobileDevice = (): boolean => {
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Detects if the app is running inside an iframe (e.g., Lovable editor preview)
 */
export const isInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch (e) {
    // If we can't access window.top due to cross-origin restrictions, we're in an iframe
    return true;
  }
};

/**
 * Determines if redirect-based auth should be used instead of popup
 * Returns true for mobile devices OR when running in an iframe
 */
export const shouldUseRedirect = (): boolean => {
  return isMobileDevice() || isInIframe();
};

/**
 * Opens the canonical app URL in a new tab
 * Used when Auth0 login needs to happen outside the iframe
 */
export const openAuthInNewTab = (path: string = '/') => {
  const url = `${CANONICAL_APP_URL}${path}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

// BroadcastChannel for cross-tab authentication sync
export const AUTH_CHANNEL_NAME = 'kairos-auth-channel';

/**
 * Broadcasts authentication success to other tabs/windows
 * Called from the auth tab after successful login
 */
export const broadcastAuthSuccess = (destination: string = '/onboarding/results') => {
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    channel.postMessage({ type: 'AUTH_SUCCESS', destination });
    channel.close();
    console.log('[AuthRedirect] Broadcasted auth success to:', destination);
  } catch (error) {
    console.warn('[AuthRedirect] BroadcastChannel not supported:', error);
  }
};

/**
 * Listens for authentication success from other tabs
 * Returns cleanup function to stop listening
 */
export const listenForAuthSuccess = (callback: (destination: string) => void): (() => void) => {
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data?.type === 'AUTH_SUCCESS') {
        console.log('[AuthRedirect] Received auth success, navigating to:', event.data.destination);
        callback(event.data.destination || '/onboarding/results');
      }
    };
    return () => {
      channel.close();
    };
  } catch (error) {
    console.warn('[AuthRedirect] BroadcastChannel not supported:', error);
    return () => {};
  }
};

/**
 * Attempts to close the current window/tab
 * Only works if the window was opened programmatically
 */
export const closeAuthWindow = () => {
  try {
    window.close();
    // Fallback: if window.close() doesn't work, show a message
    setTimeout(() => {
      console.log('[AuthRedirect] Window close may not have worked - user should close manually');
    }, 500);
  } catch (error) {
    console.warn('[AuthRedirect] Could not close window:', error);
  }
};
