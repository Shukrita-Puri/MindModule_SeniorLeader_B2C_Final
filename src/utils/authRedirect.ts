// Canonical app URL for Auth0 authentication
// This URL must be whitelisted in Auth0 Application Settings
export const CANONICAL_APP_URL = 'https://ibrvatszexahdqwejahc.lovable.app';

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
