// Canonical app URL for Auth0 authentication
export const CANONICAL_APP_URL = 'https://app.mindmodule.me';

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
    return true;
  }
};
