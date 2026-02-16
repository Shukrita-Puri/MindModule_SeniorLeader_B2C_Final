// Canonical app URL for Auth0 authentication
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
    return true;
  }
};
