// Canonical app URL for Auth0 authentication
// This URL must be whitelisted in Auth0 Application Settings
// Using preview URL for beta testing without publishing
export const CANONICAL_APP_URL = 'https://id-preview--5bd59ee0-ab8c-409f-bc56-72fe64069377.lovable.app';

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
 * Opens the canonical app URL in a new tab
 * Used when Auth0 login needs to happen outside the iframe
 */
export const openAuthInNewTab = (path: string = '/') => {
  const url = `${CANONICAL_APP_URL}${path}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};
